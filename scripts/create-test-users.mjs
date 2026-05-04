import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

const TEST_USERS = [
  { username: 'Irene', email: 'irene@gmail.com' },
  { username: 'Natalia', email: 'natalia@gmail.com' },
  { username: 'Alejandro', email: 'alejandro@gmail.com' },
  { username: 'Pablo', email: 'pablo@gmail.com' },
  { username: 'Raul', email: 'raul@gmail.com' },
  { username: 'Lucas', email: 'lucas@gmail.com' },
  { username: 'Sebas', email: 'sebas@gmail.com' },
  { username: 'Alvaro', email: 'alvaro@gmail.com' },
  { username: 'Alicia', email: 'alicia@gmail.com' },
  { username: 'Jordi', email: 'jordi@gmail.com' },
  { username: 'Ester', email: 'ester@gmail.com' },
  { username: 'Lara', email: 'lara@gmail.com' },
  { username: 'Prodi', email: 'prodi@gmail.com' },
  { username: 'Santiago', email: 'santiago@gmail.com' },
  { username: 'Nora', email: 'nora@gmail.com' },
  { username: 'Silvia', email: 'silvia@gmail.com' },
  { username: 'Paula', email: 'paula@gmail.com' },
  { username: 'Admin', email: 'admin@gmail.com', role: 'admin' },
]

const parseEnvFile = (filePath) => {
  if (!fs.existsSync(filePath)) {
    return {}
  }

  const text = fs.readFileSync(filePath, 'utf8')
  const lines = text.split(/\r?\n/)
  const values = {}

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) {
      continue
    }

    const separator = trimmed.indexOf('=')
    if (separator === -1) {
      continue
    }

    const key = trimmed.slice(0, separator).trim()
    const rawValue = trimmed.slice(separator + 1).trim()
    values[key] = rawValue.replace(/^['\"]|['\"]$/g, '')
  }

  return values
}

const rootDir = process.cwd()
const envFromFiles = {
  ...parseEnvFile(path.join(rootDir, '.env')),
  ...parseEnvFile(path.join(rootDir, '.env.local')),
}

const env = {
  ...envFromFiles,
  ...process.env,
}

const supabaseUrl = env.VITE_SUPABASE_URL
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY
const defaultPassword = env.TEST_USERS_DEFAULT_PASSWORD || 'ColorMemory123!'

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Faltan variables: VITE_SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

const listAllUsers = async () => {
  const all = []
  let page = 1
  const perPage = 200

  while (true) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage })
    if (error) {
      throw error
    }

    all.push(...(data.users || []))

    if (!data.users || data.users.length < perPage) {
      break
    }
    page += 1
  }

  return all
}

const ensureUser = async (user) => {
  const users = await listAllUsers()

  const existingByUsername = users.find(
    (item) =>
      typeof item.user_metadata?.username === 'string' &&
      item.user_metadata.username.toLowerCase() === user.username.toLowerCase(),
  )

  if (existingByUsername) {
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(existingByUsername.id, {
      email: user.email,
      password: defaultPassword,
      email_confirm: true,
      user_metadata: {
        ...(existingByUsername.user_metadata || {}),
        username: user.username,
      },
      app_metadata: {
        ...(existingByUsername.app_metadata || {}),
        role: user.role || 'player',
      },
    })

    if (updateError) {
      throw updateError
    }

    return existingByUsername.id
  }

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email: user.email,
    password: defaultPassword,
    email_confirm: true,
    user_metadata: {
      username: user.username,
    },
    app_metadata: {
      role: user.role || 'player',
    },
  })

  if (!error && data.user) {
    return data.user.id
  }

  const alreadyExists =
    error?.message?.toLowerCase().includes('already') ||
    error?.code === 'email_exists' ||
    error?.status === 422

  if (!alreadyExists) {
    throw error
  }

  const latestUsers = await listAllUsers()
  const existing = latestUsers.find((item) => item.email?.toLowerCase() === user.email.toLowerCase())

  if (!existing) {
    throw new Error(`No se encontro usuario existente para ${user.email}`)
  }

  const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(existing.id, {
    password: defaultPassword,
    email_confirm: true,
    user_metadata: {
      ...(existing.user_metadata || {}),
      username: user.username,
    },
    app_metadata: {
      ...(existing.app_metadata || {}),
      role: user.role || 'player',
    },
  })

  if (updateError) {
    throw updateError
  }

  return existing.id
}

const run = async () => {
  console.log('Creando usuarios de prueba en Supabase...')

  for (const user of TEST_USERS) {
    const userId = await ensureUser(user)

    const { error: profileError } = await supabaseAdmin.from('profiles').upsert(
      {
        id: userId,
        username: user.username,
      },
      { onConflict: 'id' },
    )

    if (profileError) {
      throw profileError
    }

    console.log(`OK: ${user.username} (${user.email})`)
  }

  console.log('Listo. Password comun de pruebas:')
  console.log(defaultPassword)
}

run().catch((error) => {
  console.error('Error creando usuarios de prueba:')
  console.error(error)
  process.exit(1)
})
