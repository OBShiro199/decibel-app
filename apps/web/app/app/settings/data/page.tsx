'use client';
import { useQuery } from '@tanstack/react-query';
import { Download, Upload } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ImportCsvDialog } from '@/components/app/import-csv';
import { Button } from '@/components/ui/button';
import { Badge, ErrorCard, TableSkeleton } from '@/components/ui/display';
import { useToast } from '@/components/ui/overlay';
import { useApp } from '@/lib/app-context';
import type { Tone } from '@/lib/constants';
import { useMemberNames } from '@/lib/hooks';
import { supabase } from '@/lib/supabase/client';
import { formatDate, exportCsv as auditedCsv } from '@/lib/utils';
import { AdminOnly, errorMessage, fetchAll, Notice, Section, SettingsPage } from '../_components';

interface ImportRow {
  id: string;
  filename: string | null;
  status: 'uploaded' | 'mapping' | 'processing' | 'completed' | 'failed';
  row_count: number | null;
  imported_count: number | null;
  skipped_count: number | null;
  error: string | null;
  created_at: string;
}
const STATUS: Record<ImportRow['status'], { label: string; tone: Tone }> = {
  uploaded: { label: 'Uploaded', tone: 'neutral' },
  mapping: { label: 'Not started', tone: 'neutral' },
  processing: { label: 'Processing', tone: 'warning' },
  completed: { label: 'Completed', tone: 'success' },
  failed: { label: 'Failed', tone: 'danger' },
};
const today = () => new Date().toISOString().slice(0, 10);

export default function DataPage() {
  const { workspace, isAdmin } = useApp();
  const toast = useToast();
  const names = useMemberNames();
  const [importOpen, setImportOpen] = useState(false);
  const [exporting, setExporting] = useState<'people' | 'calls' | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('import') === '1') {
      setImportOpen(true);
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, []);

  const imports = useQuery({
    queryKey: ['imports', workspace.id],
    queryFn: async () => {
      const { data, error: err } = await supabase()
        .from('imports')
        .select('id,filename,status,row_count,imported_count,skipped_count,error,created_at')
        .eq('workspace_id', workspace.id)
        .order('created_at', { ascending: false })
        .limit(50);
      if (err) throw err;
      return (data ?? []) as ImportRow[];
    },
    refetchInterval: (q) => ((q.state.data ?? []).some((r) => r.status === 'processing') ? 4000 : false),
  });

  async function exportPeople() {
    setExporting('people');
    setError(null);
    try {
      type Row = Record<string, unknown> & { company?: { name?: string } | { name?: string }[] | null };
      const rows = await fetchAll<Row>((from, to) =>
        supabase()
          .from('people')
          .select('full_name,job_title,email,mobile_e164,city,country_code,tps_status,do_not_call,last_outcome,call_count,last_called_at,source,created_at,company:tenant_companies(name)')
          .eq('workspace_id', workspace.id)
          .order('created_at')
          .order('id')
          .range(from, to),
      );
      if (!rows.length) return toast('No people to export');
      auditedCsv(workspace.id, 'people',
        `decibel-people-${today()}.csv`,
        rows.map((r) => {
          const company = Array.isArray(r.company) ? r.company[0] : r.company;
          return {
            full_name: r.full_name,
            job_title: r.job_title,
            company: company?.name ?? '',
            email: r.email,
            mobile: r.mobile_e164,
            city: r.city,
            country_code: r.country_code,
            tps_status: r.tps_status,
            do_not_call: r.do_not_call,
            last_outcome: r.last_outcome,
            call_count: r.call_count,
            last_called_at: r.last_called_at,
            source: r.source,
            created_at: r.created_at,
          };
        }),
      );
      toast(`Exported ${rows.length.toLocaleString('en-GB')} people`);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setExporting(null);
    }
  }

  async function exportCalls() {
    setExporting('calls');
    setError(null);
    try {
      type Row = Record<string, unknown> & { user_id: string | null; person?: { full_name?: string } | { full_name?: string }[] | null };
      const rows = await fetchAll<Row>((from, to) =>
        supabase()
          .from('calls')
          .select('started_at,direction,kind,from_e164,to_e164,status,outcome,duration_seconds,talk_seconds,notes,user_id,person:people(full_name)')
          .eq('workspace_id', workspace.id)
          .order('started_at')
          .order('id')
          .range(from, to),
      );
      if (!rows.length) return toast('No calls to export');
      auditedCsv(workspace.id, 'calls',
        `decibel-calls-${today()}.csv`,
        rows.map((r) => {
          const person = Array.isArray(r.person) ? r.person[0] : r.person;
          return {
            started_at: r.started_at,
            rep: r.user_id ? names[r.user_id] ?? '' : '',
            person: person?.full_name ?? '',
            direction: r.direction,
            kind: r.kind,
            from: r.from_e164,
            to: r.to_e164,
            status: r.status,
            outcome: r.outcome,
            duration_seconds: r.duration_seconds,
            talk_seconds: r.talk_seconds,
            notes: r.notes,
          };
        }),
      );
      toast(`Exported ${rows.length.toLocaleString('en-GB')} calls`);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setExporting(null);
    }
  }

  return (
    <SettingsPage title="Imports & exports" description="Bring your own contacts in, and take your data out whenever you like.">
      <Section
        title="Imports"
        description="Upload a CSV of people. Duplicates are skipped and every number is checked against TPS and your DNC list."
        actions={
          <Button variant="primary" disabled={!isAdmin} onClick={() => setImportOpen(true)}>
            <Upload size={16} strokeWidth={1.5} />
            Import CSV
          </Button>
        }
      >
        {!isAdmin ? <AdminOnly className="mb-4">Only owners and admins can import people.</AdminOnly> : null}
        {imports.isError ? (
          <ErrorCard message="Could not load import history." onRetry={() => imports.refetch()} />
        ) : (
          <div className="card overflow-x-auto">
            {imports.isLoading ? (
              <TableSkeleton rows={3} cols={5} />
            ) : !imports.data?.length ? (
              <p className="p-6 text-black-700">No imports yet.</p>
            ) : (
              <table className="tbl">
                <thead>
                  <tr>
                    <th>File</th>
                    <th>Status</th>
                    <th className="text-right">Imported</th>
                    <th className="text-right">Skipped</th>
                    <th>Date</th>
                    <th>Error</th>
                  </tr>
                </thead>
                <tbody>
                  {imports.data.map((r) => {
                    const s = STATUS[r.status] ?? STATUS.uploaded;
                    return (
                      <tr key={r.id}>
                        <td className="max-w-[220px] truncate" title={r.filename ?? ''}>{r.filename || 'Untitled.csv'}</td>
                        <td>
                          <Badge tone={s.tone}>{s.label}</Badge>
                        </td>
                        <td className="tabular text-right">{r.status === 'completed' ? (r.imported_count ?? 0).toLocaleString('en-GB') : ''}</td>
                        <td className="tabular text-right">{r.status === 'completed' ? (r.skipped_count ?? 0).toLocaleString('en-GB') : ''}</td>
                        <td className="whitespace-nowrap text-black-700">{formatDate(r.created_at, true)}</td>
                        <td className="max-w-[220px] truncate text-danger-700" title={r.error ?? ''}>{r.error ?? ''}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}
      </Section>

      <Section title="Exports" description="Downloads include everything you are allowed to see in this workspace.">
        {error ? <Notice tone="danger" className="mb-4">{error}</Notice> : null}
        <div className="card divide-y divide-white-800">
          <div className="flex flex-wrap items-center gap-4 p-6">
            <div className="min-w-0 flex-1">
              <p>People</p>
              <p className="t-small mt-0.5 text-black-700">Name, company, contact details, TPS status and call history summary.</p>
            </div>
            <Button loading={exporting === 'people'} disabled={exporting !== null} onClick={exportPeople}>
              <Download size={16} strokeWidth={1.5} />
              Export people (CSV)
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-4 p-6">
            <div className="min-w-0 flex-1">
              <p>Calls</p>
              <p className="t-small mt-0.5 text-black-700">Every call with rep, numbers, outcome, duration and notes. Recordings are not included.</p>
            </div>
            <Button loading={exporting === 'calls'} disabled={exporting !== null} onClick={exportCalls}>
              <Download size={16} strokeWidth={1.5} />
              Export calls (CSV)
            </Button>
          </div>
        </div>
      </Section>

      <ImportCsvDialog open={importOpen} onClose={() => setImportOpen(false)} />
    </SettingsPage>
  );
}
