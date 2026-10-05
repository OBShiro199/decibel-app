'use client';
// Quick call: type a name or a number and dial, plus the sidebar's phone toggle. Every call still goes through a People record, so the
// DNC / TPS checks, the call log and the recording all work as usual.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Delete, Phone } from 'lucide-react';
import { useState } from 'react';
import { useApp } from '@/lib/app-context';
import { useDebounced, useStages } from '@/lib/hooks';
import { supabase } from '@/lib/supabase/client';
import { PHASE_LABEL } from '@/lib/twilio/call-machine';
import type { Person } from '@/lib/types';
import { formatPhone } from '@/lib/utils';
import { DEFAULT_DIAL_COUNTRY, toE164, type DialCountry } from '@/lib/phone';
import { PhoneInput } from '@/components/ui/phone-input';
import { useSoftphoneActions, useSoftphoneStatus } from '@/components/softphone/provider';
import { Button } from '@/components/ui/button';
import { Avatar } from '@/components/ui/display';
import { Popover } from '@/components/ui/overlay';

type Match = Pick<Person, 'id' | 'full_name' | 'mobile_e164' | 'tps_status' | 'do_not_call'> & { company: { name: string } | null };
const looksLikeNumber = (v: string) => /^[+\d][\d\s()-]{5,}$/.test(v.trim());

function useQuickDial(onDone?: () => void, country: DialCountry = DEFAULT_DIAL_COUNTRY) {
  const { workspace, user } = useApp();
  const softphone = useSoftphoneActions();
  const phone = useSoftphoneStatus();
  const { data: stages } = useStages();
  const qc = useQueryClient();
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const term = useDebounced(value.trim(), 200);
  // numbers are read in the context of the chosen country: 07..., 44..., +44... all work
  const number = looksLikeNumber(value) ? toE164(value, country) : null;

  const { data: matches } = useQuery({
    queryKey: ['people', 'quick-dial', workspace.id, term, country.code],
    enabled: term.length > 1,
    queryFn: async () => {
      const e164 = looksLikeNumber(term) ? toE164(term, country) : null;
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
    <ul className="rounded-md border border-white-800 bg-white-100">
      {items.map((m) => {
        const blocked = m.do_not_call || m.tps_status === 'tps_listed' || m.tps_status === 'ctps_listed';
        return (
          <li key={m.id} className="border-b border-rule last:border-b-0">
            <button disabled={blocked} onClick={() => onPick(m)} className="flex h-10 w-full items-center gap-2 px-2 text-left hover:bg-panel disabled:opacity-50">
              <Avatar name={m.full_name} size={20} />
              <span className="min-w-0 flex-1 truncate">{m.full_name}</span>
              <span className="shrink-0 tabular-nums text-xs text-white-900">{blocked ? 'Blocked' : formatPhone(m.mobile_e164)}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '+', '0'];

/** Top bar: opens or closes the softphone panel over the app. Shows the live phase during a call. */
export function SoftphoneToggle() {
  const sp = useSoftphoneActions();
  const phone = useSoftphoneStatus();
  const on = phone.open && !phone.minimised;
  return (
    <Button size="compact" variant={phone.live || on ? 'primary' : 'outline'} onClick={sp.togglePanel} aria-pressed={on} aria-label="Toggle softphone" className="w-full">
      <Phone size={14} strokeWidth={1.5} />
      <span className="max-[1100px]:hidden">{phone.live ? PHASE_LABEL[phone.phase] : on ? 'Close phone' : 'Open phone'}</span>
    </Button>
  );
}

/** Popover dial pad (kept for compact layouts). */
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
  const [country, setCountry] = useState<DialCountry>(DEFAULT_DIAL_COUNTRY);
  const d = useQuickDial(onDone, country);
  const press = (k: string) => d.setValue((looksLikeNumber(d.value) || !d.value ? d.value : '') + k);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void d.call();
      }}
      className="flex flex-col gap-3"
    >
      <PhoneInput
        autoFocus
        value={d.value}
        onChange={d.setValue}
        country={country}
        onCountryChange={setCountry}
        placeholder="Name or number"
        aria-label="Name or number"
        inputMode="text"
        className="h-9"
      />
      <Matches items={d.matches} onPick={(m) => void d.call(m)} />
      {/* spaced keys with the app's 6px corners, not a boxed grid */}
      <div className="grid grid-cols-3 gap-1.5">
        {KEYS.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => press(k)}
            className="h-9 rounded-sm border border-white-800 bg-white-100 font-medium tabular-nums text-black-400 transition-[background-color,border-color,scale] duration-150 hover:border-btnborder hover:bg-white-200 active:scale-[0.96]"
          >
            {k}
          </button>
        ))}
        <button
          type="button"
          aria-label="Delete"
          onClick={() => d.setValue(d.value.slice(0, -1))}
          className="flex h-9 items-center justify-center rounded-sm border border-white-800 bg-white-100 text-black-700 transition-[background-color,border-color,scale] duration-150 hover:border-btnborder hover:bg-white-200 active:scale-[0.96]"
        >
          <Delete size={16} strokeWidth={1.5} />
        </button>
      </div>
      {d.error ? <p className="text-danger-700" role="alert">{d.error}</p> : null}
      <Button type="submit" variant="primary" className="h-9 w-full" loading={d.busy} disabled={d.live || !d.value.trim()}>
        <Phone size={14} strokeWidth={1.5} /> {d.live ? 'On a call' : d.number ? `Call ${formatPhone(d.number)}` : 'Call'}
      </Button>
    </form>
  );
}

