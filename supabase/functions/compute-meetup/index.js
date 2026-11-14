// Deno entry point for the compute-meetup Edge Function.
// All logic lives in handler.js so it can be tested in Node.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { createHandler } from './handler.js'

Deno.serve(
  createHandler({
    env: (key) => Deno.env.get(key),
    createClient,
    fetch: (input, init) => fetch(input, init),
  }),
)
