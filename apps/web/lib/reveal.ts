'use client';
import { track } from '@/lib/analytics';
import { supabase } from '@/lib/supabase/client';
import type { Person } from '@/lib/types';

export const REVEAL_ERRORS: Record<string, { message: string; href?: string; label?: string }> = {
  insufficient_credits: { message: 'You do not have enough credits.', href: '/app/settings/billing', label: 'Credits' },
  daily_limit_reached: { message: 'You have reached your daily reveal allowance. Ask an admin to raise it.' },
  daily_reveal_limit: { message: 'This workspace has reached its daily reveal limit. It resets at midnight.' },
  too_many: { message: 'Reveal at most 500 contacts at a time.' },
  forbidden: { message: 'You are not a member of this workspace.' },
  'list not found': { message: 'That list is no longer available.' },
  'contact not found': { message: 'One of those contacts is no longer in the database.' },
  'lead not found': { message: 'One of those leads is no longer in the database.' },
};

/** Turns a database error into something a person can act on, including the numbers. */
export function revealError(message: string) {
  const key = Object.keys(REVEAL_ERRORS).find((k) => message.includes(k));
  if (!key) return { message };
  const base = REVEAL_ERRORS[key];
  const needs = message.match(/needs (\d+), you have (\d+)/);
  if (key === 'insufficient_credits' && needs) {
    return { ...base, message: `That needs ${Number(needs[1]).toLocaleString('en-GB')} credits and you have ${Number(needs[2]).toLocaleString('en-GB')}. Nothing was charged.` };
  }
  const left = message.match(/(\d+) left today/);
  if ((key === 'daily_reveal_limit' || key === 'daily_limit_reached') && left) {
    return { ...base, message: `${base.message} ${Number(left[1]).toLocaleString('en-GB')} left today, nothing was charged.` };
  }
  return base;
}

/**
 * Reveals database contacts into the workspace's People: 1 credit per newly revealed contact,
 * nothing for ones already revealed. Each call to the database is all or nothing, so a refused
 * request never leaves a half-charged batch behind.
 */
export async function revealContacts(
  workspaceId: string,
  contactIds: string[],
  opts: { listId?: string | null; from: 'search' | 'list' | 'today' } = { from: 'search' },
): Promise<{ people: Person[]; error: ReturnType<typeof revealError> | null }> {
  const people: Person[] = [];
  const CHUNK = 500; // the database accepts at most 500 per call
  for (let i = 0; i < contactIds.length; i += CHUNK) {
    const { data, error } = await supabase().rpc('reveal_contacts', { p_workspace_id: workspaceId, p_contact_ids: contactIds.slice(i, i + CHUNK), p_list_id: opts.listId ?? null });
    if (error) return { people, error: revealError(error.message) };
    people.push(...((data ?? []) as Person[]));
  }
  track('contacts_revealed', { from: opts.from, count: people.length });
  return { people, error: null };
}

/**
 * Reveals leads from the lead database (data_list) into People, optionally into a list:
 * 1 credit per newly revealed lead, nothing for ones this workspace already revealed.
 */
export async function revealLeads(
  workspaceId: string,
  leadIds: string[],
  opts: { listId?: string | null; from: 'search' | 'list' | 'export' } = { from: 'search' },
): Promise<{ people: Person[]; error: ReturnType<typeof revealError> | null }> {
  const people: Person[] = [];
  const CHUNK = 500;
  for (let i = 0; i < leadIds.length; i += CHUNK) {
    const { data, error } = await supabase().rpc('reveal_leads', { p_workspace_id: workspaceId, p_lead_ids: leadIds.slice(i, i + CHUNK), p_list_id: opts.listId ?? null });
    if (error) return { people, error: revealError(error.message) };
    people.push(...((data ?? []) as Person[]));
  }
  track('contacts_revealed', { from: opts.from, count: people.length, source: 'leads' });
  return { people, error: null };
}
