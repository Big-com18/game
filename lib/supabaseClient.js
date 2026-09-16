'use client';

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // Don't throw at import time (breaks the build) — surface a clear runtime warning instead.
  console.warn(
    '[supabase] NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY belum di-set. ' +
    'Copy .env.local.example jadi .env.local lalu isi dengan kredensial project Supabase kamu.'
  );
}

export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '', {
  realtime: { params: { eventsPerSecond: 10 } },
});
