'use client';
import { track } from '@/lib/analytics';
import { supabase } from '@/lib/supabase/client';
import type { Person } from '@/lib/types';

export const REVEAL_ERRORS: Record<string, { message: string; href?: string; label?: string }> = {
  insufficient_credits: { message: 'You are out of credits.', href: '/app/settings/billing', label: 'Buy credits' },
  daily_limit_reached: { message: 'You have reached your daily reveal allowance. Ask an admin to raise it.' },
  daily_reveal_limit: { message: 'This workspace has reached its daily reveal limit. It resets at midnight.' },
  forbidden: { message: 'You are not a member of this workspace.' },
  'contact not found': { message: 'That contact is no longer in the database.' },
};

export function revealError(message: string) {
  const key = Object.keys(REVEAL_ERRORS).find((k) => message.includes(k));
  return key ? REVEAL_ERRORS[key] : { message };
}

/**
 * Reveals database contacts into the workspace's People (1 credit each, free if
 * already revealed). Stops at the first hard failure such as running out of credits.
 */
export async function revealContacts(
  workspaceId: string,
  contactIds: string[],
  opts: { listId?: string | null; from: 'search' | 'list' | 'today' } = { from: 'search' },
): Promise<{ people: Person[]; error: ReturnType<typeof revealError> | null }> {
  const people: Person[] = [];
  for (const id of contactIds) {
    const { data, error } = await supabase().rpc('reveal_contact', { p_workspace_id: workspaceId, p_contact_id: id, p_list_id: opts.listId ?? null });
    if (error) return { people, error: revealError(error.message) };
    people.push(data as Person);
    track('contact_revealed', { from: opts.from });
  }
  return { people, error: null };
}
