'use client';
// Platform admins (migration 0033) can export every lead matching a Leads search, with full contact
// details, free and without revealing into People. The browser walks the matches 1,000 at a time:
// ids from Typesense (lead-search, ids_only), then full rows from admin_export_leads (checked and
// audited server side), with a short pause between batches so the database stays responsive.
import { useQuery } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { useApp } from '@/lib/app-context';
import type { Filters } from '@/lib/lead-search';
import { invoke, supabase } from '@/lib/supabase/client';
import { downloadCsv } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Dialog, useToast } from '@/components/ui/overlay';

const BATCH = 1000;
const PAUSE_MS = 250;
const n = (v: number) => v.toLocaleString('en-GB');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface AdminRow {
  lead_id: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  current_title: string | null;
  seniority_level: string | null;
  department: string | null;
  company_name: string | null;
  company_domain: string | null;
  company_industry: string | null;
  employee_count_range: string | null;
  revenue_range: string | null;
  company_hq_country: string | null;
  contact_country: string | null;
  contact_city: string | null;
  contact_location: string | null;
  linkedin_url: string | null;
  mobile_phone: string | null;
  work_email: string | null;
  email_status: string | null;
  personal_emails: string | null;
}

export function useIsPlatformAdmin() {
  return useQuery({
    queryKey: ['platform-admin'],
    staleTime: Infinity,
    queryFn: async () => {
      const { data, error } = await supabase().rpc('is_platform_admin');
      return !error && data === true;
    },
  }).data === true;
}

/** "Export all matching leads" for platform admins: a progress dialog and the export loop. */
export function useAdminExport() {
  const { workspace } = useApp();
  const toast = useToast();
  const [run, setRun] = useState<null | { done: number; total: number; error?: string }>(null);
  const cancelled = useRef(false);

  async function start(filters: Filters, total: number) {
    cancelled.current = false;
    setRun({ done: 0, total });
    const rows: Record<string, unknown>[] = [];
    try {
      for (let offset = 0; offset < total && !cancelled.current; offset += BATCH) {
        const { ids } = await invoke<{ ids: string[] }>('lead-search', { workspace_id: workspace.id, filters, offset, limit: BATCH, ids_only: true });
        if (!ids.length) break;
        const { data, error } = await supabase().rpc('admin_export_leads', { p_workspace_id: workspace.id, p_ids: ids });
        if (error) throw new Error(error.message.includes('forbidden') ? 'Only platform admins can do this.' : error.message);
        for (const r of (data ?? []) as AdminRow[]) {
          rows.push({
            name: r.full_name ?? '',
            first_name: r.first_name ?? '',
            last_name: r.last_name ?? '',
            title: r.current_title ?? '',
            seniority: r.seniority_level ?? '',
            department: r.department ?? '',
            company: r.company_name ?? '',
            company_domain: r.company_domain ?? '',
            industry: r.company_industry ?? '',
            company_size: r.employee_count_range ?? '',
            revenue: r.revenue_range ?? '',
            hq_country: r.company_hq_country ?? '',
            country: r.contact_country ?? '',
            city: r.contact_city ?? '',
            location: r.contact_location ?? '',
            linkedin: r.linkedin_url ?? '',
            mobile: r.mobile_phone ?? '',
            work_email: r.work_email ?? '',
            email_status: r.email_status ?? '',
            personal_emails: r.personal_emails ?? '',
          });
        }
        setRun({ done: rows.length, total });
        await sleep(PAUSE_MS);
      }
      if (rows.length) {
        downloadCsv(`decibel-leads-all-${new Date().toISOString().slice(0, 10)}.csv`, rows);
        toast(`${cancelled.current ? 'Stopped early: ' : ''}${n(rows.length)} leads exported`);
      }
      setRun(null);
    } catch (e) {
      setRun({ done: rows.length, total, error: (e as Error).message });
    }
  }

  const dialog = (
    <Dialog
      open={!!run}
      onClose={() => {
        if (run?.error) setRun(null);
      }}
      title="Exporting all matching leads"
      description="Full contact details, free (platform admin). Keep this tab open until the download starts."
      footer={
        run?.error ? (
          <Button onClick={() => setRun(null)}>Close</Button>
        ) : (
          <Button
            onClick={() => {
              cancelled.current = true;
            }}
          >
            Stop and download what’s ready
          </Button>
        )
      }
    >
      {run ? (
        <div>
          <p className="flex items-baseline justify-between text-black-700">
            <span>
              <span className="font-medium tabular-nums text-black-400">{n(run.done)}</span> of {n(run.total)} leads
            </span>
            <span className="tabular-nums">{run.total ? Math.floor((run.done / run.total) * 100) : 0}%</span>
          </p>
          <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-[#edf2fd]" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={run.total ? Math.floor((run.done / run.total) * 100) : 0}>
            <div className="h-full rounded-full bg-[#5f86e0] transition-[width] duration-300" style={{ width: `${run.total ? Math.max(2, (run.done / run.total) * 100) : 2}%` }} />
          </div>
          {run.error ? (
            <p role="alert" className="mt-3 text-danger-700">
              {run.error}
            </p>
          ) : (
            <p className="mt-3 text-black-700">About {Math.max(1, Math.ceil(((run.total - run.done) / BATCH) * 1.4 / 60))} min left.</p>
          )}
        </div>
      ) : null}
    </Dialog>
  );

  return { start, dialog, running: !!run };
}

// ---- find missing emails or mobiles through treg (platform admins, migrations 0035/0036, lead-enrich function) ---------
const ENRICH_BATCH = 8;
const ENRICH = {
  email: {
    filter: 'hasEmail',
    narrow: (f: Filters): Filters => f,
    scopeNote: '',
    title: 'Find missing emails',
    running: 'Finding emails',
    what: 'emails',
    description:
      'Looks up work emails through treg for matching leads that have none. Only emails the mailbox check rates valid (or catch-all) are saved. Billed to your treg balance, not Decibel credits.',
    missing: 'matching leads have no work email.',
    caps: [
      { v: 0.01, label: '$0.01' },
      { v: 0.02, label: '$0.02' },
      { v: 0.03, label: '$0.03' },
      { v: 0.05, label: '$0.05' },
    ],
    cap: 0.03,
    verify: true,
    verifyLabel: "Check each email's mailbox before saving (recommended)",
    typical: 'Typically about $0.008 a lead (misses cost a little too).',
    shown: 'Emails appear in Leads as they are found.',
    one: 'email',
    unsaved: 'more lookups were charged without saving an email: misses, and emails the mailbox check rated invalid or risky.',
  },
  mobile: {
    filter: 'hasMobile',
    // UK decision makers only: the country becomes the UK, seniority C-level and/or VP (within any chosen)
    narrow: (f: Filters): Filters => {
      const picked = Array.isArray(f.seniorities) ? (f.seniorities as string[]).filter((s) => s === 'c-level' || s === 'vp') : [];
      const chose = Array.isArray(f.seniorities) && (f.seniorities as string[]).length > 0;
      return { ...f, countries: ['United Kingdom'], seniorities: chose ? (picked.length ? picked : ['none']) : ['c-level', 'vp'] };
    },
    scopeNote: 'UK leads at C-level or VP only, within your filters.',
    title: 'Find missing mobiles',
    running: 'Finding mobiles',
    what: 'mobiles',
    description:
      'Looks up mobile numbers through treg for matching leads that have none. Only mobile numbers are saved, into leads with no mobile yet. You pay only when a number is found. Billed to your treg balance, not Decibel credits.',
    missing: 'matching leads have no mobile.',
    caps: [
      { v: 0.005, label: '$0.005 (QuickEnrich only)' },
      { v: 0.03, label: '$0.03 (adds AI-Ark)' },
      { v: 0.05, label: '$0.05 (adds Tomba)' },
      { v: 0.1, label: '$0.10 (adds Dropleads, Aviato, LeadMagic)' },
      { v: 0.25, label: '$0.25 (adds Prospeo, Limadata, ContactOut)' },
      { v: 0.75, label: '$0.75 (everyone, including Lusha)' },
    ],
    cap: 0.03,
    verify: false,
    verifyLabel: 'Check the line is live before saving (about $0.01 more per number found)',
    typical: 'Misses are free: each number found costs what the provider that found it charges, up to the cap.',
    shown: 'Mobiles appear in Leads as they are found.',
    one: 'mobile',
    unsaved: 'more numbers found but not saved: landlines, 0800 numbers or not UK mobiles. The provider still charges for these.',
  },
} as const;
type EnrichResponse = { results: { saved: boolean; verdict: string; cost_micro: number }[]; cost_micro: number; pending?: string[] };

/** "Find missing emails / mobiles (treg)": choose how many and the cost cap, then a progress dialog. */
export function useAdminEnrich(kind: keyof typeof ENRICH = 'email') {
  const k = ENRICH[kind];
  const { workspace } = useApp();
  const toast = useToast();
  const [setup, setSetup] = useState<null | { filters: Filters; missing: number | null; selected: string[]; page: string[] }>(null);
  const [scope, setScope] = useState<'selected' | 'page' | 'search'>('search');
  const [howMany, setHowMany] = useState(200);
  const [maxCost, setMaxCost] = useState<number>(k.cap);
  const [verify, setVerify] = useState<boolean>(k.verify);
  const [run, setRun] = useState<null | {
    done: number;
    total: number;
    saved: number;
    costMicro: number;
    failed?: number;
    unsaved?: number;
    error?: string;
    finished?: boolean;
    stopped?: boolean;
  }>(null);
  const cancelled = useRef(false);

  /** `selected` are the ticked leads and `page` the ones on screen; either can be looked up instead of the whole search */
  async function open(filters: Filters, picked: { selected?: string[]; page?: string[] } = {}) {
    const target = { ...k.narrow(filters), [k.filter]: false };
    const selected = picked.selected ?? [];
    const page = picked.page ?? [];
    setScope(selected.length ? 'selected' : 'search');
    setSetup({ filters: target, missing: null, selected, page });
    try {
      const r = await invoke<{ count: { n: number } }>('lead-search', { workspace_id: workspace.id, filters: target, limit: 0 });
      setSetup({ filters: target, missing: r.count.n, selected, page });
      // the whole filtered search by default; the dialog shows the most it can cost first
      setHowMany(r.count.n);
    } catch (e) {
      toast((e as Error).message);
      setSetup(null);
    }
  }

  async function start() {
    if (!setup) return;
    const fixed = scope === 'selected' ? setup.selected : scope === 'page' ? setup.page : null;
    const total = fixed ? fixed.length : Math.min(howMany, setup.missing ?? 0);
    const filters = setup.filters;
    setSetup(null);
    cancelled.current = false;
    setRun({ done: 0, total, saved: 0, costMicro: 0 });
    let done = 0;
    let saved = 0;
    let costMicro = 0;
    try {
      // the targets are fixed up front: found contacts drop leads out of "no email" / "no mobile", which would shift the pages
      // ticked or on-screen leads go as they are: the function skips any that already have one (or are outside
      // the finder's reach), unbilled
      const ids: string[] = fixed ? [...fixed] : [];
      for (let offset = 0; !fixed && ids.length < total; offset += BATCH) {
        const r = await invoke<{ ids: string[] }>('lead-search', { workspace_id: workspace.id, filters, offset, limit: Math.min(BATCH, total - ids.length), ids_only: true });
        if (!r.ids.length) break;
        ids.push(...r.ids);
      }
      // the function hands back the leads it ran out of time for (pending); a failed call is tried once more
      // (treg answers a repeat of the same lookup from its store, unbilled), then its leads are skipped
      const queue = [...ids];
      let failed = 0;
      // found and paid for, but not saved (a landline or a non-UK number; an email the mailbox check failed)
      let unsaved = 0;
      // three calls at a time; each takes the next batch off the shared queue
      const lane = async () => {
        while (queue.length && !cancelled.current) {
          const batch = queue.splice(0, ENRICH_BATCH);
          let r: EnrichResponse | null = null;
          for (let attempt = 0; attempt < 2 && !r; attempt++) {
            try {
              r = await invoke<EnrichResponse>('lead-enrich', { ids: batch, kind, max_cost: maxCost, verify });
            } catch (e) {
              const status = (e as { status?: number }).status;
              if (status === 402 || status === 403) {
                cancelled.current = true;
                throw e;
              }
              if (attempt === 0) await new Promise((ok) => setTimeout(ok, 3000));
            }
          }
          if (!r) {
            done += batch.length;
            failed += batch.length;
            setRun({ done, total: ids.length, saved, costMicro, failed, unsaved });
            continue;
          }
          const pending = r.pending ?? [];
          queue.unshift(...pending);
          done += batch.length - pending.length;
          saved += r.results.filter((x) => x.saved).length;
          failed += r.results.filter((x) => x.verdict === 'error' || x.verdict === 'timeout').length;
          unsaved += r.results.filter((x) => !x.saved && x.cost_micro > 0).length;
          costMicro += r.cost_micro;
          setRun({ done, total: ids.length, saved, costMicro, failed, unsaved });
        }
      };
      await Promise.all([lane(), lane(), lane()]);
      setRun({ done, total: ids.length, saved, costMicro, failed, unsaved, finished: true, stopped: cancelled.current && done < ids.length });
    } catch (e) {
      const msg = String((e as { data?: { message?: string } }).data?.message ?? (e as Error).message);
      setRun({ done, total, saved, costMicro, error: msg, finished: true });
    }
  }

  const usd = (micro: number) => `$${(micro / 1e6).toFixed(micro < 1e6 ? 3 : 2)}`;
  const lookupCount = !setup
    ? 0
    : scope === 'selected'
      ? setup.selected.length
      : scope === 'page'
        ? setup.page.length
        : Math.max(0, Math.min(howMany, setup.missing ?? 0));
  const dialog = (
    <>
      <Dialog
        open={!!setup}
        onClose={() => setSetup(null)}
        title={k.title}
        description={k.description}
        footer={
          <>
            <Button onClick={() => setSetup(null)}>Cancel</Button>
            <Button variant="primary" disabled={!lookupCount} onClick={() => void start()}>
              Find {k.what} for {scope === 'search' && lookupCount === setup?.missing && lookupCount > 1 ? 'all ' : ''}
              {n(lookupCount)} leads
            </Button>
          </>
        }
      >
        {setup ? (
          <div className="space-y-4">
            {k.scopeNote ? <p className="text-black-700">{k.scopeNote}</p> : null}
            <fieldset className="space-y-2">
              <legend className="mb-1 text-black-700">Which leads</legend>
              <label className="flex items-center gap-2">
                <input type="radio" name={`enrich-scope-${kind}`} checked={scope === 'search'} onChange={() => setScope('search')} />
                <span>
                  Your filtered search: <span className="font-medium tabular-nums text-black-400">{setup.missing === null ? '…' : n(setup.missing)}</span> {k.missing}
                </span>
              </label>
              {setup.selected.length ? (
                <label className="flex items-center gap-2">
                  <input type="radio" name={`enrich-scope-${kind}`} checked={scope === 'selected'} onChange={() => setScope('selected')} />
                  <span>
                    The <span className="tabular-nums">{n(setup.selected.length)}</span> ticked leads
                  </span>
                </label>
              ) : null}
              {setup.page.length ? (
                <label className="flex items-center gap-2">
                  <input type="radio" name={`enrich-scope-${kind}`} checked={scope === 'page'} onChange={() => setScope('page')} />
                  <span>
                    The <span className="tabular-nums">{n(setup.page.length)}</span> leads on this page
                  </span>
                </label>
              ) : null}
              {scope !== 'search' ? <p className="text-black-700">Leads that already have one are skipped, free.</p> : null}
            </fieldset>
            {scope === 'search' ? (
              <label className="block">
                <span className="mb-1 block text-black-700">How many to look up</span>
                <span className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={setup.missing ?? undefined}
                    value={howMany}
                    onChange={(e) => setHowMany(Math.max(1, Math.round(Number(e.target.value) || 1)))}
                    className="control h-9 w-40 tabular-nums"
                  />
                  {setup.missing && howMany !== setup.missing ? (
                    <Button onClick={() => setHowMany(setup.missing ?? 0)}>All {n(setup.missing)}</Button>
                  ) : null}
                </span>
              </label>
            ) : null}
            <label className="block">
              <span className="mb-1 block text-black-700">Most to spend per lead</span>
              <select value={maxCost} onChange={(e) => setMaxCost(Number(e.target.value))} className="control h-9 w-full max-w-xs">
                {k.caps.map((c) => (
                  <option key={c.v} value={c.v}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={verify} onChange={(e) => setVerify(e.target.checked)} />
              <span>{k.verifyLabel}</span>
            </label>
            <p className="text-black-700">
              {k.typical} At most {usd(lookupCount * maxCost * 1e6)} for this run.
            </p>
          </div>
        ) : null}
      </Dialog>
      <Dialog
        open={!!run}
        onClose={() => {
          if (run?.finished) setRun(null);
        }}
        title={k.running}
        description={`Keep this tab open. ${k.shown}`}
        footer={
          run?.finished ? (
            <Button onClick={() => setRun(null)}>Done</Button>
          ) : (
            <Button
              onClick={() => {
                cancelled.current = true;
              }}
            >
              Stop
            </Button>
          )
        }
      >
        {run ? (
          <div>
            <p className="flex items-baseline justify-between text-black-700">
              <span>
                <span className="font-medium tabular-nums text-black-400">{n(run.done)}</span> of {n(run.total)} looked up
              </span>
              <span className="tabular-nums">{run.total ? Math.floor((run.done / run.total) * 100) : 0}%</span>
            </p>
            <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-[#edf2fd]" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={run.total ? Math.floor((run.done / run.total) * 100) : 0}>
              <div className="h-full rounded-full bg-[#5f86e0] transition-[width] duration-300" style={{ width: `${run.total ? Math.max(2, (run.done / run.total) * 100) : 2}%` }} />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-md border border-white-800 px-3 py-2">
                <p className="text-black-700">{kind === 'mobile' ? 'Mobiles saved' : 'Emails saved'}</p>
                <p className="mt-0.5 text-[18px] font-medium tabular-nums text-black-400">{n(run.saved)}</p>
              </div>
              <div className="rounded-md border border-white-800 px-3 py-2">
                <p className="text-black-700">treg cost so far</p>
                <p className="mt-0.5 text-[18px] font-medium tabular-nums text-black-400">{usd(run.costMicro)}</p>
              </div>
            </div>
            {run.unsaved ? (
              <p className="mt-3 text-black-700">
                <span className="tabular-nums">{n(run.unsaved)}</span> {k.unsaved}
              </p>
            ) : null}
            {run.error ? (
              <p role="alert" className="mt-3 text-danger-700">
                {run.error}
              </p>
            ) : run.finished ? (
              <p className="mt-3 text-black-700">
                {run.stopped ? 'Stopped' : 'Done'}: {n(run.saved)} {k.what} saved from {n(run.done)} leads
                {run.saved ? `, ${usd(run.costMicro / run.saved)} per ${k.one} saved` : ''}.
                {run.failed ? ` ${n(run.failed)} lookups did not finish and were skipped.` : ''}
              </p>
            ) : null}
          </div>
        ) : null}
      </Dialog>
    </>
  );

  return { open, dialog };
}
