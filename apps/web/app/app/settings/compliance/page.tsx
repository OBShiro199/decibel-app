'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Search } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Button, ButtonLink } from '@/components/ui/button';
import { ErrorCard, TableSkeleton } from '@/components/ui/display';
import { Field, Input, Textarea } from '@/components/ui/form';
import { Dialog, useToast } from '@/components/ui/overlay';
import { useApp } from '@/lib/app-context';
import { useMemberNames } from '@/lib/hooks';
import { supabase } from '@/lib/supabase/client';
import { formatDate, formatPhone, normalizePhone, exportCsv as auditedCsv } from '@/lib/utils';
import { AdminOnly, fetchAll, Notice, Section, SettingsPage } from '../_components';
import { DEFAULT_DIAL_COUNTRY, toE164, type DialCountry } from '@/lib/phone';
import { PhoneInput } from '@/components/ui/phone-input';

interface DncEntry {
  id: string;
  workspace_id: string;
  e164: string;
  reason: string | null;
  added_by: string | null;
  created_at: string;
}

const SUBPROCESSORS: [string, string][] = [
  ['Supabase', 'Database, authentication and file storage (London)'],
  ['Twilio', 'Voice calls and phone numbers'],
  ['Stripe', 'Billing and payments'],
  ['Vercel', 'Application hosting'],
  ['Resend', 'Transactional email'],
  ['PostHog', 'Product analytics'],
];

export default function CompliancePage() {
  const { user, workspace, isAdmin, refreshWorkspace } = useApp();
  const qc = useQueryClient();
  const toast = useToast();
  const names = useMemberNames();
  const [number, setNumber] = useState('');
  const [dncCountry, setDncCountry] = useState<DialCountry>(DEFAULT_DIAL_COUNTRY);
  const [reason, setReason] = useState('');
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [bulkReason, setBulkReason] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [art14, setArt14] = useState(workspace.art14_notice_text ?? '');
  const [savingArt14, setSavingArt14] = useState(false);
  const [art14Error, setArt14Error] = useState<string | null>(null);

  const dnc = useQuery({
    queryKey: ['dnc', workspace.id],
    queryFn: () =>
      fetchAll<DncEntry>((from, to) => supabase().from('dnc_entries').select('*').eq('workspace_id', workspace.id).order('created_at', { ascending: false }).range(from, to)),
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ['dnc', workspace.id] });

  const rows = useMemo(() => {
    const all = dnc.data ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return all;
    const digits = q.replace(/[^0-9+]/g, '');
    return all.filter((r) => (digits && r.e164.includes(digits.replace(/^0/, ''))) || (r.reason ?? '').toLowerCase().includes(q));
  }, [dnc.data, search]);

  const e164 = toE164(number, dncCountry);
  const bulkParsed = useMemo(() => {
    const lines = bulkText.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean);
    const valid = Array.from(new Set(lines.map((l) => normalizePhone(l)).filter((v): v is string => Boolean(v))));
    return { total: lines.length, valid, invalid: lines.filter((l) => !normalizePhone(l)).length };
  }, [bulkText]);

  async function insert(numbers: string[], why: string) {
    const payload = numbers.map((n) => ({ workspace_id: workspace.id, e164: n, reason: why.trim() || null, added_by: user.id }));
    const { error: err } = await supabase().from('dnc_entries').upsert(payload, { onConflict: 'workspace_id,e164', ignoreDuplicates: true });
    if (err) throw new Error(err.message);
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!e164) return;
    setAdding(true);
    setError(null);
    try {
      const exists = (dnc.data ?? []).some((r) => r.e164 === e164);
      await insert([e164], reason);
      setNumber('');
      setReason('');
      await refresh();
      toast(exists ? 'That number is already on the list' : 'Added to do-not-call list');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setAdding(false);
    }
  }

  async function addBulk() {
    if (!bulkParsed.valid.length) return;
    setBulkBusy(true);
    setBulkError(null);
    try {
      for (let i = 0; i < bulkParsed.valid.length; i += 500) await insert(bulkParsed.valid.slice(i, i + 500), bulkReason);
      await refresh();
      toast(`${bulkParsed.valid.length} number${bulkParsed.valid.length === 1 ? '' : 's'} added`);
      setBulkOpen(false);
      setBulkText('');
      setBulkReason('');
    } catch (err) {
      setBulkError((err as Error).message);
    } finally {
      setBulkBusy(false);
    }
  }

  async function remove(row: DncEntry) {
    setBusyId(row.id);
    setError(null);
    const { error: err } = await supabase().from('dnc_entries').delete().eq('id', row.id);
    setBusyId(null);
    if (err) return setError(err.message);
    await refresh();
    toast('Removed from do-not-call list');
  }

  function exportCsv() {
    if (!dnc.data?.length) return toast('Nothing to export');
    auditedCsv(workspace.id, 'dnc',
      `decibel-dnc-${new Date().toISOString().slice(0, 10)}.csv`,
      dnc.data.map((r) => ({ number: r.e164, reason: r.reason ?? '', added_by: r.added_by ? names[r.added_by] ?? '' : '', added_at: r.created_at })),
    );
  }

  async function saveArt14() {
    setSavingArt14(true);
    setArt14Error(null);
    const { error: err } = await supabase().from('workspaces').update({ art14_notice_text: art14.trim() }).eq('id', workspace.id);
    setSavingArt14(false);
    if (err) return setArt14Error(err.message);
    await refreshWorkspace();
    toast('Saved');
  }

  return (
    <SettingsPage title="Compliance" description="Your do-not-call list, TPS screening and the documents you need for UK and EU outbound calling.">
      {!isAdmin ? <AdminOnly /> : null}

      <Section
        title="Do-not-call list"
        description="Numbers on this list are blocked from dialling for everyone in the workspace."
        actions={
          <>
            <Button disabled={!isAdmin} onClick={() => { setBulkError(null); setBulkOpen(true); }}>
              Paste numbers
            </Button>
            <Button onClick={exportCsv} disabled={!dnc.data?.length}>
              <Download size={16} strokeWidth={1.5} />
              Export CSV
            </Button>
          </>
        }
      >
        {isAdmin ? (
          <form onSubmit={add} className="card mb-4 grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-start">
            <Field label="Number" htmlFor="dnc_number" error={number.trim() && !e164 ? 'Enter a valid phone number.' : undefined}>
              <PhoneInput id="dnc_number" value={number} onChange={setNumber} country={dncCountry} onCountryChange={setDncCountry} aria-invalid={Boolean(number.trim()) && !e164} />
            </Field>
            <Field label="Reason (optional)" htmlFor="dnc_reason">
              <Input id="dnc_reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Asked not to be called" maxLength={200} />
            </Field>
            <Button type="submit" variant="primary" loading={adding} disabled={!e164} className="sm:mt-[22px]">
              Add
            </Button>
          </form>
        ) : null}
        {error ? <Notice tone="danger" className="mb-4">{error}</Notice> : null}
        {dnc.isError ? (
          <ErrorCard message="Could not load the do-not-call list." onRetry={() => dnc.refetch()} />
        ) : (
          <div className="card">
            <div className="relative border-b border-white-800 p-3">
              <Search size={16} strokeWidth={1.5} className="pointer-events-none absolute left-5 top-5 text-black-700" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search numbers or reasons" aria-label="Search do-not-call list" className="h-8 pl-8" />
            </div>
            {dnc.isLoading ? (
              <TableSkeleton rows={4} cols={4} />
            ) : !rows.length ? (
              <p className="p-6 text-black-700">{dnc.data?.length ? 'No numbers match that search.' : 'No numbers on your do-not-call list yet.'}</p>
            ) : (
              <div className="max-h-[420px] overflow-auto">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Number</th>
                      <th>Reason</th>
                      <th>Added</th>
                      <th className="w-24" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id}>
                        <td className="t-mono whitespace-nowrap">{formatPhone(r.e164)}</td>
                        <td className="text-black-700">{r.reason || ''}</td>
                        <td className="whitespace-nowrap text-black-700">
                          {formatDate(r.created_at)}
                          {r.added_by && names[r.added_by] ? ` by ${names[r.added_by]}` : ''}
                        </td>
                        <td className="text-right">
                          {isAdmin ? (
                            <Button variant="ghost" size="compact" disabled={busyId === r.id} onClick={() => remove(r)}>
                              Remove
                            </Button>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </Section>

      <Section title="TPS and CTPS screening">
        <div className="card space-y-3 p-6 text-black-700">
          <p>Every number is screened before it is dialled. Numbers flagged as TPS or CTPS listed are blocked in code, so a rep cannot call them by mistake. This cannot be switched off.</p>
          <p>
            In this version, screening uses cached TPS flags stored with each record. Live TPS sync is not connected yet. When it is, every number will be re-checked at least every 28 days, as the regulations require.
          </p>
          <p>Until then, if you rely on your own TPS licence, add listed numbers to the do-not-call list above.</p>
        </div>
      </Section>

      <Section
        title="Article 14 notice"
        description="Under UK and EU GDPR you must tell people where you got their data within one month, or at first contact. This text is your notice."
        footer={
          isAdmin ? (
            <Button variant="primary" loading={savingArt14} disabled={art14.trim() === (workspace.art14_notice_text ?? '')} onClick={saveArt14}>
              Save
            </Button>
          ) : undefined
        }
      >
        <div className="card p-6">
          <Field label="Notice text" htmlFor="art14" error={art14Error ?? undefined} hint="Say who you are, why you are calling, where the data came from and how to opt out.">
            <Textarea id="art14" value={art14} onChange={(e) => setArt14(e.target.value)} rows={5} maxLength={2000} disabled={!isAdmin} />
          </Field>
        </div>
      </Section>

      <Section title="Documents">
        <div className="card divide-y divide-white-800">
          <div className="flex flex-wrap items-center gap-4 p-6">
            <div className="min-w-0 flex-1">
              <p>Legitimate interests assessment template</p>
              <p className="t-small mt-0.5 text-black-700">A starting point for the LIA you need before B2B cold calling. Complete it for your own business.</p>
            </div>
            <a href="/lia-template.txt" download className="inline-flex h-9 shrink-0 items-center gap-2 rounded-sm border border-white-800 bg-white-100 px-3 transition-colors hover:border-black-700">
              <Download size={16} strokeWidth={1.5} />
              Download
            </a>
          </div>
          <div className="flex flex-wrap items-center gap-4 p-6">
            <div className="min-w-0 flex-1">
              <p>Data processing agreement</p>
              <p className="t-small mt-0.5 text-black-700">The DPA between your company and Decibel.</p>
            </div>
            <ButtonLink href="/dpa">View DPA</ButtonLink>
          </div>
        </div>
      </Section>

      <Section title="Sub-processors" description="The third parties that process data on our behalf.">
        <div className="card overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Company</th>
                <th>Purpose</th>
              </tr>
            </thead>
            <tbody>
              {SUBPROCESSORS.map(([name, purpose]) => (
                <tr key={name}>
                  <td>{name}</td>
                  <td className="text-black-700">{purpose}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Germany and Austria">
        <Notice tone="warning">
          B2B cold calling in Germany and Austria generally needs prior consent, or at least presumed consent that is hard to rely on. Decibel does not block these calls, so take legal advice before dialling numbers there. See the{' '}
          <Link href="/compliance" className="underline">
            compliance guide
          </Link>
          .
        </Notice>
      </Section>

      <Dialog
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        title="Paste numbers"
        description="One number per line, or separated by commas. UK numbers can start with 0."
        footer={
          <>
            <Button onClick={() => setBulkOpen(false)}>Cancel</Button>
            <Button variant="primary" loading={bulkBusy} disabled={!bulkParsed.valid.length} onClick={addBulk}>
              Add {bulkParsed.valid.length || ''} number{bulkParsed.valid.length === 1 ? '' : 's'}
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          <Field
            label="Numbers"
            htmlFor="bulk_numbers"
            hint={bulkParsed.total ? `${bulkParsed.valid.length} valid${bulkParsed.invalid ? `, ${bulkParsed.invalid} not recognised and will be skipped` : ''}.` : undefined}
          >
            <Textarea id="bulk_numbers" value={bulkText} onChange={(e) => setBulkText(e.target.value)} rows={8} className="t-mono" placeholder={'+44 7700 900123\n07700 900456'} />
          </Field>
          <Field label="Reason (optional)" htmlFor="bulk_reason">
            <Input id="bulk_reason" value={bulkReason} onChange={(e) => setBulkReason(e.target.value)} maxLength={200} />
          </Field>
          {bulkError ? <Notice tone="danger">{bulkError}</Notice> : null}
        </div>
      </Dialog>
    </SettingsPage>
  );
}
