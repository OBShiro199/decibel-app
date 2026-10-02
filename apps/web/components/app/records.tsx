'use client';
// Shared record-table building blocks: badges, bulk bar, view switcher, dialogs.
import { useQueryClient } from '@tanstack/react-query';
import { Columns3, LayoutGrid, Table2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { track } from '@/lib/analytics';
import { outcomeMeta, TPS_LABEL } from '@/lib/constants';
import { useApp } from '@/lib/app-context';
import { useLists, useMembers, useStages } from '@/lib/hooks';
import { supabase } from '@/lib/supabase/client';
import type { CallOutcome, List, Person, TpsStatus } from '@/lib/types';
import { normalizePhone } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Avatar, Badge, OptionCard } from '@/components/ui/display';
import { Field, Input, Select } from '@/components/ui/form';
import { Dialog, Popover, useToast } from '@/components/ui/overlay';

export function OutcomeBadge({ outcome }: { outcome: CallOutcome | null | undefined }) {
  const meta = outcomeMeta(outcome);
  return meta ? <Badge tone={meta.tone}>{meta.label}</Badge> : <span className="text-white-900">–</span>;
}

export function TpsBadge({ status, doNotCall }: { status: TpsStatus; doNotCall?: boolean }) {
  if (doNotCall) return <Badge tone="danger">Do not call</Badge>;
  if (status === 'tps_listed' || status === 'ctps_listed') return <Badge tone="danger">{TPS_LABEL[status]}</Badge>;
  if (status === 'clear') return <Badge tone="success">TPS clear</Badge>;
  return <Badge>Unchecked</Badge>;
}

export const isBlocked = (p: Pick<Person, 'tps_status' | 'do_not_call' | 'mobile_e164'>) =>
  p.do_not_call || p.tps_status === 'tps_listed' || p.tps_status === 'ctps_listed' || !p.mobile_e164;

export function blockedLabel(p: Pick<Person, 'tps_status' | 'do_not_call' | 'mobile_e164'>): string | null {
  if (p.do_not_call) return 'Do not call';
  if (p.tps_status === 'tps_listed' || p.tps_status === 'ctps_listed') return TPS_LABEL[p.tps_status];
  if (!p.mobile_e164) return 'No mobile';
  return null;
}

export function PersonCell({ name, sub, stacked }: { name: string; sub?: string | null; stacked?: boolean }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <Avatar name={name} size={22} />
      <span className="min-w-0">
        <span className="block truncate font-medium text-black-400">{name}</span>
        {stacked && sub ? <span className="t-caption block truncate text-black-700">{sub}</span> : null}
      </span>
    </span>
  );
}

/** Lets the record page offer previous / next within the table the user came from. */
export function setRecordNav(ids: string[]) {
  try {
    sessionStorage.setItem('decibels.recordNav', JSON.stringify(ids.slice(0, 500)));
  } catch {
    /* storage unavailable */
  }
}
export function getRecordNav(): string[] {
  try {
    return JSON.parse(sessionStorage.getItem('decibels.recordNav') ?? '[]');
  } catch {
    return [];
  }
}

/** Fixed bottom bar on selection: 48px, black-0 fill, white text, radius 8, 16 inset. */
export function BulkBar({ count, onClear, children }: { count: number; onClear: () => void; children: React.ReactNode }) {
  if (!count) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-menu flex justify-center px-4">
      <div className="popover-in pointer-events-auto flex h-12 max-w-full items-center gap-1 overflow-x-auto rounded-md border border-white-800 bg-white-100 px-2 text-black-400 shadow-popover" role="toolbar" aria-label="Bulk actions">
        <span className="tabular whitespace-nowrap px-2 text-sm font-medium">{count} selected</span>
        <span className="mx-1 h-5 w-px shrink-0 bg-white-800" />
        {children}
        <button onClick={onClear} aria-label="Clear selection" className="ml-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-sm text-black-700 hover:bg-white-300">
          <X size={16} strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
}

export function BulkAction({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} className="flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-sm px-2.5 text-sm hover:bg-white-300 disabled:opacity-50">
      {children}
    </button>
  );
}

/** Table / Kanban picker rendered as option cards in a popover. */
export function ViewSwitcher({ view, onChange }: { view: 'table' | 'kanban'; onChange: (v: 'table' | 'kanban') => void }) {
  return (
    <Popover
      className="w-80 p-2"
      trigger={({ toggle }) => (
        <Button size="compact" onClick={toggle} aria-label="Change view">
          {view === 'table' ? <Table2 size={16} strokeWidth={1.5} /> : <Columns3 size={16} strokeWidth={1.5} />}
          {view === 'table' ? 'Table' : 'Kanban'}
        </Button>
      )}
    >
      {(close) => (
        <div className="flex flex-col gap-2" role="radiogroup" aria-label="View">
          <OptionCard icon={Table2} title="Table" description="Organise your records on a table" selected={view === 'table'} onSelect={() => { onChange('table'); close(); }} />
          <OptionCard icon={LayoutGrid} title="Kanban" description="Work people through pipeline stages" selected={view === 'kanban'} onSelect={() => { onChange('kanban'); close(); }} />
        </div>
      )}
    </Popover>
  );
}

/** Pick an existing list or create a new one. Resolves with the list id. */
export function ListPickerDialog({
  open,
  onClose,
  onPick,
  title = 'Add to list',
  createOnly,
  busyLabel,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (listId: string) => Promise<void> | void;
  title?: string;
  createOnly?: boolean;
  busyLabel?: string;
}) {
  const { workspace, user } = useApp();
  const { data: lists } = useLists();
  const qc = useQueryClient();
  const [mode, setMode] = useState<'existing' | 'new'>('existing');
  const [listId, setListId] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setMode(createOnly || !lists?.length ? 'new' : 'existing');
      setListId(lists?.[0]?.id ?? '');
      setName('');
      setError(null);
    }
  }, [open, createOnly, lists]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      let id = listId;
      if (mode === 'new') {
        if (!name.trim()) throw new Error('Give the list a name.');
        const { data, error } = await supabase()
          .from('lists')
          .insert({ workspace_id: workspace.id, name: name.trim(), owner_id: user.id })
          .select('id')
          .single();
        if (error) throw new Error(/duplicate|unique/i.test(error.message) ? 'A list with that name already exists.' : error.message);
        id = (data as Pick<List, 'id'>).id;
        track('list_created', { source: 'picker' });
        void qc.invalidateQueries({ queryKey: ['lists'] });
      }
      if (!id) throw new Error('Pick a list.');
      await onPick(id);
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title={createOnly ? 'Create new list' : title}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        {!createOnly && lists?.length ? (
          <div className="flex gap-2">
            <Button size="compact" variant={mode === 'existing' ? 'primary' : 'outline'} onClick={() => setMode('existing')}>
              Existing list
            </Button>
            <Button size="compact" variant={mode === 'new' ? 'primary' : 'outline'} onClick={() => setMode('new')}>
              New list
            </Button>
          </div>
        ) : null}
        {mode === 'existing' ? (
          <Field label="List" htmlFor="pick-list">
            <Select id="pick-list" value={listId} onChange={(e) => setListId(e.target.value)}>
              {(lists ?? []).map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} ({l.count})
                </option>
              ))}
            </Select>
          </Field>
        ) : (
          <Field label="List name" htmlFor="new-list-name">
            <Input id="new-list-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="London SaaS founders" />
          </Field>
        )}
        {error ? <p className="text-danger-700" role="alert">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" loading={busy}>
            {busy && busyLabel ? busyLabel : mode === 'new' ? 'Create list' : 'Add to list'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export function AddPersonDialog({ open, onClose, listId }: { open: boolean; onClose: () => void; listId?: string | null }) {
  const { workspace, user } = useApp();
  const { data: stages } = useStages();
  const qc = useQueryClient();
  const toast = useToast();
  const blank = { first_name: '', last_name: '', job_title: '', email: '', mobile: '', company: '' };
  const [form, setForm] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof blank) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  useEffect(() => {
    if (open) {
      setForm(blank);
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const mobile = form.mobile.trim() ? normalizePhone(form.mobile) : null;
    if (!form.first_name.trim()) return setError('First name is required.');
    if (form.mobile.trim() && !mobile) return setError('That mobile number does not look valid.');
    setBusy(true);
    setError(null);
    const db = supabase();
    try {
      let companyId: string | null = null;
      if (form.company.trim()) {
        const { data: found } = await db.from('tenant_companies').select('id').eq('workspace_id', workspace.id).ilike('name', form.company.trim()).limit(1).maybeSingle();
        if (found) companyId = found.id;
        else {
          const { data: created, error } = await db.from('tenant_companies').insert({ workspace_id: workspace.id, name: form.company.trim(), owner_id: user.id }).select('id').single();
          if (error) throw error;
          companyId = created.id;
        }
      }
      const { data: person, error } = await db
        .from('people')
        .insert({
          workspace_id: workspace.id,
          first_name: form.first_name.trim(),
          last_name: form.last_name.trim(),
          job_title: form.job_title.trim() || null,
          email: form.email.trim() || null,
          mobile_e164: mobile,
          tenant_company_id: companyId,
          source: 'manual',
          created_by: user.id,
          owner_id: user.id,
          stage_id: stages?.[0]?.id ?? null,
        })
        .select('id')
        .single();
      if (error) throw new Error(/people_ws_mobile_uq/.test(error.message) ? 'Someone with that mobile number already exists.' : error.message);
      if (listId) {
        await db.from('list_members').insert({ list_id: listId, person_id: person.id, workspace_id: workspace.id, added_by: user.id });
        track('person_added_to_list', { source: 'manual' });
      }
      ['people', 'today', 'list', 'lists', 'companies'].forEach((k) => void qc.invalidateQueries({ queryKey: [k] }));
      toast('Person added');
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title="Add person">
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="First name" htmlFor="ap-first">
          <Input id="ap-first" autoFocus value={form.first_name} onChange={set('first_name')} />
        </Field>
        <Field label="Last name" htmlFor="ap-last">
          <Input id="ap-last" value={form.last_name} onChange={set('last_name')} />
        </Field>
        <Field label="Job title" htmlFor="ap-title">
          <Input id="ap-title" value={form.job_title} onChange={set('job_title')} />
        </Field>
        <Field label="Company" htmlFor="ap-company">
          <Input id="ap-company" value={form.company} onChange={set('company')} />
        </Field>
        <Field label="Email" htmlFor="ap-email">
          <Input id="ap-email" type="email" value={form.email} onChange={set('email')} />
        </Field>
        <Field label="Mobile" htmlFor="ap-mobile" hint="Checked against your DNC list on save.">
          <Input id="ap-mobile" type="tel" className="tabular-nums" placeholder="07700 900123" value={form.mobile} onChange={set('mobile')} />
        </Field>
        {error ? <p className="text-danger-700 sm:col-span-2" role="alert">{error}</p> : null}
        <div className="flex justify-end gap-2 sm:col-span-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" loading={busy}>
            Add person
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

/** Assign to: distribute a list round-robin across the selected members. */
export function AssignDialog({ open, onClose, listId }: { open: boolean; onClose: () => void; listId: string }) {
  const { data: members } = useMembers();
  const qc = useQueryClient();
  const toast = useToast();
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setPicked([]);
      setError(null);
    }
  }, [open]);

  const submit = async () => {
    setBusy(true);
    const { data, error } = await supabase().rpc('assign_list', { p_list_id: listId, p_user_ids: picked });
    setBusy(false);
    if (error) return setError(/forbidden/.test(error.message) ? 'Only owners and admins can assign lists.' : error.message);
    toast(`Assigned ${data ?? 0} people across ${picked.length} rep${picked.length === 1 ? '' : 's'}`);
    ['people', 'list', 'today'].forEach((k) => void qc.invalidateQueries({ queryKey: [k] }));
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Assign to"
      description="People in this list are shared out round-robin between the reps you pick."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!picked.length} loading={busy} onClick={submit}>
            Assign
          </Button>
        </>
      }
    >
      <ul className="divide-y divide-white-800 rounded-md border border-white-800">
        {(members ?? []).map((m) => {
          const on = picked.includes(m.user_id);
          return (
            <li key={m.user_id}>
              <button
                role="checkbox"
                aria-checked={on}
                onClick={() => setPicked((p) => (on ? p.filter((x) => x !== m.user_id) : [...p, m.user_id]))}
                className={`flex h-11 w-full items-center gap-3 px-3 text-left ${on ? 'bg-accent-50' : 'hover:bg-white-300'}`}
              >
                <Avatar name={m.profile?.full_name || m.profile?.email} src={m.profile?.avatar_url} size={24} />
                <span className="flex-1 truncate">{m.profile?.full_name || m.profile?.email}</span>
                <span className={`flex h-4 w-4 items-center justify-center rounded-[4px] border ${on ? 'border-accent-500 bg-accent-500' : 'border-white-800'}`} />
              </button>
            </li>
          );
        })}
      </ul>
      {error ? <p className="mt-3 text-danger-700" role="alert">{error}</p> : null}
    </Dialog>
  );
}
