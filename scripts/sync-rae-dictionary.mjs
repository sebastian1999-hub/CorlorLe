import fs from 'node:fs'
import path from 'node:path'

const RAE_BASE_URL = 'https://rae-api.com'
const MIN_WORD_LENGTH = 3
const MAX_WORD_LENGTH = 11
const UPSERT_BATCH_SIZE = Number(process.env.RAE_UPSERT_BATCH_SIZE || 200)
const TARGET_WORDS = Number(process.env.RAE_TARGET_WORDS || 1200)
const MAX_RANDOM_ATTEMPTS = Number(process.env.RAE_MAX_RANDOM_ATTEMPTS || TARGET_WORDS * 35)
const REQUEST_DELAY_MS = Number(process.env.RAE_REQUEST_DELAY_MS || 220)

function loadEnvFromFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return
  }

  const raw = fs.readFileSync(filePath, 'utf8')
  const lines = raw.split(/\r?\n/)
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) {
      continue
    }

    const index = trimmed.indexOf('=')
    if (index <= 0) {
      continue
    }

    const key = trimmed.slice(0, index).trim()
    const value = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, '')
    if (!process.env[key]) {
      process.env[key] = value
    }
  }
}

const projectRoot = process.cwd()
loadEnvFromFile(path.join(projectRoot, '.env'))
loadEnvFromFile(path.join(projectRoot, '.env.local'))

const resolvedSupabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const resolvedServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const resolvedRaeApiKey = process.env.RAE_API_KEY

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function normalizeWord(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
}

function isWordUseful(normalizedWord) {
  return normalizedWord.length >= MIN_WORD_LENGTH && normalizedWord.length <= MAX_WORD_LENGTH
}

function sanitizeClue(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/\.{2,}/g, '.')
    .trim()
    .replace(/[.;,:\s]+$/, '')
}

function shouldRejectClue(clue, normalizedWord) {
  if (!clue || clue.length < 8 || clue.length > 180) {
    return true
  }

  const normalizedClue = normalizeWord(clue)
  if (!normalizedClue) {
    return true
  }

  // Avoid trivially giving away the answer in the clue text.
  if (normalizedClue.includes(normalizedWord)) {
    return true
  }

  return false
}

function pickClueFromEntry(entry) {
  const meanings = Array.isArray(entry?.meanings) ? entry.meanings : []
  const normalizedWord = normalizeWord(entry?.word)

  for (const meaning of meanings) {
    const senses = Array.isArray(meaning?.senses) ? meaning.senses : []
    for (const sense of senses) {
      const clueCandidate = sanitizeClue(sense?.description || sense?.raw || '')
      if (!shouldRejectClue(clueCandidate, normalizedWord)) {
        return {
          clue: clueCandidate,
          category: sense?.category || null,
        }
      }
    }
  }

  return null
}

async function fetchJson(pathname, params = {}, retries = 4) {
  const url = new URL(pathname, RAE_BASE_URL)

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value))
    }
  }

  if (resolvedRaeApiKey) {
    url.searchParams.set('api_key', resolvedRaeApiKey)
  }

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const response = await fetch(url)

    if (response.ok) {
      return response.json()
    }

    if (response.status === 429 && !resolvedRaeApiKey) {
      throw new Error('RAE API rate limit reached without RAE_API_KEY. Add RAE_API_KEY to continue bulk ingestion.')
    }

    const isRetryable = response.status === 429 || response.status >= 500
    if (!isRetryable || attempt === retries) {
      const text = await response.text()
      throw new Error(`RAE request failed (${response.status}) for ${url.pathname}: ${text.slice(0, 200)}`)
    }

    const retryAfter = Number(response.headers.get('retry-after') || '0')
    const backoffMs = retryAfter > 0 ? Math.min(retryAfter * 1000, 30000) : (attempt + 1) * 700
    console.warn(`Retrying ${url.pathname} in ${backoffMs}ms (attempt ${attempt + 1}/${retries})`)
    await sleep(backoffMs)
  }

  throw new Error('Unexpected request state')
}

async function fetchRandomWord() {
  const payload = await fetchJson('/api/random', {
    min_length: MIN_WORD_LENGTH,
    max_length: MAX_WORD_LENGTH,
  })

  return payload?.data?.word || null
}

async function fetchWordDetail(word) {
  const payload = await fetchJson(`/api/words/${encodeURIComponent(word)}`)

  if (!payload?.ok || !payload?.data?.word) {
    return null
  }

  const sourceWord = String(payload.data.word)
  const normalizedWord = normalizeWord(sourceWord)
  if (!isWordUseful(normalizedWord)) {
    return null
  }

  const clueResult = pickClueFromEntry(payload.data)
  if (!clueResult) {
    return null
  }

  return {
    word: normalizedWord,
    clue: clueResult.clue,
    category: clueResult.category,
    source: 'rae-api',
    source_word: sourceWord,
    is_active: true,
  }
}

async function collectCandidateWords() {
  const candidates = new Set()
  let attempts = 0

  while (candidates.size < TARGET_WORDS && attempts < MAX_RANDOM_ATTEMPTS) {
    attempts += 1

    try {
      const randomWord = await fetchRandomWord()
      const normalizedWord = normalizeWord(randomWord)
      if (isWordUseful(normalizedWord)) {
        candidates.add(normalizedWord)
      }
    } catch (error) {
      console.warn(`Random fetch failed at attempt ${attempts}:`, error.message)
      if (String(error.message).includes('RAE API rate limit reached without RAE_API_KEY')) {
        throw error
      }
    }

    if (attempts % 50 === 0) {
      console.log(`Random scan: ${attempts} requests, ${candidates.size} unique candidates`)
    }

    await sleep(REQUEST_DELAY_MS)
  }

  return [...candidates]
}

async function buildDictionaryRows(candidates) {
  const rows = []

  for (let index = 0; index < candidates.length; index += 1) {
    const word = candidates[index]

    try {
      const detail = await fetchWordDetail(word)
      if (detail) {
        rows.push(detail)
      }
    } catch (error) {
      console.warn(`Detail fetch failed for ${word}:`, error.message)
    }

    if ((index + 1) % 50 === 0) {
      console.log(`Detail enrichment: ${index + 1}/${candidates.length}, accepted ${rows.length}`)
    }

    await sleep(REQUEST_DELAY_MS)
  }

  return rows
}

async function upsertRows(supabaseUrl, serviceRoleKey, rows) {
  let inserted = 0

  for (let start = 0; start < rows.length; start += UPSERT_BATCH_SIZE) {
    const batch = rows.slice(start, start + UPSERT_BATCH_SIZE)

    const restUrl = `${supabaseUrl.replace(/\/$/, '')}/rest/v1/crossword_dictionary?on_conflict=word`
    const response = await fetch(restUrl, {
      method: 'POST',
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(batch),
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Supabase upsert failed (${response.status}): ${text.slice(0, 300)}`)
    }

    inserted += batch.length
    console.log(`Upsert progress: ${inserted}/${rows.length}`)
  }
}

async function run() {
  if (!resolvedSupabaseUrl || !resolvedServiceRoleKey) {
    throw new Error('Missing SUPABASE_URL (or VITE_SUPABASE_URL) and/or SUPABASE_SERVICE_ROLE_KEY')
  }

  console.log(`Target words: ${TARGET_WORDS}`)
  console.log(`Rate control delay: ${REQUEST_DELAY_MS} ms`)

  const candidates = await collectCandidateWords()
  console.log(`Collected ${candidates.length} normalized candidates from random endpoint`)

  if (!candidates.length) {
    throw new Error('No candidates collected. Check API limits/key and try again.')
  }

  const rows = await buildDictionaryRows(candidates)
  console.log(`Prepared ${rows.length} rows with valid clues`)

  if (!rows.length) {
    throw new Error('No valid entries to upsert after clue-quality filtering')
  }

  await upsertRows(resolvedSupabaseUrl, resolvedServiceRoleKey, rows)

  console.log(`Done. Upserted ${rows.length} entries into public.crossword_dictionary`)
}

run().catch((error) => {
  console.error('RAE dictionary sync failed')
  console.error(error)
  process.exit(1)
})
