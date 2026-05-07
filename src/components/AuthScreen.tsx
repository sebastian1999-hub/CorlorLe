import { useState } from 'react'
import type { FormEvent } from 'react'
import { UNAUTHORIZED_ACCESS_MESSAGE, verifyAuthorizedUser } from '../lib/authGuard'
import { supabase } from '../lib/supabase'

type AuthScreenProps = {
  externalError?: string | null
}

export function AuthScreen({ externalError = null }: AuthScreenProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setLoading(true)
    setError(null)

    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (signInError) {
      setError(signInError.message)
      setLoading(false)
      return
    }

    try {
      const userId = data.session?.user.id

      if (!userId) {
        await supabase.auth.signOut()
        setError('No se pudo validar tu sesion. Intentalo otra vez.')
        setLoading(false)
        return
      }

      const authorizedUsername = await verifyAuthorizedUser(userId)

      if (!authorizedUsername) {
        await supabase.auth.signOut()
        setError(UNAUTHORIZED_ACCESS_MESSAGE)
      }
    } catch {
      await supabase.auth.signOut()
      setError('No se pudo validar tu acceso. Intentalo otra vez.')
    }

    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_20%_20%,#ffeec2,transparent_45%),radial-gradient(circle_at_80%_10%,#ffc9b6,transparent_35%),linear-gradient(135deg,#f8fafc,#f3f0e8)] px-4 py-8 text-zinc-900">
      <div className="mx-auto w-full max-w-md">
        <section className="rounded-3xl border border-zinc-900/10 bg-zinc-950 p-8 text-zinc-100 shadow-xl">
          <h1 className="mb-2 text-2xl font-black text-amber-200">Acceso privado</h1>
          <p className="mb-6 text-sm text-zinc-300">
            El registro esta desactivado de forma permanente. Solo pueden entrar usuarios autorizados por el admin.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block text-sm">
              Correo
              <input
                required
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 outline-none ring-amber-300 transition focus:ring"
                placeholder="tu@email.com"
              />
            </label>

            <label className="block text-sm">
              Contrasena
              <input
                required
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                minLength={6}
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 outline-none ring-amber-300 transition focus:ring"
                placeholder="Minimo 6 caracteres"
              />
            </label>

            {(error || externalError) && (
              <p className="rounded-lg bg-red-500/20 p-2 text-sm text-red-200">
                {error ?? externalError}
              </p>
            )}

            <button
              disabled={loading}
              type="submit"
              className="w-full rounded-lg bg-amber-300 px-4 py-3 font-semibold text-zinc-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? 'Procesando...' : 'Entrar'}
            </button>
          </form>
        </section>
      </div>
    </div>
  )
}
