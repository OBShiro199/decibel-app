'use client';
// Quick call: type a name or a number and dial. Used by the top-bar popover and
// the sidebar widget. Every call still goes through a People record, so the
// DNC / TPS checks, the call log and the recording all work as usual.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Delete, Phone } from 'lucide-react';
import { useState } from 'react';
import { useApp } from '@/lib/app-context';
import { useDebounced, useStages } from '@/lib/hooks';
import { supabase } from '@/lib/supabase/client';
import { PHASE_LABEL } from '@/lib/twilio/call-machine';
import type { Person } from '@/lib/types';
import { cn, formatPhone, normalizePhone } from '@/lib/utils';
import { ConnectionDot } from '@/components/softphone/connection-dot';
import { useSoftphoneActions, useSoftphoneStatus } from '@/components/softphone/provider';
import { Button } from '@/components/ui/button';
import { Avatar } from '@/components/ui/display';
import { Popover } from '@/components/ui/overlay';

type Match = Pick<Person, 'id' | 'full_name' | 'mobile_e164' | 'tps_status' | 'do_not_call'> & { company: { name: string } | null };
const looksLikeNumber = (v: string) => /^[+\d][\d\s()-]{5,}$/.test(v.trim());

function useQuickDial(onDone?: () => void) {
  const { workspace, user } = useApp();
  const softphone = useSoftphoneActions();
  const phone = useSoftphoneStatus();
  const { data: stages } = useStages();
  const qc = useQueryClient();
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const term = useDebounced(value.trim(), 200);
  const number = looksLikeNumber(value) ? normalizePhone(value) : null;

  const { data: matches } = useQuery({
    queryKey: ['people', 'quick-dial', workspace.id, term],
    enabled: term.length > 1,
    queryFn: async () => {
      const e164 = looksLikeNumber(term) ? normalizePhone(term) : null;
      let q = supabase().from('people').select('id,full_name,mobile_e164,tps_status,do_not_call,company:tenant_companies(name)').eq('workspace_id', workspace.id).not('mobile_e164', 'is', null).limit(5);
      q = e164 ? q.like('mobile_e164', `${e164}%`) : q.ilike('full_name', `%${term.replace(/[%,()]/g, ' ')}%`);
      return ((await q).data ?? []) as unknown as Match[];
    },
  });

  const call = async (person?: Match) => {
    setError(null);
    setBusy(true);
    try {
      let target: Match | null = person ?? null;
      if (!target) {
        if (!number) throw new Error(looksLikeNumber(value) ? 'That number does not look valid.' : 'Pick a person, or type a full phone number.');
        const db = supabase();
        const { data: found } = await db.from('people').select('id,full_name,mobile_e164,tps_status,do_not_call,company:tenant_companies(name)').eq('workspace_id', workspace.id).eq('mobile_e164', number).maybeSingle();
        target = found as unknown as Match | null;
        if (!target) {
          // a new number becomes a People record so the call is logged against something
          const { data: created, error: insertError } = await db
            .from('people')
            .insert({ workspace_id: workspace.id, first_name: formatPhone(number), mobile_e164: number, source: 'manual', created_by: user.id, owner_id: user.id, stage_id: stages?.[0]?.id ?? null })
            .select('id,full_name,mobile_e164,tps_status,do_not_call')
            .single();
          if (insertError) throw new Error(insertError.message);
          target = { ...(created as Omit<Match, 'company'>), company: null };
          void qc.invalidateQueries({ queryKey: ['people'] });
        }
      }
      const started = await softphone.callPerson(target);
      if (started) {
        setValue('');
        onDone?.();
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return { value, setValue, matches: term.length > 1 ? (matches ?? []) : [], number, busy, error, call, live: phone.live, softphone, phone };
}

function Matches({ items, onPick }: { items: Match[]; onPick: (m: Match) => void }) {
  if (!items.length) return null;
  return (
    <ul className="border border-white-800 bg-white-100">
      {items.map((m) => {
        const blocked = m.do_not_call || m.tps_status === 'tps_listed' || m.tps_status === 'ctps_listed';
        return (
          <li key={m.id} className="border-b border-rule last:border-b-0">
            <button disabled={blocked} onClick={() => onPick(m)} className="flex h-10 w-full items-center gap-2 px-2 text-left hover:bg-panel disabled:opacity-50">
              <Avatar name={m.full_name} size={20} />
              <span className="min-w-0 flex-1 truncate">{m.full_name}</span>
              <span className="shrink-0 tabular-nums text-[11px] text-white-900">{blocked ? 'BLOCKED' : formatPhone(m.mobile_e164)}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '+', '0'];

/** Top bar: a Call button that opens a dial pad. */
export function QuickCallButton() {
  return (
    <Popover
      align="right"
      className="w-[280px] p-3"
      trigger={({ toggle }) => (
        <Button size="compact" variant="primary" onClick={toggle} aria-label="Quick call">
          <Phone size={14} strokeWidth={1.5} />
          <span className="max-md:hidden">Call</span>
        </Button>
      )}
    >
      {(close) => <DialPad onDone={close} />}
    </Popover>
  );
}

export function DialPad({ onDone }: { onDone?: () => void }) {
  const d = useQuickDial(onDone);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void d.call();
      }}
      className="flex flex-col gap-2"
    >
      <p className="t-label">[ quick call ]</p>
      <input
        autoFocus
        value={d.value}
        onChange={(e) => d.setValue(e.target.value)}
        placeholder="Name or number"
        aria-label="Name or number"
        className="control h-11 tabular-nums text-[16px]"
      />
      <Matches items={d.matches} onPick={(m) => void d.call(m)} />
      <div className="grid grid-cols-3 gap-px border border-white-800 bg-white-800">
        {KEYS.map((k) => (
          <button key={k} type="button" onClick={() => d.setValue((looksLikeNumber(d.value) || !d.value ? d.value : '') + k)} className="h-10 bg-white-100 tabular-nums text-[15px] hover:bg-panel active:bg-white-300">
            {k}
          </button>
        ))}
        <button type="button" aria-label="Delete" onClick={() => d.setValue(d.value.slice(0, -1))} className="flex h-10 items-center justify-center bg-white-100 text-black-700 hover:bg-panel">
          <Delete size={16} strokeWidth={1.5} />
        </button>
      </div>
      {d.error ? <p className="t-caption text-danger-700" role="alert">{d.error}</p> : null}
      <Button type="submit" variant="primary" loading={d.busy} disabled={d.live || !d.value.trim()}>
        <Phone size={14} strokeWidth={1.5} /> {d.live ? 'On a call' : d.number ? `Call ${formatPhone(d.number)}` : 'Call'}
      </Button>
    </form>
  );
}

/** Sidebar: a rectangular widget pinned above the profile row. */
export function SidebarCallWidget() {
  const d = useQuickDial();
  return (
    <div className="mx-2 mb-2 border border-white-800 bg-white-100 p-2.5 max-[1100px]:hidden">
      <div className="flex items-center justify-between">
        <p className="t-label">[ quick call ]</p>
        {d.live ? (
          <span className="flex w-[104px] items-center gap-1.5 tabular-nums text-[10px] uppercase tracking-[0.06em] text-white-900">
            <span className="pulse-dot bg-accent-500" style={{ width: 6, height: 6 }} />
            {PHASE_LABEL[d.phone.phase]}
          </span>
        ) : (
          <ConnectionDot />
        )}
      </div>
      {d.live && d.phone.calleeName ? (
        <div className="mt-2">
          <p className="truncate font-medium">{d.phone.calleeName}</p>
          <p className="truncate tabular-nums text-[11px] text-white-900">{formatPhone(d.phone.calleeNumber)}</p>
          <Button variant="danger" size="compact" className="mt-2 w-full" onClick={d.softphone.hangUp}>
            Hang up
          </Button>
        </div>
      ) : (
        <form
          className="relative mt-2 flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void d.call();
          }}
        >
          {d.matches.length ? (
            <div className="absolute bottom-full left-0 right-0 z-menu mb-1 shadow-popover">
              <Matches items={d.matches} onPick={(m) => void d.call(m)} />
            </div>
          ) : null}
          <input value={d.value} onChange={(e) => d.setValue(e.target.value)} placeholder="Name or number" aria-label="Name or number to call" className="control h-8 tabular-nums text-[12.5px]" />
          {d.error ? <p className="t-caption text-danger-700" role="alert">{d.error}</p> : null}
          <Button type="submit" variant="primary" size="compact" className="w-full" loading={d.busy} disabled={!d.value.trim()}>
            <Phone size={14} strokeWidth={1.5} /> Call
          </Button>
        </form>
      )}
    </div>
  );
}
