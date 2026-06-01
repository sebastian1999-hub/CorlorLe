import { useEffect, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

type ProfileTabProps = {
  session: Session
  viewerUsername: string
  profileUser: {
    userId: string
    username: string
    avatarUrl?: string
  }
}

type ProfileView = 'records' | 'achievements'

type ProfileRecords = {
  bestScore: number | null
  worstScore: number | null
  bestColorPercent: number | null
  worstColorPercent: number | null
  firstPlacesCount: number
}

const AVATAR_BUCKET = 'avatars'

const getFileExtension = (fileName: string): string => {
  const lower = fileName.toLowerCase()
  if (lower.endsWith('.png')) return 'png'
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'jpg'
  if (lower.endsWith('.webp')) return 'webp'
  if (lower.endsWith('.gif')) return 'gif'
  return 'png'
}

const formatValue = (value: number | null, formatter: (num: number) => string): string => {
  if (value === null) {
    return '--'
  }
  return formatter(value)
}

export function ProfileTab({ session, viewerUsername, profileUser }: ProfileTabProps) {
  const [profileView, setProfileView] = useState<ProfileView>('records')
  const [avatarDataUrl, setAvatarDataUrl] = useState<string | null>(null)
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [avatarError, setAvatarError] = useState<string | null>(null)
  const [records, setRecords] = useState<ProfileRecords>({
    bestScore: null,
    worstScore: null,
    bestColorPercent: null,
    worstColorPercent: null,
    firstPlacesCount: 0,
  })
  const [recordsLoading, setRecordsLoading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const isOwnProfile = profileUser.userId === session.user.id

  useEffect(() => {
    let isMounted = true

    const loadAvatar = async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('avatar_url')
        .eq('id', profileUser.userId)
        .maybeSingle()

      if (!isMounted) {
        return
      }

      if (error) {
        setAvatarDataUrl(profileUser.avatarUrl ?? null)
        return
      }

      setAvatarDataUrl(data?.avatar_url ?? profileUser.avatarUrl ?? null)
    }

    void loadAvatar()

    return () => {
      isMounted = false
    }
  }, [session.user.id])

  useEffect(() => {
    let isMounted = true

    const loadProfileRecords = async () => {
      setRecordsLoading(true)

      try {
        const [userAttemptsResponse, allAttemptsResponse] = await Promise.all([
          supabase
            .from('attempts')
            .select('score,error')
            .eq('user_id', profileUser.userId),
          supabase
            .from('attempts')
            .select('date,user_id,score'),
        ])

        if (!isMounted) {
          return
        }

        if (userAttemptsResponse.error || allAttemptsResponse.error) {
          setRecords({
            bestScore: null,
            worstScore: null,
            bestColorPercent: null,
            worstColorPercent: null,
            firstPlacesCount: 0,
          })
          return
        }

        const userAttempts = (userAttemptsResponse.data ?? []).filter(
          (attempt) => Number.isFinite(attempt.score) && Number.isFinite(attempt.error),
        )

        const bestScore = userAttempts.length
          ? Math.max(...userAttempts.map((attempt) => attempt.score))
          : null

        const worstScore = userAttempts.length
          ? Math.min(...userAttempts.map((attempt) => attempt.score))
          : null

        const accuracies = userAttempts.map((attempt) => Math.max(0, 100 - attempt.error))
        const bestColorPercent = accuracies.length ? Math.max(...accuracies) : null
        const worstColorPercent = accuracies.length ? Math.min(...accuracies) : null

        const attemptsByDate = new Map<string, Array<{ userId: string; score: number }>>()
        for (const attempt of allAttemptsResponse.data ?? []) {
          if (!attempt.date || !Number.isFinite(attempt.score)) {
            continue
          }
          const list = attemptsByDate.get(attempt.date) ?? []
          list.push({ userId: attempt.user_id, score: attempt.score })
          attemptsByDate.set(attempt.date, list)
        }

        let firstPlacesCount = 0
        for (const dayAttempts of attemptsByDate.values()) {
          if (!dayAttempts.length) {
            continue
          }
          const maxScore = Math.max(...dayAttempts.map((attempt) => attempt.score))
          const userLeads = dayAttempts.some(
            (attempt) => attempt.userId === profileUser.userId && attempt.score === maxScore,
          )
          if (userLeads) {
            firstPlacesCount += 1
          }
        }

        setRecords({
          bestScore,
          worstScore,
          bestColorPercent,
          worstColorPercent,
          firstPlacesCount,
        })
      } finally {
        if (isMounted) {
          setRecordsLoading(false)
        }
      }
    }

    void loadProfileRecords()

    return () => {
      isMounted = false
    }
  }, [profileUser.userId])

  const handleAvatarClick = () => {
    if (!isOwnProfile) {
      return
    }
    fileInputRef.current?.click()
  }

  const handleAvatarChange: React.ChangeEventHandler<HTMLInputElement> = (event) => {
    if (!isOwnProfile) {
      return
    }

    const selectedFile = event.target.files?.[0]

    if (!selectedFile) {
      return
    }

    setAvatarError(null)

    if (!selectedFile.type.startsWith('image/')) {
      setAvatarError('Selecciona una imagen valida.')
      event.currentTarget.value = ''
      return
    }

    const maxBytes = 2 * 1024 * 1024
    if (selectedFile.size > maxBytes) {
      setAvatarError('La imagen supera 2MB.')
      event.currentTarget.value = ''
      return
    }

    const uploadAvatar = async () => {
      setAvatarUploading(true)

      try {
        const extension = getFileExtension(selectedFile.name)
        const filePath = `${profileUser.userId}/avatar.${extension}`

        const { error: uploadError } = await supabase.storage
          .from(AVATAR_BUCKET)
          .upload(filePath, selectedFile, {
            upsert: true,
            contentType: selectedFile.type,
          })

        if (uploadError) {
          setAvatarError('No se pudo subir la foto.')
          return
        }

        const { data: publicUrlData } = supabase.storage
          .from(AVATAR_BUCKET)
          .getPublicUrl(filePath)

        const publicUrl = publicUrlData.publicUrl
        const { error: updateError } = await supabase
          .from('profiles')
          .update({ avatar_url: publicUrl })
          .eq('id', profileUser.userId)

        if (updateError) {
          setAvatarError('No se pudo guardar la foto en el perfil.')
          return
        }

        setAvatarDataUrl(`${publicUrl}?t=${Date.now()}`)
      } finally {
        setAvatarUploading(false)
      }
    }

    void uploadAvatar()
    event.currentTarget.value = ''
  }

  return (
    <section className="rounded-3xl border border-zinc-900/10 bg-white/85 p-4 shadow-lg backdrop-blur sm:p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleAvatarClick}
            disabled={avatarUploading || !isOwnProfile}
            className="group relative h-16 w-16 overflow-hidden rounded-xl border-2 border-dashed border-zinc-300 bg-zinc-100 sm:h-20 sm:w-20"
            title={isOwnProfile ? 'Cambiar foto' : `Perfil de ${profileUser.username}`}
          >
            {avatarDataUrl ? (
              <img src={avatarDataUrl} alt="Avatar de perfil" className="h-full w-full object-cover" />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-xs font-semibold text-zinc-500">Foto</span>
            )}
            {isOwnProfile && (
              <span className="pointer-events-none absolute inset-0 flex items-end justify-center bg-zinc-900/0 pb-1 text-[10px] font-black uppercase tracking-wide text-white opacity-0 transition group-hover:bg-zinc-900/55 group-hover:opacity-100">
                {avatarUploading ? 'Subiendo...' : 'Cambiar'}
              </span>
            )}
          </button>
          {isOwnProfile && (
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleAvatarChange}
              className="hidden"
            />
          )}
          <div>
            <h2 className="text-xl font-black text-zinc-900 sm:text-2xl">Perfil</h2>
            <p className="text-sm font-semibold text-zinc-600">{profileUser.username}</p>
            <p className="text-xs text-zinc-500">ID: {profileUser.userId.slice(0, 8)}</p>
            {!isOwnProfile && (
              <p className="text-xs text-zinc-500">Viendo como {viewerUsername}</p>
            )}
            {avatarError && <p className="text-xs font-semibold text-red-600">{avatarError}</p>}
          </div>
        </div>
      </div>

      <div className="mb-4 inline-flex rounded-xl border border-zinc-200 bg-zinc-50 p-1">
        <button
          type="button"
          onClick={() => setProfileView('records')}
          className={`rounded-lg px-3 py-1 text-xs font-black transition ${profileView === 'records' ? 'bg-zinc-900 text-white' : 'text-zinc-600 hover:bg-white'}`}
        >
          Records personales
        </button>
        <button
          type="button"
          onClick={() => setProfileView('achievements')}
          className={`rounded-lg px-3 py-1 text-xs font-black transition ${profileView === 'achievements' ? 'bg-zinc-900 text-white' : 'text-zinc-600 hover:bg-white'}`}
        >
          Logros desbloqueados
        </button>
      </div>

      {profileView === 'records' ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <article className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
            <p className="text-xs font-black uppercase tracking-wide text-zinc-500">Mejor puntuacion</p>
            <p className="mt-2 text-2xl font-black text-zinc-900">{formatValue(records.bestScore, (val) => `${val.toFixed(0)} pts`)}</p>
            <p className="mt-1 text-xs text-zinc-500">Tu partida con mas puntos.</p>
          </article>

          <article className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
            <p className="text-xs font-black uppercase tracking-wide text-zinc-500">Veces liderando tabla</p>
            <p className="mt-2 text-2xl font-black text-zinc-900">{records.firstPlacesCount}</p>
            <p className="mt-1 text-xs text-zinc-500">Dias en los que cerraste con la mayor puntuacion.</p>
          </article>

          <article className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
            <p className="text-xs font-black uppercase tracking-wide text-zinc-500">Mayor porcentaje color</p>
            <p className="mt-2 text-2xl font-black text-zinc-900">{formatValue(records.bestColorPercent, (val) => `${val.toFixed(2)}%`)}</p>
            <p className="mt-1 text-xs text-zinc-500">Tu mayor precision en una ronda.</p>
          </article>

          <article className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
            <p className="text-xs font-black uppercase tracking-wide text-zinc-500">Peor porcentaje color</p>
            <p className="mt-2 text-2xl font-black text-zinc-900">{formatValue(records.worstColorPercent, (val) => `${val.toFixed(2)}%`)}</p>
            <p className="mt-1 text-xs text-zinc-500">Tu menor precision registrada.</p>
          </article>

          <article className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 sm:col-span-2 lg:col-span-1">
            <p className="text-xs font-black uppercase tracking-wide text-zinc-500">Peor puntuacion</p>
            <p className="mt-2 text-2xl font-black text-zinc-900">{formatValue(records.worstScore, (val) => `${val.toFixed(0)} pts`)}</p>
            <p className="mt-1 text-xs text-zinc-500">La ronda con menos puntos.</p>
          </article>

          {recordsLoading && (
            <article className="rounded-2xl border border-dashed border-zinc-300 bg-white p-4 sm:col-span-2 lg:col-span-3">
              <p className="text-sm font-semibold text-zinc-500">Actualizando records personales...</p>
            </article>
          )}
        </div>
      ) : (
        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
          <p className="text-sm font-black text-zinc-800">Logros desbloqueados</p>
          <p className="mt-2 text-sm text-zinc-600">
            Esta seccion mostrara todos los logros que vayas desbloqueando en el futuro.
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-xl border border-dashed border-zinc-300 bg-white p-3 text-xs font-semibold text-zinc-500">Primer logro (proximamente)</div>
            <div className="rounded-xl border border-dashed border-zinc-300 bg-white p-3 text-xs font-semibold text-zinc-500">Racha diaria (proximamente)</div>
            <div className="rounded-xl border border-dashed border-zinc-300 bg-white p-3 text-xs font-semibold text-zinc-500">Modo extremo (proximamente)</div>
          </div>
        </div>
      )}
    </section>
  )
}
