// Power dialler sessions: the run itself (lead order, position, per-lead results) is stored
// in public.dialler_sessions so a rep can close the tab and carry on later. Calls, outcomes
// and notes are stored as usual in public.calls / people; this only remembers the run.
import { supabase } from '@/lib/supabase/client';
import { PERSON_SELECT } from '@/lib/queries';
import type { CallOutcome, Person } from '@/lib/types';
import { personLead, practiceLeads, type DialLead } from '@/lib/dialler';

export interface LeadResult {
  state: 'pending' | 'calling' | 'done' | 'skipped';
  outcome?: CallOutcome;
  note?: string;
  reason?: string;
  seconds?: number;
  /** the calls row for this attempt, so an interrupted call can be reconciled on resume */
  callId?: string;
}

export interface DiallerSession {
  id: string;
  source: 'practice' | 'today' | 'list';
  list_id: string | null;
  label: string;
  test_number: string | null;
  lead_ids: string[];
  position: number;
  results: Record<string, LeadResult>;
  status: 'active' | 'paused' | 'finished';
  started_at: string;
  updated_at: string;
}

const COLUMNS = 'id,source,list_id,label,test_number,lead_ids,position,results,status,started_at,updated_at';

/** The rep's most recent unfinished run, optionally for one list. */
export async function findOpenSession(workspaceId: string, userId: string, listId?: string): Promise<DiallerSession | null> {
  let q = supabase().from('dialler_sessions').select(COLUMNS).eq('workspace_id', workspaceId).eq('user_id', userId).neq('status', 'finished');
  if (listId) q = q.eq('list_id', listId);
  const { data, error } = await q.order('updated_at', { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return (data as DiallerSession | null) ?? null;
}

export async function createSession(input: {
  workspaceId: string;
  userId: string;
  source: DiallerSession['source'];
  listId: string | null;
  label: string;
  testNumber: string | null;
  leadIds: string[];
}): Promise<string> {
  const { data, error } = await supabase()
    .from('dialler_sessions')
    .insert({
      workspace_id: input.workspaceId,
      user_id: input.userId,
      source: input.source,
      list_id: input.listId,
      label: input.label,
      test_number: input.testNumber,
      lead_ids: input.leadIds,
    })
    .select('id')
    .single();
  if (error) throw error;
  return (data as { id: string }).id;
}

export async function saveSession(id: string, patch: { position: number; results: Record<string, LeadResult>; status: DiallerSession['status'] }) {
  const { error } = await supabase()
    .from('dialler_sessions')
    .update({ ...patch, finished_at: patch.status === 'finished' ? new Date().toISOString() : null })
    .eq('id', id);
  if (error) throw error;
}

/** Rebuilds the run's leads in their original order; people deleted since are left out. */
export async function sessionLeads(s: DiallerSession): Promise<DialLead[]> {
  if (s.source === 'practice') {
    const all = practiceLeads(s.test_number ?? '');
    return s.lead_ids.map((id) => all.find((l) => l.id === id)).filter(Boolean) as DialLead[];
  }
  if (!s.lead_ids.length) return [];
  const { data, error } = await supabase().from('people').select(PERSON_SELECT).in('id', s.lead_ids);
  if (error) throw error;
  const byId = new Map(((data ?? []) as unknown as Person[]).map((p) => [p.id, p]));
  return s.lead_ids.map((id) => byId.get(id)).filter(Boolean).map((p) => personLead(p as Person));
}

/**
 * A lead left "calling" means the tab closed mid-call or mid wrap-up. Check the calls row:
 * an outcome already logged is kept; a call that ended without one gets the same default the
 * wrap-up would have used (connected if anyone talked, otherwise no answer) and it is saved;
 * anything else goes back to pending so it is called again.
 */
export async function reconcileResults(results: Record<string, LeadResult>): Promise<Record<string, LeadResult>> {
  const open = Object.entries(results).filter(([, r]) => r.state === 'calling');
  if (!open.length) return results;
  const ids = open.map(([, r]) => r.callId).filter(Boolean) as string[];
  const rows = ids.length
    ? (((await supabase().from('calls').select('id,outcome,ended_at,talk_seconds,duration_seconds,notes').in('id', ids)).data ?? []) as {
        id: string;
        outcome: CallOutcome | null;
        ended_at: string | null;
        talk_seconds: number | null;
        duration_seconds: number | null;
        notes: string | null;
      }[])
    : [];
  const byId = new Map(rows.map((r) => [r.id, r]));
  const next = { ...results };
  for (const [leadId, r] of open) {
    const row = r.callId ? byId.get(r.callId) : undefined;
    if (row?.outcome) {
      next[leadId] = { ...r, state: 'done', outcome: row.outcome, note: row.notes ?? r.note, seconds: row.duration_seconds ?? r.seconds };
    } else if (row?.ended_at) {
      const outcome: CallOutcome = (row.talk_seconds ?? 0) > 0 ? 'connected' : 'no_answer';
      const { error } = await supabase().rpc('log_call_outcome', { p_call_id: row.id, p_outcome: outcome, p_notes: row.notes ?? null });
      next[leadId] = error ? { state: 'pending' } : { ...r, state: 'done', outcome, note: row.notes ?? r.note, seconds: row.duration_seconds ?? r.seconds };
    } else {
      next[leadId] = { state: 'pending' };
    }
  }
  return next;
}
