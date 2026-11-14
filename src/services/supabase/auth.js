import { supabase, unwrap } from './client'
import { appOrigin } from '@/services/config'

export async function getSession() {
  return unwrap(await supabase().auth.getSession()).session
}

export function onAuthChange(callback) {
  const { data } = supabase().auth.onAuthStateChange((event, session) => callback(event, session))
  return () => data.subscription.unsubscribe()
}

export async function signInWithPassword(email, password) {
  return unwrap(await supabase().auth.signInWithPassword({ email: email.trim(), password }))
}

export async function signUp({ email, password, fullName }) {
  return unwrap(
    await supabase().auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { full_name: fullName.trim() },
        emailRedirectTo: `${appOrigin()}/home`,
      },
    }),
  )
}

export async function signInWithGoogle(redirectPath = '/home') {
  return unwrap(
    await supabase().auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${appOrigin()}${redirectPath}` },
    }),
  )
}

export async function sendPasswordReset(email) {
  return unwrap(
    await supabase().auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${appOrigin()}/reset-password`,
    }),
  )
}

export async function updatePassword(password) {
  return unwrap(await supabase().auth.updateUser({ password }))
}

export async function signOut() {
  const { error } = await supabase().auth.signOut()
  if (error && !/session/i.test(error.message)) throw error
}

export async function deleteMyAccount() {
  unwrap(await supabase().rpc('delete_my_account'))
  await supabase().auth.signOut({ scope: 'local' })
}
