'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bookmark, Download, Eye, ListPlus, Plus, Search, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { track } from '@/lib/analytics';
import { useApp } from '@/lib/app-context';
import { industriesQuery, leadsQuery, marketsQuery, prefetchPerson, savedSearchesQuery } from '@/lib/queries';
import { COUNTRIES, countryName, MARKETS, SENIORITIES, seniorityLabel, SIZE_BANDS } from '@/lib/constants';
import { useDebounced, useFitRows, useLists } from '@/lib/hooks';
import { applyLeadFilters, EMPTY_FILTERS, type LeadFilters } from '@/lib/leads';
import { revealContacts } from '@/lib/reveal';
import { supabase } from '@/lib/supabase/client';
import type { ContactPublic, Person } from '@/lib/types';
import { cn, formatPhone, timeAgo, exportCsv as auditedCsv } from '@/lib/utils';
import { LeadFilterBar } from '@/components/app/lead-filters';
import { LeadsSkeleton } from '@/components/app/skeletons';
import { BulkAction, BulkBar, ListPickerDialog, PersonCell, TpsBadge } from '@/components/app/records';
import { RevealOnce } from '@/components/ui/reveal';
import { Button } from '@/components/ui/button';
import { Badge, EmptyState, ErrorCard, TableSkeleton, Tag } from '@/components/ui/display';
import { Checkbox, ChipsInput, Input } from '@/components/ui/form';
import { Dialog, MenuItem, Popover, useToast } from '@/components/ui/overlay';

// PostgREST counts exactly up to its row limit (1,000) and estimates above it
const APPROX_OVER = 1000;


export default function LeadsPage() {
  return (
    <Suspense fallback={<LeadsSkeleton />}>
      <Leads />
    </Suspense>
  );
}

function Leads() {
  const { workspace, user, refreshWorkspace } = useApp();
  const params = useSearchParams();
  const targetList = params.get('list');
  const qc = useQueryClient();
  const toast = useToast();
  const db = supabase();
  const { data: lists } = useLists();

  const [filters, setFilters] = useState<LeadFilters>(EMPTY_FILTERS);
  const [text, setText] = useState('');
  const q = useDebounced(text, 300);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [picker, setPicker] = useState<null | 'add' | 'create'>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const fit = useFitRows('leads');
  const PAGE = fit.rows;

  const active: LeadFilters = useMemo(() => ({ ...filters, q }), [filters, q]);
  const patch = (p: Partial<LeadFilters>) => {
    setFilters((f) => ({ ...f, ...p }));
    setPage(0);
    setSelected(new Set());
  };

  // Markets from onboarding step 2 limit which countries appear in search.
  const { data: allowed } = useQuery(marketsQuery(workspace.id));
  const { data: industries } = useQuery(industriesQuery());
  const saved = useQuery(savedSearchesQuery(workspace.id));

  const scoped: LeadFilters = useMemo(() => ({ ...active, countries: active.countries?.length ? active.countries : allowed }), [active, allowed]);

  const results = useQuery({ ...leadsQuery(workspace.id, scoped, page, PAGE), enabled: !!allowed && PAGE > 0, placeholderData: (prev) => prev });

  useEffect(() => {
    if (results.data && !results.isPlaceholderData) track('search_run', { filters: scoped, result_count: results.data.count });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results.data?.count, JSON.stringify(scoped)]);

  const contacts = results.data?.contacts ?? [];
  const revealed = results.data?.revealed ?? {};
  const ids = [...selected];
  const unrevealed = ids.filter((id) => !revealed[id]);
  const allSelected = contacts.length > 0 && contacts.every((c) => selected.has(c.id));
  const strictMarket = (scoped.countries ?? []).some((c) => c === 'DE' || c === 'AT') && (active.countries ?? []).some((c) => c === 'DE' || c === 'AT');

  const after = () => {
    void refreshWorkspace();
    ['leads', 'people', 'today', 'lists', 'list'].forEach((k) => void qc.invalidateQueries({ queryKey: [k] }));
  };

  const reveal = async (contactIds: string[], listId?: string | null) => {
    setBusy(contactIds.length === 1 ? contactIds[0] : 'bulk');
    const { people, error } = await revealContacts(workspace.id, contactIds, { listId, from: listId ? 'list' : 'search' });
    setBusy(null);
    if (error) toast(error.message, error.href ? { label: error.label ?? 'Fix', href: error.href } : undefined);
    after();
    return people;
  };

  const bulkReveal = async () => {
    const people = await reveal(ids);
    if (people.length) toast(`${people.length} added to People`);
    setSelected(new Set());
  };
  const addToList = async (listId: string) => {
    const people = await reveal(ids, listId);
    if (people.length) {
      track('person_added_to_list', { source: 'database', count: people.length });
      toast(`${people.length} added to the list`, { label: 'Open list', href: `/app/lists/${listId}` });
    }
    setSelected(new Set());
  };
  const exportCsv = () => {
    auditedCsv(workspace.id, 'leads',
      'decibel-leads.csv',
      contacts
        .filter((c) => selected.has(c.id))
        .map((c) => ({
          name: c.full_name,
          title: c.job_title,
          company: c.company_name,
          industry: c.industry,
          city: c.city,
          country: c.country_code,
          email: revealed[c.id]?.email ?? (c.has_email ? 'reveal to see' : ''),
          mobile: revealed[c.id]?.mobile_e164 ?? c.mobile_masked,
          tps_status: c.tps_status,
          last_verified: c.last_verified_at,
        })),
    );
  };

  const saveSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!saveName.trim()) return;
    await db.from('saved_searches').insert({ workspace_id: workspace.id, user_id: user.id, name: saveName.trim(), filters: active });
    setSaveOpen(false);
    setSaveName('');
    toast('Search saved');
    void saved.refetch();
  };

  const targetName = lists?.find((l) => l.id === targetList)?.name;
  const pages = PAGE ? Math.ceil((results.data?.count ?? 0) / PAGE) : 0;
  useEffect(() => {
    if (pages && page > pages - 1) setPage(pages - 1);
  }, [pages, page]);


  return (
    <div className="flex h-full">
      <div className="flex min-w-0 flex-1 flex-col bg-white-100">
        <div className="flex h-12 shrink-0 items-center gap-2 overflow-x-auto border-b border-white-800 px-4 [scrollbar-width:none]">
          <div className="relative">
            <Search size={16} strokeWidth={1.5} className="pointer-events-none absolute left-2.5 top-2 text-white-900" />
            <Input value={text} onChange={(e) => { setText(e.target.value); setPage(0); }} placeholder="Search name, company or title" className="h-8 w-72 pl-8 max-sm:w-44" aria-label="Search the database" />
          </div>
          <h1 className="text-sm text-black-700">
            {/* counts above 1,000 are the planner's estimate (count: 'estimated'), so say so */}
            {results.data && results.data.count > APPROX_OVER ? 'About ' : ''}
            <span className="text-black-400">{results.data ? results.data.count.toLocaleString('en-GB') : '…'}</span> contacts
          </h1>
          <Tag color={7}>Sample data</Tag>
          {targetList ? (
            <Link href={`/app/lists/${targetList}`} className="tag tag-1 max-w-[260px] truncate" title="Select contacts, then choose Add to list">
              Adding to {targetName ?? 'your list'} · back
            </Link>
          ) : null}
          {strictMarket ? (
            <span className="tag tag-2" title="Germany and Austria treat B2B cold calls more strictly than the UK. Take local advice before calling.">
              DE / AT: stricter calling rules
            </span>
          ) : null}
          <div className="ml-auto flex items-center gap-2">
            <Popover
              align="right"
              trigger={({ toggle }) => (
                <Button size="compact" onClick={toggle}>
                  <Bookmark size={16} strokeWidth={1.5} /> Saved
                </Button>
              )}
            >
              {(close) =>
                saved.data?.length ? (
                  saved.data.map((s) => (
                    <div key={s.id} className="flex items-center">
                      <MenuItem
                        onClick={() => {
                          const f = (s.filters ?? {}) as LeadFilters;
                          setFilters({ ...f, q: undefined });
                          setText(f.q ?? '');
                          setPage(0);
                          close();
                        }}
                      >
                        {s.name}
                      </MenuItem>
                      <button
                        aria-label={`Delete saved search ${s.name}`}
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm text-black-700 hover:bg-white-300"
                        onClick={async () => {
                          await db.from('saved_searches').delete().eq('id', s.id);
                          void saved.refetch();
                        }}
                      >
                        <Trash2 size={14} strokeWidth={1.5} />
                      </button>
                    </div>
                  ))
                ) : (
                  <p className="px-2 py-1.5 text-black-700">No saved searches yet.</p>
                )
              }
            </Popover>
            <Button size="compact" onClick={() => setSaveOpen(true)}>
              Save search
            </Button>
          </div>
        </div>
        <LeadFilterBar
          filters={filters}
          onChange={patch}
          onClear={() => {
            setFilters({});
            setText('');
            setPage(0);
          }}
          countries={allowed ?? []}
          industries={industries ?? []}
        />


        <div ref={fit.ref} className="min-h-0 flex-1 overflow-hidden">
          {results.error ? (
            <div className="p-4">
              <ErrorCard message={(results.error as Error).message} onRetry={() => results.refetch()} />
            </div>
          ) : results.isLoading || !results.data ? (
            <TableSkeleton rows={Math.max(8, PAGE)} cols={7} />
          ) : !contacts.length ? (
            <EmptyState shape="diamond" title="No results" description="Loosen a filter to see more contacts." action={<Button onClick={() => { setFilters({}); setText(''); }}>Clear filters</Button>} />
          ) : (
            <RevealOnce id="leads">
            <div className="tbl-wrap">
              <table className="tbl tbl-fixed"><colgroup><col style={{ width: 44 }} /><col style={{ width: 220 }} /><col style={{ width: 220 }} /><col style={{ width: 150 }} /><col style={{ width: 240 }} /><col style={{ width: 200 }} /><col style={{ width: 110 }} /><col style={{ width: 190 }} /><col style={{ width: 260 }} /><col style={{ width: 250 }} /><col style={{ width: 120 }} /><col style={{ width: 130 }} /></colgroup>
                <thead>
                  <tr>
                    <th className="w-10">
                      <Checkbox aria-label="Select all on this page" checked={allSelected} indeterminate={!allSelected && selected.size > 0} onChange={(v) => setSelected(v ? new Set(contacts.map((c) => c.id)) : new Set())} />
                    </th>
                    <th>Name</th>
                    <th>Title</th>
                    <th>Seniority</th>
                    <th>Company</th>
                    <th>Industry</th>
                    <th>Size</th>
                    <th>Location</th>
                    <th>Mobile</th>
                    <th>Email</th>
                    <th>TPS</th>
                    <th>Verified</th>
                  </tr>
                </thead>
                <tbody>
                  {contacts.map((c) => {
                    const mine = revealed[c.id];
                    return (
                      <tr key={c.id} data-selected={selected.has(c.id)} className="group">
                        <td>
                          <Checkbox
                            aria-label={`Select ${c.full_name}`}
                            checked={selected.has(c.id)}
                            onChange={(on) =>
                              setSelected((s) => {
                                const n = new Set(s);
                                if (on) n.add(c.id);
                                else n.delete(c.id);
                                return n;
                              })
                            }
                          />
                        </td>
                        <td>
                          {mine ? (
                            <Link href={`/app/people/${mine.id}`} onMouseEnter={() => prefetchPerson(qc, mine.id)} className="hover:underline">
                              <PersonCell name={c.full_name} />
                            </Link>
                          ) : (
                            <PersonCell name={c.full_name} />
                          )}
                        </td>
                        <td className="max-w-[230px] truncate text-black-500">{c.job_title ?? <span className="text-faint">–</span>}</td>
                        <td>{c.seniority ? <Tag>{seniorityLabel(c.seniority)}</Tag> : <span className="text-faint">–</span>}</td>
                        <td>
                          <span className="block truncate text-black-400">{c.company_name ?? '–'}</span>
                        </td>
                        <td>{c.industry ? <Tag>{c.industry}</Tag> : <span className="text-faint">–</span>}</td>
                        <td>{c.company_size_band ? <Tag color={7}>{c.company_size_band}</Tag> : <span className="text-faint">–</span>}</td>
                        <td className="text-black-700">{[c.city, c.country_code].filter(Boolean).join(', ')}</td>
                        <td>
                          <span className="flex items-center gap-2">
                            <span className={cn('tabular-nums text-xs', !mine && 'text-black-700')}>{mine?.mobile_e164 ? formatPhone(mine.mobile_e164) : (c.mobile_masked ?? '–')}</span>
                            {mine ? (
                              <Tag color={1}>Revealed</Tag>
                            ) : c.has_mobile ? (
                              <button
                                disabled={!!busy}
                                onClick={() => reveal([c.id])}
                                className="flex h-[22px] items-center gap-1 border border-btnborder bg-white-100 px-1.5 tabular-nums text-xs tracking-[0.06em] text-black-700 hover:border-black-0 hover:text-black-400 disabled:opacity-50"
                              >
                                <Eye size={12} strokeWidth={1.5} /> {busy === c.id ? 'Revealing' : 'Reveal · 1'}
                              </button>
                            ) : null}
                          </span>
                        </td>
                        <td className="text-black-700">
                          {mine?.email ?? (c.has_email ? <span className="tabular-nums text-xs">•••@{c.company_domain ?? '•••'}</span> : <span className="text-faint">–</span>)}
                        </td>
                        <td>
                          <TpsBadge status={c.tps_status} />
                        </td>
                        <td className="tabular-nums text-xs text-white-900">{timeAgo(c.last_verified_at)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            </RevealOnce>
          )}

        </div>

        {
          <div className="flex h-12 shrink-0 items-center justify-between border-t border-white-800 bg-panel px-4">
            <span className="t-label">
              {results.data ? `Page ${page + 1} / ${Math.max(1, pages)} · rows ${results.data.count ? page * PAGE + 1 : 0}–${Math.min((page + 1) * PAGE, results.data.count)}` : 'Loading'}
            </span>
            <div className="flex gap-2">
              <Button size="compact" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                Previous
              </Button>
              <Button size="compact" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}>
                Next
              </Button>
            </div>
          </div>
        }
      </div>

      <BulkBar count={selected.size} onClear={() => setSelected(new Set())}>
        <BulkAction disabled={!!busy} onClick={() => (targetList ? void addToList(targetList) : setPicker('add'))}>
          <ListPlus size={16} strokeWidth={1.5} /> {targetList ? `Add to ${targetName ?? 'list'}` : 'Add to list'}
        </BulkAction>
        <BulkAction disabled={!!busy} onClick={() => setPicker('create')}>
          <Plus size={16} strokeWidth={1.5} /> Create new list
        </BulkAction>
        <BulkAction disabled={!!busy || !unrevealed.length} onClick={bulkReveal}>
          <Eye size={16} strokeWidth={1.5} /> Reveal mobiles ({unrevealed.length} credit{unrevealed.length === 1 ? '' : 's'})
        </BulkAction>
        <BulkAction onClick={exportCsv}>
          <Download size={16} strokeWidth={1.5} /> Export CSV
        </BulkAction>
      </BulkBar>

      <ListPickerDialog
        open={!!picker}
        createOnly={picker === 'create'}
        onClose={() => setPicker(null)}
        onPick={addToList}
        title={`Add ${ids.length} to list${unrevealed.length ? ` (${unrevealed.length} credit${unrevealed.length === 1 ? '' : 's'})` : ''}`}
        busyLabel="Revealing…"
      />
      <Dialog open={saveOpen} onClose={() => setSaveOpen(false)} title="Save search">
        <form onSubmit={saveSearch} className="flex flex-col gap-4">
          <Input autoFocus value={saveName} onChange={(e) => setSaveName(e.target.value)} placeholder="Manchester SaaS founders" aria-label="Search name" />
          <div className="flex justify-end gap-2">
            <Button onClick={() => setSaveOpen(false)}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={!saveName.trim()}>
              Save
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
