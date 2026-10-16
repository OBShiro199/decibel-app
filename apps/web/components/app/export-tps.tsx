'use client';

// Leads export in one dialog that changes step in place (Dialog `morph`): confirm the reveal cost, reveal,
// then every mobile in the export is checked against the TPS and CTPS registers before the file can be
// downloaded. It runs as an ordinary TPS/CTPS check (migration 0023, Provero), so
// it uses check credits, reuses clear results from the last 30 days for free (0039), and shows up in
// Recent checks on /app/tps. When it ends, the results are written onto the people (tps_apply_to_people)
// and the export can be downloaded whole, passed only, or failed only.
import { Coins, ShieldCheck } from '@phosphor-icons/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useApp } from '@/lib/app-context';
import { track } from '@/lib/analytics';
import { supabase } from '@/lib/supabase/client';
import { DNC, OUTCOMES, TOP_UP_MESSAGE, explainError, tpsJobQuery, type Outcome, type ResultRow } from '@/lib/tps';
import { exportCsv } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/overlay';
import { openSupport } from '@/components/app/support-widget';

/** What to export: the confirm step's text (body null = nothing to confirm, start straight away) and how to
 * reveal the leads and build their rows. */
export interface ExportRequest {
  /** unique per export: each export gets a fresh dialog, so nothing carries over from the last one */
  id: string;
  title: string;
  body: string | null;
  action: string;
  prepare: () => Promise<ExportItem[] | null>;
}

export interface ExportItem {
  /** person id, kept in the check's first column */
  key: string;
  mobile: string | null;
  /** the CSV row, without the TPS columns */
  row: Record<string, unknown>;
}

const n = (v: number) => v.toLocaleString('en-GB');
const day = (iso: string | null) => (iso ? iso.slice(0, 10) : '');
type Pick = 'all' | 'passed' | 'failed';

export function ExportDialog({ request, onClose }: { request: ExportRequest | null; onClose: () => void }) {
  return request ? <ExportSteps key={request.id} request={request} onClose={onClose} /> : null;
}

function ExportSteps({ request, onClose }: { request: ExportRequest; onClose: () => void }) {
  const { workspace } = useApp();
  const qc = useQueryClient();
  const [items, setItems] = useState<ExportItem[] | null>(null);
  const [preparing, setPreparing] = useState(false);
  const asked = useRef<ExportRequest | null>(null);

  const go = async (req: ExportRequest) => {
    setPreparing(true);
    const got = await req.prepare();
    setPreparing(false);
    if (asked.current !== req) return;
    if (!got?.length) return onClose();
    setItems(got);
  };

  // a new export starts at its confirm step, or straight at the reveal when there is nothing to confirm
  useEffect(() => {
    if (!request || asked.current === request) return;
    asked.current = request;
    setItems(null);
    if (!request.body) void go(request);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request]);
  const [jobId, setJobId] = useState<string | null>(null);
  const [error, setError] = useState<{ text: string; topUp?: boolean } | null>(null);
  const [results, setResults] = useState<ResultRow[] | null>(null);
  const started = useRef<ExportItem[] | null>(null);

  // a new export starts a new check
  useEffect(() => {
    if (!items || started.current === items) return;
    started.current = items;
    setJobId(null);
    setError(null);
    setResults(null);
    if (!items.some((i) => i.mobile)) {
      // nothing to check: every lead is "no number"
      setResults(items.map((_, i) => ({ row_no: i, cells: [], phone_raw: '', e164: null, outcome: 'missing', tps_since: null, ctps_since: null, checked_at: null })));
      return;
    }
    void (async () => {
      const { data, error: e } = await supabase().rpc('tps_create_job', {
        p_workspace_id: workspace.id,
        p_file_name: `Leads export ${new Date().toISOString().slice(0, 10)} (${n(items.length)} leads)`,
        p_headers: ['Lead', 'Mobile'],
        p_phone_column: 1,
        p_rows: items.map((i) => [i.key, i.mobile ?? '']),
      });
      if (e) return setError(explainError(e.message));
      setJobId(data as string);
      track('export_tps_check_started', { leads: items.length });
      void qc.invalidateQueries({ queryKey: ['tps-credits', workspace.id] });
      void qc.invalidateQueries({ queryKey: ['tps-jobs', workspace.id] });
    })();
  }, [items, workspace.id, qc]);

  const job = useQuery({ ...tpsJobQuery(jobId ?? ''), enabled: !!jobId, refetchInterval: (q) => (q.state.data && !q.state.data.finished_at ? 700 : false) });
  const finished = !!job.data?.finished_at;

  // once the check ends: the outcome of every row, and the results onto the people
  useEffect(() => {
    if (!jobId || !finished || results) return;
    void (async () => {
      const { data, error: e } = await supabase().rpc('tps_job_results', { p_job_id: jobId });
      if (e) return setError({ text: 'Could not load the check results. Try again in a moment.' });
      setResults((data ?? []) as ResultRow[]);
      await supabase().rpc('tps_apply_to_people', { p_job_id: jobId });
      void qc.invalidateQueries({ queryKey: ['tps-credits', workspace.id] });
      void qc.invalidateQueries({ queryKey: ['people'] });
    })();
  }, [jobId, finished, results, qc, workspace.id]);

  const outcomeOf = (i: number): Outcome => results?.[i]?.outcome ?? 'pending';
  const passed = (o: Outcome) => o === 'valid';
  const failed = (o: Outcome) => DNC.includes(o);
  const counts = items
    ? items.reduce(
        (c, _, i) => {
          const o = outcomeOf(i);
          if (passed(o)) c.passed++;
          else if (failed(o)) c.failed++;
          else c.other++;
          return c;
        },
        { passed: 0, failed: 0, other: 0 },
      )
    : { passed: 0, failed: 0, other: 0 };

  const download = (pick: Pick) => {
    if (!items || !results) return;
    const rows = items
      .map((item, i) => ({ item, i, o: outcomeOf(i) }))
      .filter(({ o }) => pick === 'all' || (pick === 'passed' ? passed(o) : failed(o)))
      .map(({ item, i, o }) => ({ ...item.row, tps_ctps: OUTCOMES[o].file, tps_checked_on: day(results[i]?.checked_at ?? null) }));
    if (!rows.length) return;
    const suffix = pick === 'all' ? '' : pick === 'passed' ? '-tps-passed' : '-tps-failed';
    exportCsv(workspace.id, 'leads', `decibel-leads-${new Date().toISOString().slice(0, 10)}${suffix}.csv`, rows);
    track('export_after_tps', { pick, rows: rows.length });
    onClose();
  };

  const stop = async () => {
    if (jobId && !finished) await supabase().rpc('tps_cancel_job', { p_job_id: jobId });
    onClose();
  };

  const j = job.data;
  const total = j?.numbers_total ?? 0;
  const done = j?.numbers_done ?? 0;
  const pct = results ? 100 : total ? Math.round((done / total) * 100) : 0;
  const ready = !!results && !error;

  // confirm and reveal are one view (the button shows the reveal); the content only changes between views
  const step = !items ? (preparing ? 'reveal' : 'confirm') : error ? 'error' : ready ? 'done' : 'check';
  const view = step === 'reveal' ? 'confirm' : step;

  return (
    <Dialog
      open={!!request}
      morph
      width={500}
      onClose={() => (step === 'check' ? void stop() : step === 'reveal' ? undefined : onClose())}
      title={step === 'confirm' || step === 'reveal' ? request?.title : step === 'done' ? 'TPS/CTPS check done' : 'Checking TPS/CTPS'}
      description={
        step === 'done'
          ? 'Choose what to export. The file includes each lead’s TPS/CTPS result.'
          : step === 'check'
            ? 'Every mobile in this export is checked against the TPS and Corporate TPS registers before you can download it.'
            : undefined
      }
      footer={
        step === 'confirm' ? (
          <>
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="primary" onClick={() => request && void go(request)}>
              {request?.action}
            </Button>
          </>
        ) : step === 'reveal' ? (
          <>
            <Button disabled>Cancel</Button>
            <Button variant="primary" disabled>
              <span className="tps-pulse h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
              Revealing…
            </Button>
          </>
        ) : step === 'done' ? (
          <>
            <Button onClick={() => download('failed')} disabled={!counts.failed}>
              Failed only ({n(counts.failed)})
            </Button>
            <Button onClick={() => download('passed')} disabled={!counts.passed}>
              Passed only ({n(counts.passed)})
            </Button>
            <Button variant="primary" onClick={() => download('all')}>
              Export all ({n(items?.length ?? 0)})
            </Button>
          </>
        ) : step === 'error' ? (
          <>
            <Button onClick={onClose}>Close</Button>
            {error?.topUp ? (
              <Button variant="primary" onClick={() => openSupport(TOP_UP_MESSAGE)}>
                <Coins size={14} /> Top up check credits
              </Button>
            ) : null}
          </>
        ) : (
          <Button onClick={() => void stop()}>Stop and cancel export</Button>
        )
      }
    >
      <div key={view} className="dialog-step-in">
        {view === 'confirm' ? (
          <div className="space-y-3">
            <p className="text-black-700">{request?.body ?? 'Getting your leads ready…'}</p>
            <p className="flex items-center gap-1.5 text-black-700">
              <ShieldCheck size={14} className="text-[#3f8f5e]" />
              Next, every mobile is checked against TPS and CTPS before you download.
            </p>
          </div>
        ) : view === 'error' ? (
          <p role="alert" className="text-[#94402f]">
            {error?.text} Nothing has been exported.
          </p>
        ) : view === 'done' ? (
          <div className="space-y-2.5">
            <Line dot={OUTCOMES.valid.bar} label="Passed: not on TPS or CTPS" value={counts.passed} />
            <Line dot={OUTCOMES.tps.bar} label="Failed: on TPS or CTPS (do not call)" value={counts.failed} />
            <Line dot={OUTCOMES.missing.bar} label="No UK mobile, invalid or not checked" value={counts.other} hint="Included in Export all only." />
            {j ? (
              <p className="flex items-center gap-1.5 pt-1 text-black-700">
                <ShieldCheck size={14} className="text-[#3f8f5e]" />
                {n(j.numbers_total - j.numbers_reused)} {j.numbers_total - j.numbers_reused === 1 ? 'number' : 'numbers'} checked now
                {j.numbers_reused ? `, ${n(j.numbers_reused)} clear in the last 30 days (free)` : ''}.
              </p>
            ) : null}
          </div>
        ) : (
          <div>
            <p className="flex items-baseline justify-between text-black-700">
              <span>
                <span className="font-medium tabular-nums text-black-400">{n(done)}</span> of {j ? n(total) : '…'} numbers checked
              </span>
              <span className="tabular-nums">{pct}%</span>
            </p>
            <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-[#edf2fd]" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
              <div className="h-full rounded-full bg-[#5f86e0] transition-[width] duration-500 ease-[cubic-bezier(0.2,0,0,1)]" style={{ width: `${Math.max(2, pct)}%` }} />
            </div>
            <p className="mt-3 min-h-[44px] text-black-700">
              {j
                ? `Uses ${n(j.credits_reserved)} check ${j.credits_reserved === 1 ? 'credit' : 'credits'}${
                    j.numbers_reused ? `; ${n(j.numbers_reused)} ${j.numbers_reused === 1 ? 'number was' : 'numbers were'} clear in the last 30 days, so free` : ''
                  }. You can export when the check is done.`
                : 'Starting the check. You can export when it is done.'}
            </p>
          </div>
        )}
      </div>
    </Dialog>
  );
}

function Line({ dot, label, value, hint }: { dot: string; label: string; value: number; hint?: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-[7px] h-2 w-2 shrink-0 rounded-full" style={{ background: dot }} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-black-400">{label}</p>
        {hint ? <p className="text-black-700">{hint}</p> : null}
      </div>
      <span className="font-medium tabular-nums text-black-400">{n(value)}</span>
    </div>
  );
}
