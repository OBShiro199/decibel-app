'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Search } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useApp } from '@/lib/app-context';
import { companiesQuery, prefetchPerson } from '@/lib/queries';
import { SIZE_BANDS } from '@/lib/constants';
import { useDebounced } from '@/lib/hooks';
import { supabase } from '@/lib/supabase/client';
import type { Person, TenantCompany } from '@/lib/types';
import { formatDate } from '@/lib/utils';
import { OutcomeBadge, PersonCell } from '@/components/app/records';
import { RevealOnce } from '@/components/ui/reveal';
import { Button, ButtonLink } from '@/components/ui/button';
import { CompanyLogo, EmptyState, ErrorCard, TableSkeleton, Tag } from '@/components/ui/display';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { Dialog, Drawer, useToast } from '@/components/ui/overlay';

type Row = TenantCompany & { people: { count: number }[] };

export default function CompaniesPage() {
  const { workspace, user } = useApp();
  const qc = useQueryClient();
  const toast = useToast();
  const db = supabase();
  const [search, setSearch] = useState('');
  const term = useDebounced(search, 250);
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: '', domain: '', industry: '', size_band: '', city: '' });
  const [error, setError] = useState<string | null>(null);

  const companies = useQuery(companiesQuery(workspace.id));
  const rows = useMemo(() => {
    const t = term.trim().toLowerCase();
    return (companies.data ?? []).filter((c) => !t || [c.name, c.domain, c.industry, c.city].some((v) => v?.toLowerCase().includes(t)));
  }, [companies.data, term]);
  const current = companies.data?.find((c) => c.id === openId) ?? null;

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return setError('Company name is required.');
    const { error } = await db.from('tenant_companies').insert({
      workspace_id: workspace.id,
      name: form.name.trim(),
      domain: form.domain.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '') || null,
      industry: form.industry.trim() || null,
      size_band: form.size_band || null,
      city: form.city.trim() || null,
      owner_id: user.id,
    });
    if (error) return setError(/duplicate|unique/i.test(error.message) ? 'A company with that domain already exists.' : error.message);
    setAdding(false);
    setForm({ name: '', domain: '', industry: '', size_band: '', city: '' });
    toast('Company added');
    void qc.invalidateQueries({ queryKey: ['companies'] });
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-12 shrink-0 items-center gap-2 overflow-x-auto border-b border-white-800 bg-white-100 px-4 [scrollbar-width:none]">
        <div className="relative">
          <Search size={16} strokeWidth={1.5} className="pointer-events-none absolute left-2.5 top-2 text-white-900" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filter companies" className="h-8 w-64 pl-8" aria-label="Filter companies" />
        </div>
        <span className="t-small tabular text-black-700">{rows.length.toLocaleString('en-GB')} {rows.length === 1 ? 'company' : 'companies'}</span>
        <Button size="compact" variant="primary" className="ml-auto" onClick={() => { setError(null); setAdding(true); }}>
          <Plus size={16} strokeWidth={1.5} /> Add company
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-white-100">
        {companies.error ? (
          <div className="p-4">
            <ErrorCard message={(companies.error as Error).message} onRetry={() => companies.refetch()} />
          </div>
        ) : companies.isLoading ? (
          <TableSkeleton rows={10} cols={5} />
        ) : !companies.data?.length ? (
          <EmptyState
            title="No companies found"
            description="Companies are added automatically when you reveal a contact from the database or import a CSV."
            action={
              <ButtonLink variant="primary" href="/app/leads">
                Add from database
              </ButtonLink>
            }
          />
        ) : (
          <RevealOnce id="companies">
          <div className="tbl-wrap"><table className="tbl tbl-fixed"><colgroup><col /><col style={{ width: 200 }} /><col style={{ width: 210 }} /><col style={{ width: 110 }} /><col style={{ width: 160 }} /><col style={{ width: 90 }} /><col style={{ width: 130 }} /></colgroup>
            <thead>
              <tr>
                <th>Company</th>
                <th>Website</th>
                <th>Industry</th>
                <th>Size</th>
                <th>Location</th>
                <th>People</th>
                <th>Added</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} onClick={() => setOpenId(c.id)} className="cursor-pointer">
                  <td className="font-medium text-black-400">{c.name}</td>
                  <td className="text-black-700">{c.domain ?? <span className="text-faint">–</span>}</td>
                  <td>{c.industry ? <Tag>{c.industry}</Tag> : <span className="text-faint">–</span>}</td>
                  <td>{c.size_band ? <Tag color={7}>{c.size_band}</Tag> : <span className="text-faint">–</span>}</td>
                  <td className="text-black-700">{c.city ?? '–'}</td>
                  <td className="tabular">{c.people?.[0]?.count ?? 0}</td>
                  <td className="t-caption text-black-700">{formatDate(c.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
          </RevealOnce>
        )}
      </div>

      <Drawer open={!!current} onClose={() => setOpenId(null)} title={current?.name}>
        {current ? <CompanyDetail company={current} /> : null}
      </Drawer>

      <Dialog open={adding} onClose={() => setAdding(false)} title="Add company">
        <form onSubmit={add} className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" htmlFor="co-name" className="sm:col-span-2">
            <Input id="co-name" autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Website" htmlFor="co-domain">
            <Input id="co-domain" placeholder="brightmoor.co.uk" value={form.domain} onChange={(e) => setForm({ ...form, domain: e.target.value })} />
          </Field>
          <Field label="Industry" htmlFor="co-ind">
            <Input id="co-ind" value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} />
          </Field>
          <Field label="Size" htmlFor="co-size">
            <Select id="co-size" value={form.size_band} onChange={(e) => setForm({ ...form, size_band: e.target.value })}>
              <option value="">Unknown</option>
              {SIZE_BANDS.map((s) => (
                <option key={s} value={s}>
                  {s} employees
                </option>
              ))}
            </Select>
          </Field>
          <Field label="City" htmlFor="co-city">
            <Input id="co-city" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
          </Field>
          {error ? <p className="text-danger-700 sm:col-span-2" role="alert">{error}</p> : null}
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button onClick={() => setAdding(false)}>Cancel</Button>
            <Button type="submit" variant="primary">
              Add company
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}

function CompanyDetail({ company }: { company: TenantCompany }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [notes, setNotes] = useState(company.notes ?? '');
  const people = useQuery({
    queryKey: ['companies', company.id, 'people'], placeholderData: undefined,
    queryFn: async () => ((await supabase().from('people').select('id,full_name,job_title,last_outcome').eq('tenant_company_id', company.id).order('full_name')).data ?? []) as Pick<Person, 'id' | 'full_name' | 'job_title' | 'last_outcome'>[],
  });
  const save = async () => {
    const { error } = await supabase().from('tenant_companies').update({ notes: notes.trim() || null }).eq('id', company.id);
    toast(error ? `Could not save: ${error.message}` : 'Notes saved');
    void qc.invalidateQueries({ queryKey: ['companies'] });
  };
  return (
    <div className="flex flex-col gap-6 p-4">
      <div className="flex items-center gap-3">
        <CompanyLogo name={company.name} size={40} />
        <div className="min-w-0">
          <p className="t-h3 truncate">{company.name}</p>
          <p className="truncate text-black-700">{[company.industry, company.size_band ? `${company.size_band} employees` : null, company.city].filter(Boolean).join(' · ')}</p>
        </div>
      </div>
      {company.domain ? (
        <a className="link" href={`https://${company.domain}`} target="_blank" rel="noreferrer">
          {company.domain}
        </a>
      ) : null}
      <section>
        <h3 className="t-h4 mb-2">People ({people.data?.length ?? 0})</h3>
        {people.data?.length ? (
          <ul className="card divide-y divide-white-800">
            {people.data.map((p) => (
              <li key={p.id}>
                <Link href={`/app/people/${p.id}`} onMouseEnter={() => prefetchPerson(qc, p.id)} className="flex min-h-11 items-center gap-2 px-3 py-1.5 hover:bg-white-300">
                  <span className="min-w-0 flex-1">
                    <PersonCell name={p.full_name} sub={p.job_title} />
                  </span>
                  <OutcomeBadge outcome={p.last_outcome} />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-black-700">It seems {company.name} doesn&apos;t have people yet.</p>
        )}
      </section>
      <section>
        <h3 className="t-h4 mb-2">Notes</h3>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Account notes" aria-label="Company notes" className="min-h-[120px]" />
        <Button className="mt-2" size="compact" onClick={save} disabled={notes === (company.notes ?? '')}>
          Save notes
        </Button>
      </section>
    </div>
  );
}
