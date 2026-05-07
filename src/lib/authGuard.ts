import { supabase } from './supabase'

export const UNAUTHORIZED_ACCESS_MESSAGE =
  'Tu cuenta no esta autorizada en este juego. Pide al admin que te registre primero.'

export const verifyAuthorizedUser = async (userId: string): Promise<string | null> => {
  const { data, error } = await supabase
    .from('profiles')
    .select('username')
    .eq('id', userId)
    .maybeSingle()

  if (error) {
    throw error
  }

  return data?.username ?? null
}
