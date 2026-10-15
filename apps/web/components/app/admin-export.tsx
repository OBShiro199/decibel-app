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
  },
  mobile: {
    filter: 'hasMobile',
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
      { v: 0.25, label: '$0.25 (adds Prospeo, Limadata, ContactOut)' },
    ],
    cap: 0.005,
    verify: false,
    verifyLabel: 'Check the line is live before saving (about $0.01 more per number found)',
    typical: 'Misses are free: each number found costs what the provider that found it charges, up to the cap.',
    shown: 'Mobiles appear in Leads as they are found.',
  },
} as const;
type EnrichResponse = { results: { saved: boolean; verdict: string; cost_micro: number }[]; cost_micro: number; pending?: string[] };

/** "Find missing emails / mobiles (treg)": choose how many and the cost cap, then a progress dialog. */
export function useAdminEnrich(kind: keyof typeof ENRICH = 'email') {
  const k = ENRICH[kind];
  const { workspace } = useApp();
  const toast = useToast();
  const [setup, setSetup] = useState<null | { filters: Filters; missing: number | null }>(null);
  const [howMany, setHowMany] = useState(200);
  const [maxCost, setMaxCost] = useState<number>(k.cap);
  const [verify, setVerify] = useState<boolean>(k.verify);
  const [run, setRun] = useState<null | { done: number; total: number; saved: number; costMicro: number; failed?: number; error?: string; finished?: boolean }>(null);
  const cancelled = useRef(false);

  async function open(filters: Filters) {
    const target = { ...filters, [k.filter]: false };
    setSetup({ filters: target, missing: null });
    try {
      const r = await invoke<{ count: { n: number } }>('lead-search', { workspace_id: workspace.id, filters: target, limit: 0 });
      setSetup({ filters: target, missing: r.count.n });
      setHowMany(Math.min(r.count.n, 200));
    } catch (e) {
      toast((e as Error).message);
      setSetup(null);
    }
  }

  async function start() {
    if (!setup) return;
    const total = Math.min(howMany, setup.missing ?? 0);
    const filters = setup.filters;
    setSetup(null);
    cancelled.current = false;
    setRun({ done: 0, total, saved: 0, costMicro: 0 });
    let done = 0;
    let saved = 0;
    let costMicro = 0;
    try {
      // the targets are fixed up front: found contacts drop leads out of "no email" / "no mobile", which would shift the pages
      const ids: string[] = [];
      for (let offset = 0; ids.length < total; offset += BATCH) {
        const r = await invoke<{ ids: string[] }>('lead-search', { workspace_id: workspace.id, filters, offset, limit: Math.min(BATCH, total - ids.length), ids_only: true });
        if (!r.ids.length) break;
        ids.push(...r.ids);
      }
      // the function hands back the leads it ran out of time for (pending); a failed call is tried once more
      // (treg answers a repeat of the same lookup from its store, unbilled), then its leads are skipped
      const queue = [...ids];
      let failed = 0;
      while (queue.length && !cancelled.current) {
        const batch = queue.splice(0, ENRICH_BATCH);
        let r: EnrichResponse | null = null;
        for (let attempt = 0; attempt < 2 && !r; attempt++) {
          try {
            r = await invoke<EnrichResponse>('lead-enrich', { ids: batch, kind, max_cost: maxCost, verify });
          } catch (e) {
            const status = (e as { status?: number }).status;
            if (status === 402 || status === 403) throw e;
            if (attempt === 0) await new Promise((ok) => setTimeout(ok, 3000));
          }
        }
        if (!r) {
          done += batch.length;
          failed += batch.length;
          setRun({ done, total: ids.length, saved, costMicro, failed });
          continue;
        }
        const pending = r.pending ?? [];
        queue.unshift(...pending);
        done += batch.length - pending.length;
        saved += r.results.filter((x) => x.saved).length;
        failed += r.results.filter((x) => x.verdict === 'error' || x.verdict === 'timeout').length;
        costMicro += r.cost_micro;
        setRun({ done, total: ids.length, saved, costMicro, failed });
      }
      setRun({ done, total: ids.length, saved, costMicro, failed, finished: true });
    } catch (e) {
      const msg = String((e as { data?: { message?: string } }).data?.message ?? (e as Error).message);
      setRun({ done, total, saved, costMicro, error: msg, finished: true });
    }
  }

  const usd = (micro: number) => `$${(micro / 1e6).toFixed(micro < 1e6 ? 3 : 2)}`;
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
            <Button variant="primary" disabled={!setup?.missing || howMany < 1} onClick={() => void start()}>
              Find {k.what} for {n(Math.min(howMany, setup?.missing ?? 0))} leads
            </Button>
          </>
        }
      >
        {setup ? (
          <div className="space-y-4">
            <p className="text-black-700">
              <span className="font-medium tabular-nums text-black-400">{setup.missing === null ? '…' : n(setup.missing)}</span> {k.missing}
            </p>
            <label className="block">
              <span className="mb-1 block text-black-700">How many to look up</span>
              <input
                type="number"
                min={1}
                max={setup.missing ?? undefined}
                value={howMany}
                onChange={(e) => setHowMany(Math.max(1, Math.round(Number(e.target.value) || 1)))}
                className="control h-9 w-40 tabular-nums"
              />
            </label>
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
              {k.typical} At most {usd(Math.min(howMany, setup.missing ?? 0) * maxCost * 1e6)} for this run.
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
            {run.error ? (
              <p role="alert" className="mt-3 text-danger-700">
                {run.error}
              </p>
            ) : run.finished ? (
              <p className="mt-3 text-black-700">
                Done: {n(run.saved)} {k.what} found for {n(run.done)} leads{run.done ? `, ${usd(run.costMicro / run.done)} a lead on average` : ''}.
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
