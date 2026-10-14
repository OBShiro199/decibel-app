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
