'use client';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useApp } from '@/lib/app-context';
import { listsQuery } from '@/lib/queries';
import { supabase } from '@/lib/supabase/client';
import type { List, Member, PhoneNumber, PipelineStage } from '@/lib/types';

export { PERSON_SELECT } from '@/lib/queries';

export function useMembers() {
  const { workspace } = useApp();
  return useQuery({
    queryKey: ['members', workspace.id],
    queryFn: async () => {
      const { data, error } = await supabase()
        .from('workspace_members')
        .select('workspace_id,user_id,role,daily_credit_limit,joined_at,profile:profiles(id,email,full_name,avatar_url)')
        .eq('workspace_id', workspace.id)
        .order('joined_at');
      if (error) throw error;
      return (data ?? []) as unknown as Member[];
    },
  });
}

/** Lookup of member display names by user id. */
export function useMemberNames(): Record<string, string> {
  const { data } = useMembers();
  const map: Record<string, string> = {};
  (data ?? []).forEach((m) => {
    map[m.user_id] = m.profile?.full_name || m.profile?.email || 'Teammate';
  });
  return map;
}

export function useStages() {
  const { workspace } = useApp();
  return useQuery({
    queryKey: ['stages', workspace.id],
    queryFn: async () => {
      const { data, error } = await supabase().from('pipeline_stages').select('*').eq('workspace_id', workspace.id).order('position');
      if (error) throw error;
      return (data ?? []) as PipelineStage[];
    },
    staleTime: 5 * 60_000,
  });
}

export function useNumbers() {
  const { workspace } = useApp();
  return useQuery({
    queryKey: ['numbers', workspace.id],
    queryFn: async () => {
      const { data, error } = await supabase()
        .from('phone_numbers')
        .select('*')
        .eq('workspace_id', workspace.id)
        .neq('status', 'released')
        .order('created_at');
      if (error) throw error;
      return (data ?? []) as PhoneNumber[];
    },
  });
}

export function useLists() {
  const { workspace, user } = useApp();
  return useQuery(listsQuery(workspace.id, user.id));
}

export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Table keyboard nav (PRD 12.4): j/k move, Enter opens, c calls. Ignores keystrokes while typing. */
export function useTableKeys<T>(rows: T[], handlers: { onOpen?: (row: T) => void; onCall?: (row: T) => void; onSkip?: (row: T) => void; enabled?: boolean }) {
  const [index, setIndex] = useState(0);
  const ref = useRef(handlers);
  ref.current = handlers;
  useEffect(() => {
    if (index > Math.max(0, rows.length - 1)) setIndex(Math.max(0, rows.length - 1));
  }, [rows.length, index]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (ref.current.enabled === false) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const row = rows[index];
      if (e.key === 'j' || e.key === 'ArrowDown') {
        e.preventDefault();
        setIndex((i) => Math.min(rows.length - 1, i + 1));
      } else if (e.key === 'k' || e.key === 'ArrowUp') {
        e.preventDefault();
        setIndex((i) => Math.max(0, i - 1));
      } else if (e.key === 'Enter' && row && ref.current.onOpen) ref.current.onOpen(row);
      else if (e.key === 'c' && row && ref.current.onCall) ref.current.onCall(row);
      else if (e.key === 'n' && row && ref.current.onSkip) {
        ref.current.onSkip(row);
        setIndex((i) => Math.min(rows.length - 1, i + 1));
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [rows, index]);
  return { index, setIndex };
}

/** Rows that fit the element's height, so a table can stay static (no vertical scroll) and paginate instead. */
export function useFitRows(rowHeight = 40, chrome = 36, min = 6) {
  const ref = useRef<HTMLDivElement>(null);
  const [rows, setRows] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setRows(Math.max(min, Math.floor((el.clientHeight - chrome - 14) / rowHeight)));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [rowHeight, chrome, min]);
  return { ref, rows };
}
