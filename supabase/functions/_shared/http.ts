import { createClient, type SupabaseClient, type User } from 'npm:@supabase/supabase-js@2';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  });
}

export function fail(error: string, status = 400, extra: Record<string, unknown> = {}): Response {
  return json({ error, ...extra }, status);
}

export function xml(body: string): Response {
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>${body}`, {
    headers: { 'content-type': 'text/xml' },
  });
}

export const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
export const FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`;
export const APP_URL = (Deno.env.get('APP_URL') ?? 'http://localhost:3000').replace(/\/$/, '');

let _admin: SupabaseClient | null = null;
/** Service-role client. Only ever used inside Edge Functions. */
export function admin(): SupabaseClient {
  if (!_admin) {
    _admin = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return _admin;
}

/** Verifies the caller's Supabase JWT and returns the user, or null. */
export async function getUser(req: Request): Promise<User | null> {
  const header = req.headers.get('authorization') ?? '';
  const token = header.replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const { data, error } = await admin().auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}

export type Role = 'owner' | 'admin' | 'member';

export async function getRole(userId: string, workspaceId: string): Promise<Role | null> {
  const { data } = await admin()
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .maybeSingle();
  return (data?.role as Role) ?? null;
}

export const isAdmin = (role: Role | null) => role === 'owner' || role === 'admin';

/**
 * Cron-only functions accept the service role key, the CRON_SECRET env var (if set),
 * or the secret pg_cron sends, which lives in Supabase Vault (see migration 0006).
 */
export async function isCron(req: Request): Promise<boolean> {
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return false;
  if (token === Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')) return true;
  const secret = Deno.env.get('CRON_SECRET');
  if (secret && token === secret) return true;
  const { data } = await admin().rpc('verify_cron_secret', { p_token: token });
  return data === true;
}
