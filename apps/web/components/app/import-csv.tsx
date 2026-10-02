'use client';
import { useQueryClient } from '@tanstack/react-query';
import { FileSpreadsheet, Upload } from 'lucide-react';
import Papa from 'papaparse';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/form';
import { Dialog } from '@/components/ui/overlay';
import { useApp } from '@/lib/app-context';
import { invoke, supabase, type FunctionError } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 10_000;

const FIELDS = [
  { value: 'first_name', label: 'First name' },
  { value: 'last_name', label: 'Last name' },
  { value: 'full_name', label: 'Full name' },
  { value: 'job_title', label: 'Job title' },
  { value: 'email', label: 'Email' },
  { value: 'mobile', label: 'Mobile' },
  { value: 'direct_dial', label: 'Direct dial' },
  { value: 'company', label: 'Company' },
  { value: 'linkedin_url', label: 'LinkedIn URL' },
  { value: 'city', label: 'City' },
  { value: 'country_code', label: 'Country code' },
] as const;
type FieldKey = (typeof FIELDS)[number]['value'];
type Mapping = Record<string, FieldKey | ''>;
type Step = 'upload' | 'map' | 'preview' | 'importing' | 'done';
const fieldLabel = (f: FieldKey) => FIELDS.find((x) => x.value === f)?.label ?? f;

/** Best guess of the target field from a CSV header. Order matters: specific patterns first. */
function guessField(header: string): FieldKey | '' {
  const h = header.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const tests: [RegExp, FieldKey][] = [
    [/^(first|first name|firstname|given name|forename)$/, 'first_name'],
    [/^(last|last name|lastname|surname|family name)$/, 'last_name'],
    [/^(name|full name|fullname|contact|contact name|person)$/, 'full_name'],
    [/linkedin/, 'linkedin_url'],
    [/e ?mail/, 'email'],
    [/direct|ddi|landline|office phone|work phone/, 'direct_dial'],
    [/mobile|cell|phone|telephone|^tel$|number/, 'mobile'],
    [/title|position|role|job/, 'job_title'],
    [/company|organisation|organization|employer|account|business/, 'company'],
    [/city|town/, 'city'],
    [/country/, 'country_code'],
  ];
  return tests.find(([re]) => re.test(h))?.[1] ?? '';
}

function autoMap(headers: string[]): Mapping {
  const used = new Set<FieldKey>();
  const map: Mapping = {};
  headers.forEach((h) => {
    const g = guessField(h);
    if (g && !used.has(g)) {
      used.add(g);
      map[h] = g;
    } else map[h] = '';
  });
  return map;
}

function describeImportError(e: unknown): string {
  const err = e as FunctionError;
  const m = err?.message ?? '';
  if (m === 'forbidden') return 'Only owners and admins can import people.';
  if (/Failed to send a request|Failed to fetch/i.test(m)) return 'Could not reach the import service. Check that the Edge Functions are deployed.';
  return m || 'Something went wrong.';
}

export function ImportCsvDialog({
  open,
  onClose,
  onDone,
  listId,
}: {
  open: boolean;
  onClose: () => void;
  onDone?: (result: { imported: number; skipped: number }) => void;
  listId?: string | null;
}) {
  const { user, workspace, isAdmin } = useApp();
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Mapping>({});
  const [parsing, setParsing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ imported: number; skipped: number } | null>(null);

  useEffect(() => {
    if (open) return;
    setStep('upload');
    setFile(null);
    setHeaders([]);
    setRows([]);
    setMapping({});
    setParsing(false);
    setDragging(false);
    setError(null);
    setResult(null);
  }, [open]);

  const mapped = useMemo(() => headers.filter((h) => mapping[h]).map((h) => ({ header: h, field: mapping[h] as FieldKey })), [headers, mapping]);
  const chosen = new Set(mapped.map((m) => m.field));
  const duplicates = FIELDS.filter((f) => mapped.filter((m) => m.field === f.value).length > 1).map((f) => f.label);
  const hasName = chosen.has('first_name') || chosen.has('full_name');
  const hasContact = chosen.has('email') || chosen.has('mobile');
  const canContinue = hasName && hasContact && duplicates.length === 0;

  function pick(f: File | undefined | null) {
    if (!f) return;
    setError(null);
    if (!/\.csv$/i.test(f.name)) return setError('Choose a .csv file. In Excel or Google Sheets, use "Save as" or "Download" and pick CSV.');
    if (f.size > MAX_BYTES) return setError('That file is larger than 5 MB. Split it into smaller files and import them one at a time.');
    setParsing(true);
    Papa.parse<Record<string, string>>(f, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        setParsing(false);
        const hs = (res.meta.fields ?? []).filter((h) => h && h.trim());
        if (!hs.length || !res.data.length) return setError('We could not find any rows in that file. Check that the first row contains column names.');
        if (res.data.length > MAX_ROWS) return setError(`That file has ${res.data.length.toLocaleString('en-GB')} rows. The limit is ${MAX_ROWS.toLocaleString('en-GB')} per import.`);
        setFile(f);
        setHeaders(hs);
        setRows(res.data);
        setMapping(autoMap(hs));
        setStep('map');
      },
      error: (err) => {
        setParsing(false);
        setError(`We could not read that file: ${err.message}`);
      },
    });
  }

  async function runImport() {
    if (!file) return;
    setStep('importing');
    setError(null);
    try {
      const path = `${workspace.id}/${crypto.randomUUID()}.csv`;
      const up = await supabase().storage.from('imports').upload(path, file, { contentType: 'text/csv' });
      if (up.error) throw new Error(up.error.message);
      const column_map: Record<string, string> = {};
      mapped.forEach((m) => (column_map[m.header] = m.field));
      const ins = await supabase()
        .from('imports')
        .insert({ workspace_id: workspace.id, user_id: user.id, storage_path: path, filename: file.name, status: 'mapping', column_map, list_id: listId ?? null })
        .select('id')
        .single();
      if (ins.error) throw new Error(ins.error.message);
      const res = await invoke<{ imported: number; skipped: number }>('import-csv', { import_id: ins.data.id });
      const out = { imported: res.imported ?? 0, skipped: res.skipped ?? 0 };
      setResult(out);
      setStep('done');
      (['people', 'today', 'imports', 'list'] as const).forEach((k) => void qc.invalidateQueries({ queryKey: [k] }));
      onDone?.(out);
    } catch (e) {
      setError(describeImportError(e));
      setStep('preview');
      void qc.invalidateQueries({ queryKey: ['imports'] });
    }
  }

  const steps: { id: Step; label: string }[] = [
    { id: 'upload', label: 'Upload' },
    { id: 'map', label: 'Map columns' },
    { id: 'preview', label: 'Preview' },
    { id: 'done', label: 'Import' },
  ];
  const stepIndex = step === 'importing' ? 3 : steps.findIndex((s) => s.id === step);
  const errorBox = error ? (
    <p role="alert" className="t-small mt-4 rounded-sm border border-danger-500 bg-danger-100 px-3 py-2 text-danger-700">
      {error}
    </p>
  ) : null;

  let footer: React.ReactNode = null;
  if (!isAdmin) footer = <Button onClick={onClose}>Close</Button>;
  else if (step === 'upload') footer = <Button onClick={onClose}>Cancel</Button>;
  else if (step === 'map')
    footer = (
      <>
        <Button onClick={() => { setStep('upload'); setError(null); }}>Back</Button>
        <Button variant="primary" disabled={!canContinue} onClick={() => setStep('preview')}>
          Continue
        </Button>
      </>
    );
  else if (step === 'preview')
    footer = (
      <>
        <Button onClick={() => { setStep('map'); setError(null); }}>Back</Button>
        <Button variant="primary" onClick={runImport}>
          Import {rows.length.toLocaleString('en-GB')} row{rows.length === 1 ? '' : 's'}
        </Button>
      </>
    );
  else if (step === 'done')
    footer = (
      <Button variant="primary" onClick={onClose}>
        Done
      </Button>
    );

  return (
    <Dialog open={open} onClose={step === 'importing' ? () => {} : onClose} title="Import CSV" width={720} footer={footer}>
      {!isAdmin ? (
        <p className="rounded-sm border border-white-800 bg-white-200 px-3 py-2 text-black-700">Only owners and admins can import people. Ask an admin to run the import, or to change your role.</p>
      ) : (
        <>
          <ol className="t-small mb-5 flex flex-wrap items-center gap-x-2 gap-y-1 text-black-700">
            {steps.map((s, i) => (
              <li key={s.id} className="flex items-center gap-2">
                <span className={cn('flex items-center gap-1.5', i === stepIndex && 'text-black-400')} aria-current={i === stepIndex ? 'step' : undefined}>
                  <span className={cn('tabular flex h-5 w-5 items-center justify-center rounded-full border t-caption', i <= stepIndex ? 'border-black-0 bg-black-0 text-white-100' : 'border-white-800')}>{i + 1}</span>
                  {s.label}
                </span>
                {i < steps.length - 1 ? <span className="h-px w-4 bg-white-800" aria-hidden /> : null}
              </li>
            ))}
          </ol>

          {step === 'upload' ? (
            <>
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  pick(e.dataTransfer.files?.[0]);
                }}
                className={cn('flex flex-col items-center rounded-lg border border-dashed px-6 py-10 text-center transition-colors', dragging ? 'border-accent-500 bg-accent-50' : 'border-white-800 bg-white-200')}
              >
                <Upload size={20} strokeWidth={1.5} className="text-black-700" />
                <p className="mt-3">Drag a CSV file here, or choose one from your computer.</p>
                <p className="t-small mt-1 text-black-700">Up to 5 MB or 10,000 rows. The first row must contain column names.</p>
                <Button className="mt-4" loading={parsing} onClick={() => inputRef.current?.click()}>
                  Choose file
                </Button>
                <input
                  ref={inputRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={(e) => {
                    pick(e.target.files?.[0]);
                    e.target.value = '';
                  }}
                />
              </div>
              {errorBox}
            </>
          ) : null}

          {step === 'map' ? (
            <>
              <p className="flex items-center gap-2 text-black-700">
                <FileSpreadsheet size={16} strokeWidth={1.5} className="shrink-0" />
                <span className="min-w-0 truncate">
                  {file?.name} · {rows.length.toLocaleString('en-GB')} row{rows.length === 1 ? '' : 's'}
                </span>
              </p>
              <div className="mt-4 max-h-[46vh] overflow-auto rounded-md border border-white-800">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>CSV column</th>
                      <th>Example</th>
                      <th className="w-48">Import as</th>
                    </tr>
                  </thead>
                  <tbody>
                    {headers.map((h) => (
                      <tr key={h}>
                        <td className="max-w-[180px] truncate" title={h}>{h}</td>
                        <td className="max-w-[200px] truncate text-black-700">{rows.find((r) => (r[h] ?? '').trim())?.[h] ?? ''}</td>
                        <td>
                          <Select aria-label={`Import ${h} as`} value={mapping[h] ?? ''} onChange={(e) => setMapping((m) => ({ ...m, [h]: e.target.value as FieldKey | '' }))} className="[&_select]:h-8">
                            <option value="">Ignore</option>
                            {FIELDS.map((f) => (
                              <option key={f.value} value={f.value}>
                                {f.label}
                              </option>
                            ))}
                          </Select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ul className="t-small mt-3 space-y-1 text-black-700">
                {!hasName ? <li className="text-danger-700">Map a column to First name or Full name.</li> : null}
                {!hasContact ? <li className="text-danger-700">Map a column to Email or Mobile.</li> : null}
                {duplicates.length ? <li className="text-danger-700">{duplicates.join(', ')} mapped more than once. Each field can be used for one column only.</li> : null}
                {canContinue ? <li>{mapped.length} of {headers.length} columns will be imported.</li> : null}
              </ul>
            </>
          ) : null}

          {step === 'preview' || step === 'importing' ? (
            <>
              <div className="max-h-[42vh] overflow-auto rounded-md border border-white-800">
                <table className="tbl">
                  <thead>
                    <tr>
                      {mapped.map((m) => (
                        <th key={m.header}>{fieldLabel(m.field)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 10).map((r, i) => (
                      <tr key={i}>
                        {mapped.map((m) => (
                          <td key={m.header} className="max-w-[200px] truncate">{r[m.header] ?? ''}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="t-small mt-3 text-black-700">
                Showing the first {Math.min(10, rows.length)} of {rows.length.toLocaleString('en-GB')} rows. Duplicates (same email or mobile as an existing person) are skipped. Every number is checked against TPS and your DNC list.
              </p>
              {step === 'importing' ? (
                <p className="mt-4 flex items-center gap-2" aria-live="polite">
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-accent-500 border-t-transparent" aria-hidden />
                  Importing {rows.length.toLocaleString('en-GB')} rows. Keep this window open.
                </p>
              ) : null}
              {errorBox}
            </>
          ) : null}

          {step === 'done' && result ? (
            <div className="rounded-lg border border-white-800 bg-white-200 px-6 py-8 text-center" aria-live="polite">
              <p className="t-h3">
                Imported {result.imported.toLocaleString('en-GB')}, skipped {result.skipped.toLocaleString('en-GB')}
              </p>
              <p className="mt-2 text-black-700">
                {result.skipped ? 'Skipped rows were duplicates or had no usable name, email or mobile.' : 'Every row was imported.'}
                {listId ? ' New people were added to this list.' : ''}
              </p>
            </div>
          ) : null}
        </>
      )}
    </Dialog>
  );
}
