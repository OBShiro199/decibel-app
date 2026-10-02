'use client';
import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

/** Browser Supabase client: publishable (anon) key + the user's JWT. Never the service role. */
export function supabase(): SupabaseClient {
  if (!client) {
    client = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  }
  return client;
}

export class FunctionError extends Error {
  constructor(message: string, public status?: number, public data?: Record<string, unknown>) {
    super(message);
  }
}

/** Invokes an Edge Function and unwraps `{ error }` bodies into thrown FunctionErrors. */
export async function invoke<T = Record<string, unknown>>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase().functions.invoke(name, { body });
  if (error) {
    let message = error.message;
    let status: number | undefined;
    let payload: Record<string, unknown> | undefined;
    const res = (error as { context?: Response }).context;
    if (res && typeof res.json === 'function') {
      status = res.status;
      try {
        payload = await res.json();
        if (payload?.error) message = String(payload.error);
      } catch {
        /* non-JSON error body */
      }
    }
    throw new FunctionError(message, status, payload);
  }
  return data as T;
}
