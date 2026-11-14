import { supabase, unwrap } from './client'
import { AppError } from '@/utils/errors'

// Never select('*') on profiles: email is deliberately not granted.
export const PROFILE_COLUMNS = 'id, full_name, avatar_url, preferred_travel_mode, created_at, updated_at'
export const LOCATION_COLUMNS =
  'id, location_name, latitude, longitude, formatted_address, place_id, is_primary, created_at, updated_at'

export async function getProfile(userId) {
  return unwrap(await supabase().from('profiles').select(PROFILE_COLUMNS).eq('id', userId).maybeSingle())
}

export async function updateProfile(userId, patch) {
  const allowed = {}
  for (const key of ['full_name', 'avatar_url', 'preferred_travel_mode']) {
    if (key in patch) allowed[key] = patch[key]
  }
  return unwrap(
    await supabase().from('profiles').update(allowed).eq('id', userId).select(PROFILE_COLUMNS).single(),
  )
}

// ---------------------------------------------------------------------
// Saved places (private to the owner by RLS)
// ---------------------------------------------------------------------
export async function listLocations() {
  return unwrap(
    await supabase()
      .from('user_locations')
      .select(LOCATION_COLUMNS)
      .order('is_primary', { ascending: false })
      .order('created_at'),
  )
}

function locationPayload(input) {
  return {
    location_name: input.location_name?.trim() || 'Home',
    latitude: input.latitude,
    longitude: input.longitude,
    formatted_address: input.formatted_address || null,
    place_id: input.place_id || null,
    ...(input.is_primary != null ? { is_primary: input.is_primary } : {}),
  }
}

export async function createLocation(input) {
  return unwrap(
    await supabase().from('user_locations').insert(locationPayload(input)).select(LOCATION_COLUMNS).single(),
  )
}

export async function updateLocation(id, input) {
  return unwrap(
    await supabase()
      .from('user_locations')
      .update(locationPayload(input))
      .eq('id', id)
      .select(LOCATION_COLUMNS)
      .single(),
  )
}

export async function setPrimaryLocation(id) {
  return unwrap(
    await supabase().from('user_locations').update({ is_primary: true }).eq('id', id).select(LOCATION_COLUMNS).single(),
  )
}

export async function deleteLocation(id) {
  unwrap(await supabase().from('user_locations').delete().eq('id', id))
}

// ---------------------------------------------------------------------
// Avatars: resized in the browser to a 256px WebP before upload.
// ---------------------------------------------------------------------
export async function resizeImage(file, size = 256) {
  if (!/^image\/(png|jpe?g|webp|gif|heic|heif)$/i.test(file.type)) {
    throw new AppError('invalid_input', 'Choose a PNG, JPEG or WebP image.')
  }
  if (file.size > 15 * 1024 * 1024) throw new AppError('invalid_input', 'That image is larger than 15 MB.')
  const bitmap = await createImageBitmap(file)
  const scale = size / Math.min(bitmap.width, bitmap.height)
  const w = Math.round(bitmap.width * scale)
  const h = Math.round(bitmap.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  ctx.drawImage(bitmap, (size - w) / 2, (size - h) / 2, w, h)
  bitmap.close?.()
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', 0.86))
  if (!blob) throw new AppError('invalid_input', "That image couldn't be processed.")
  return blob
}

/** Upload to avatars/<folder>/<timestamp>.webp and return the public URL. */
export async function uploadAvatar(folder, file) {
  const blob = await resizeImage(file)
  const path = `${folder}/${Date.now()}.webp`
  const bucket = supabase().storage.from('avatars')
  unwrap(await bucket.upload(path, blob, { contentType: 'image/webp', cacheControl: '31536000', upsert: false }))
  return bucket.getPublicUrl(path).data.publicUrl
}
