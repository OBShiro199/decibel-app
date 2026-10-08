'use client';
// The lead search workspace over the real lead database (data_list), searched on the server with stackable filters
// (search_leads / count_leads). Mobiles and emails stay masked until revealed; revealing,
// adding to a list and exporting all go through reveal_leads, so every contact that leaves
// Decibel has been paid for once (1 credit, free if this workspace already revealed it).
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bookmark, Download, Eye, Linkedin, ListPlus, Phone, Plus, Search, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { track } from '@/lib/analytics';
import { useApp } from '@/lib/app-context';
import { prefetchPerson, savedSearchesQuery } from '@/lib/queries';
import { diallerListName } from '@/lib/dialler';
import { useDebounced, useLists } from '@/lib/hooks';
import {
  COUNT_CAP,
  facetsQuery,
  formatCount,
  fromSaved,
  LEAD_FILTERS,
  leadCountQuery,
  leadIdsForFilters,
  leadSearchQuery,
  PAGE_SIZE,
  toServer,
  type Filters,
  type LeadRow,
} from '@/lib/lead-search';
import { revealLeads } from '@/lib/reveal';
import { supabase } from '@/lib/supabase/client';
import type { Person } from '@/lib/types';
import { cn, exportCsv, formatPhone } from '@/lib/utils';
import { prettyValue, SmartFilterBar } from '@/components/app/smart-filters';
import { BulkAction, BulkBar, ListPickerDialog, PersonCell } from '@/components/app/records';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorCard, TableSkeleton, Tag } from '@/components/ui/display';
import { Checkbox, Input } from '@/components/ui/form';
import { Dialog, MenuItem, Popover, useToast } from '@/components/ui/overlay';

const DEFAULT_FILTERS: Filters = { hasMobile: true };
const EXPORT_MAX = 500;

const def = (key: string) => LEAD_FILTERS.find((d) => d.key === key)!;
const dash = <span className="text-faint">–</span>;

/** A CSV row for an exported lead: the workspace's revealed copy plus the company details. */
function csvRow(lead: LeadRow | undefined, p: Person) {
  return {
    first_name: p.first_name,
    last_name: p.last_name,
    title: p.job_title ?? lead?.current_title ?? '',
    seniority: lead?.seniority_level ?? '',
    department: lead?.department ?? '',
    company: lead?.company_name ?? '',
    company_domain: lead?.company_domain ?? '',
    industry: lead?.main_industry ?? lead?.company_industry ?? '',
    company_size: lead?.employee_count_range ?? '',
    employees: lead?.employee_count ?? '',
    revenue: lead?.revenue_range ?? '',
    city: lead?.contact_city ?? p.city ?? '',
    country: lead?.contact_country ?? '',
    mobile: p.mobile_e164 ?? '',
    email: p.email ?? '',
    email_status: lead?.email_status ?? '',
    linkedin: p.linkedin_url ?? lead?.linkedin_url ?? '',
    hiring: lead?.is_hiring ? 'yes' : '',
    open_to_work: lead?.open_to_work ? 'yes' : '',
  };
}

/**
 * The lead search workspace: toolbar, stackable filters, results, selection bar. Used by the
 * Leads page and by Search with AI (which passes the filters it built and a banner).
 */
export function LeadsView({ initialFilters = DEFAULT_FILTERS, initialText = '', banner }: { initialFilters?: Filters; initialText?: string; banner?: React.ReactNode }) {
  const { workspace, user, refreshWorkspace } = useApp();
  const params = useSearchParams();
  const router = useRouter();
  const targetList = params.get('list');
  const qc = useQueryClient();
  const toast = useToast();
  const db = supabase();
  const { data: lists } = useLists();

  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [text, setText] = useState(initialText);
  const q = useDebounced(text, 300);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [picker, setPicker] = useState<null | 'add' | 'create' | 'save-filtered'>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<null | { title: string; body: string; action: string; run: () => Promise<void> }>(null);

  const server = useMemo(() => toServer(filters, q), [filters, q]);
  const facets = useQuery(facetsQuery('leads'));
  const results = useQuery({ ...leadSearchQuery(workspace.id, server, page), placeholderData: (prev) => prev });
  const count = useQuery({ ...leadCountQuery(workspace.id, server), placeholderData: (prev) => prev });
  const saved = useQuery(savedSearchesQuery(workspace.id));
  const mySaved = (saved.data ?? []).filter((s) => (s.filters as Record<string, unknown> | null)?.source !== 'local');

  useEffect(() => {
    if (count.data !== undefined && !count.isPlaceholderData) track('search_run', { filters: server, result_count: count.data, source: 'leads' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count.data, JSON.stringify(server)]);

  const rows = results.data ?? [];
  const byId = useMemo(() => new Map(rows.map((r) => [r.lead_id, r])), [rows]);
  const ids = [...selected];
  const unrevealed = ids.filter((id) => !byId.get(id)?.person_id);
  const cost = (n: number) => `${n.toLocaleString('en-GB')} credit${n === 1 ? '' : 's'}`;
  const costLabel = unrevealed.length ? ` (${cost(unrevealed.length)})` : '';
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.lead_id));
  const total = count.data;
  const pages = total === undefined || total === null ? 100 : Math.max(1, Math.ceil(Math.min(total, COUNT_CAP) / PAGE_SIZE));
  const countries = (filters.countries as string[] | undefined) ?? [];
  const strictMarket = countries.some((c) => c === 'Germany' || c === 'Austria');

  const update = (next: Filters) => {
    setFilters(next);
    setPage(0);
    setSelected(new Set());
  };

  const after = () => {
    void refreshWorkspace();
    ['lead-search', 'people', 'today', 'lists', 'list'].forEach((k) => void qc.invalidateQueries({ queryKey: [k] }));
  };

  const reveal = async (leadIds: string[], listId?: string | null, from: 'search' | 'list' | 'export' = 'search') => {
    setBusy(leadIds.length === 1 ? leadIds[0] : 'bulk');
    const { people, error } = await revealLeads(workspace.id, leadIds, { listId, from: listId ? 'list' : from });
    setBusy(null);
    if (error) toast(error.message, error.href ? { label: error.label ?? 'Fix', href: error.href } : undefined);
    after();
    return { people, ok: !error };
  };

  const addToList = async (listId: string) => {
    const { people } = await reveal(ids, listId);
    if (people.length) {
      track('person_added_to_list', { source: 'database', count: people.length });
      toast(`${people.length} added to the list`, { label: 'Open list', href: `/app/lists/${listId}` });
    }
    setSelected(new Set());
  };

  const download = (leads: LeadRow[], people: Person[]) => {
    const lookup = new Map(leads.map((l) => [l.lead_id, l]));
    const name = `decibel-leads-${new Date().toISOString().slice(0, 10)}.csv`;
    exportCsv(workspace.id, 'leads', name, people.map((p) => csvRow(lookup.get(p.source_lead_id ?? ''), p)));
    toast(`Exported ${people.length.toLocaleString('en-GB')} leads`);
  };

  /** Export the given leads: reveal any not yet revealed (with a confirmation), then download. */
  const exportLeads = (leads: LeadRow[], label: string) => {
    const fresh = leads.filter((l) => !l.person_id).length;
    const run = async () => {
      const { people, ok } = await reveal(
        leads.map((l) => l.lead_id),
        null,
        'export',
      );
      if (ok && people.length) download(leads, people);
    };
    if (!fresh) return void run();
    setConfirm({
      title: `Export ${label}`,
      body: `${fresh.toLocaleString('en-GB')} of these ${leads.length.toLocaleString('en-GB')} leads are not revealed yet, so exporting them uses ${cost(fresh)}. Leads you have already revealed are free. You have ${workspace.credit_balance.toLocaleString('en-GB')} credits.`,
      action: `Reveal and export (${cost(fresh)})`,
      run,
    });
  };

  /** Saves the selected leads that have a mobile as a new list and opens the dialler on it. */
  const callable = rows.filter((r) => selected.has(r.lead_id) && r.has_mobile);
  const startDialler = () => {
    if (!callable.length) return void toast('None of the selected leads has a mobile number.');
    const fresh = callable.filter((r) => !r.person_id).length;
    const run = async () => {
      setBusy('dial');
      const { data: list, error } = await db.from('lists').insert({ workspace_id: workspace.id, name: diallerListName(), owner_id: user.id }).select('id').single();
      if (error || !list) {
        setBusy(null);
        return void toast(`Could not create the list: ${error?.message ?? 'unknown error'}`);
      }
      const { people, ok } = await reveal(callable.map((r) => r.lead_id), list.id);
      if (!ok || !people.length) {
        await db.from('lists').delete().eq('id', list.id);
        return;
      }
      track('dialler_list_created', { source: 'leads', count: people.length });
      setSelected(new Set());
      router.push(`/app/dialler?list=${list.id}&new=1`);
    };
    const skipped = selected.size - callable.length;
    if (!fresh) return void run();
    setConfirm({
      title: `Start the dialler with ${callable.length.toLocaleString('en-GB')} ${callable.length === 1 ? 'lead' : 'leads'}`,
      body: `${fresh.toLocaleString('en-GB')} of them ${fresh === 1 ? 'is' : 'are'} not revealed yet, so this uses ${cost(fresh)}. They are saved as a new list you can rename, then the dialler opens ready to start.${skipped ? ` ${skipped.toLocaleString('en-GB')} selected ${skipped === 1 ? 'lead has' : 'leads have'} no mobile and ${skipped === 1 ? 'is' : 'are'} left out.` : ''} You have ${workspace.credit_balance.toLocaleString('en-GB')} credits.`,
      action: `Reveal and open dialler (${cost(fresh)})`,
      run,
    });
  };

  const exportSelected = () => exportLeads(rows.filter((r) => selected.has(r.lead_id)), `${selected.size.toLocaleString('en-GB')} selected leads`);

  const exportFiltered = async () => {
    setBusy('filtered');
    try {
      const leads = await leadIdsForFilters(workspace.id, server, EXPORT_MAX);
      if (!leads.length) return void toast('Nothing matches these filters.');
      exportLeads(leads, `the first ${leads.length.toLocaleString('en-GB')} matching leads`);
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const saveFilteredToList = async (listId: string) => {
    setBusy('filtered');
    try {
      const leads = await leadIdsForFilters(workspace.id, server, EXPORT_MAX);
      const fresh = leads.filter((l) => !l.person_id).length;
      const run = async () => {
        const { people } = await reveal(
          leads.map((l) => l.lead_id),
          listId,
        );
        if (people.length) toast(`${people.length.toLocaleString('en-GB')} leads saved to the list`, { label: 'Open list', href: `/app/lists/${listId}` });
      };
      if (!fresh) await run();
      else
        setConfirm({
          title: 'Save matching leads to a list',
          body: `This adds the first ${leads.length.toLocaleString('en-GB')} matching leads to the list. ${fresh.toLocaleString('en-GB')} are not revealed yet, so it uses ${cost(fresh)}. You have ${workspace.credit_balance.toLocaleString('en-GB')} credits.`,
          action: `Reveal and save (${cost(fresh)})`,
          run,
        });
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const saveSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!saveName.trim()) return;
    const { error } = await db.from('saved_searches').insert({ workspace_id: workspace.id, user_id: user.id, name: saveName.trim(), filters: { v: 2, ...filters, q: text.trim() || undefined } });
    if (error) return void toast(error.message);
    setSaveOpen(false);
    setSaveName('');
    toast('Search saved');
    void saved.refetch();
  };

  const targetName = lists?.find((l) => l.id === targetList)?.name;

  return (
    <div className="flex h-full">
      <div className="flex min-w-0 flex-1 flex-col bg-white-100">
        {banner}
        <div className="flex h-12 shrink-0 items-center gap-2 overflow-x-auto border-b border-white-800 px-4 [scrollbar-width:none]">
          <div className="relative">
            <Search size={16} strokeWidth={1.5} className="pointer-events-none absolute left-2.5 top-2 text-white-900" />
            <Input
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setPage(0);
              }}
              placeholder="Search name, title or company"
              className="h-8 w-72 pl-8 max-sm:w-44"
              aria-label="Search the database"
            />
          </div>
          <h1 className="whitespace-nowrap text-sm text-black-700">
            <span className="text-black-400">{formatCount(total, page * PAGE_SIZE + rows.length)}</span> leads
          </h1>
          {targetList ? (
            <Link href={`/app/lists/${targetList}`} className="tag tag-1 max-w-[260px] truncate" title="Select leads, then choose Add to list">
              Adding to {targetName ?? 'your list'} · back
            </Link>
          ) : null}
          {strictMarket ? (
            <span className="tag tag-2 whitespace-nowrap" title="Germany and Austria treat B2B cold calls more strictly than the UK. Take local advice before calling.">
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
                mySaved.length ? (
                  mySaved.map((s) => (
                    <div key={s.id} className="flex items-center">
                      <MenuItem
                        onClick={() => {
                          const loaded = fromSaved((s.filters ?? {}) as Record<string, unknown>);
                          update(loaded.filters);
                          setText(loaded.q);
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
            <Popover
              align="right"
              trigger={({ toggle }) => (
                <Button size="compact" onClick={toggle} loading={busy === 'filtered'} disabled={!rows.length}>
                  <Download size={16} strokeWidth={1.5} /> Export
                </Button>
              )}
            >
              {(close) => (
                <div className="w-64">
                  <MenuItem
                    onClick={() => {
                      close();
                      void exportFiltered();
                    }}
                  >
                    Export matching leads (up to {EXPORT_MAX})
                  </MenuItem>
                  <MenuItem
                    onClick={() => {
                      close();
                      setPicker('save-filtered');
                    }}
                  >
                    Save matching leads to a list
                  </MenuItem>
                  <p className="border-t border-white-800 px-3 py-2 text-black-700">Unrevealed leads use 1 credit each. Revealed leads are free.</p>
                </div>
              )}
            </Popover>
          </div>
        </div>
        <SmartFilterBar defs={LEAD_FILTERS} filters={filters} onChange={update} facets={facets.data ?? {}} tone="tag-1" />

        <div className="min-h-0 flex-1 overflow-auto">
          {results.error ? (
            <div className="p-4">
              <ErrorCard message={(results.error as Error).message} onRetry={() => results.refetch()} />
            </div>
          ) : results.isLoading || !results.data ? (
            <TableSkeleton rows={12} cols={8} />
          ) : !rows.length ? (
            <EmptyState shape="diamond" title="No leads match" description="Remove a filter or two to widen the search." action={<Button onClick={() => update({})}>Clear filters</Button>} />
          ) : (
            <div className={cn('tbl-wrap transition-opacity', results.isPlaceholderData && 'opacity-60')}>
              <table className="tbl tbl-fixed">
                <colgroup>
                  <col style={{ width: 44 }} />
                  <col style={{ width: 210 }} />
                  <col style={{ width: 240 }} />
                  <col style={{ width: 110 }} />
                  <col style={{ width: 210 }} />
                  <col style={{ width: 200 }} />
                  <col style={{ width: 120 }} />
                  <col style={{ width: 120 }} />
                  <col style={{ width: 190 }} />
                  <col style={{ width: 230 }} />
                  <col style={{ width: 240 }} />
                  <col style={{ width: 170 }} />
                </colgroup>
                <thead>
                  <tr>
                    <th className="w-10">
                      <Checkbox
                        aria-label="Select all on this page"
                        checked={allSelected}
                        indeterminate={!allSelected && selected.size > 0}
                        onChange={(v) => setSelected(v ? new Set(rows.map((r) => r.lead_id)) : new Set())}
                      />
                    </th>
                    <th>Name</th>
                    <th>Title</th>
                    <th>Seniority</th>
                    <th>Company</th>
                    <th>Industry</th>
                    <th>Size</th>
                    <th>Revenue</th>
                    <th>Location</th>
                    <th>Mobile</th>
                    <th>Email</th>
                    <th>Signals</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const mine = !!r.person_id;
                    const name = r.full_name || [r.first_name, r.last_name].filter(Boolean).join(' ') || 'Unknown';
                    return (
                      <tr key={r.lead_id} data-selected={selected.has(r.lead_id)} className="group">
                        <td>
                          <Checkbox
                            aria-label={`Select ${name}`}
                            checked={selected.has(r.lead_id)}
                            onChange={(on) =>
                              setSelected((s) => {
                                const n = new Set(s);
                                if (on) n.add(r.lead_id);
                                else n.delete(r.lead_id);
                                return n;
                              })
                            }
                          />
                        </td>
                        <td>
                          <span className="flex min-w-0 items-center gap-1.5">
                            {mine ? (
                              <Link href={`/app/people/${r.person_id}`} onMouseEnter={() => prefetchPerson(qc, r.person_id!)} className="min-w-0 hover:underline">
                                <PersonCell name={name} />
                              </Link>
                            ) : (
                              <PersonCell name={name} />
                            )}
                            {r.linkedin_url ? (
                              <a href={r.linkedin_url.startsWith('http') ? r.linkedin_url : `https://${r.linkedin_url}`} target="_blank" rel="noreferrer" aria-label={`${name} on LinkedIn`} className="shrink-0 text-white-900 hover:text-black-400">
                                <Linkedin size={13} strokeWidth={1.5} />
                              </a>
                            ) : null}
                          </span>
                        </td>
                        <td className="truncate text-black-500" title={r.current_title ?? undefined}>
                          {r.current_title ?? dash}
                        </td>
                        <td>{r.seniority_level ? <Tag color={1}>{prettyValue(def('seniorities'), r.seniority_level)}</Tag> : dash}</td>
                        <td>
                          <span className="block truncate text-black-400">{r.company_name ?? '–'}</span>
                          {r.company_domain ? <span className="block truncate text-xs text-white-900">{r.company_domain}</span> : null}
                        </td>
                        <td className="truncate text-black-700" title={r.main_industry ?? r.company_industry ?? undefined}>
                          {r.main_industry ?? r.company_industry ?? dash}
                        </td>
                        <td className="whitespace-nowrap text-black-700">{r.employee_count_range ? r.employee_count_range.replace(' to ', '–') : dash}</td>
                        <td className="whitespace-nowrap text-black-700">{r.revenue_range ?? dash}</td>
                        <td className="truncate text-black-700" title={r.contact_location ?? undefined}>
                          {[r.contact_city, r.contact_country].filter(Boolean).join(', ') || dash}
                        </td>
                        <td>
                          <span className="flex items-center gap-2">
                            <span className={cn('tabular-nums text-xs', !mine && 'text-black-700')}>{r.mobile ? (mine ? formatPhone(r.mobile) : r.mobile) : '–'}</span>
                            {mine ? (
                              <Tag color={1}>Revealed</Tag>
                            ) : r.has_mobile ? (
                              <button
                                disabled={!!busy}
                                onClick={() => void reveal([r.lead_id])}
                                className="flex h-[22px] items-center gap-1 rounded-[4px] border border-btnborder bg-white-100 px-1.5 text-xs text-black-700 hover:border-black-0 hover:text-black-400 disabled:opacity-50"
                              >
                                <Eye size={12} strokeWidth={1.5} /> {busy === r.lead_id ? 'Revealing' : 'Reveal · 1'}
                              </button>
                            ) : null}
                          </span>
                        </td>
                        <td>
                          <span className="flex min-w-0 items-center gap-1.5">
                            <span className={cn('truncate text-xs', mine ? 'text-black-400' : 'text-black-700')}>{r.email ?? '–'}</span>
                            {r.email_status === 'CATCH_ALL' ? <span className="tag tag-2 shrink-0">Accept-all</span> : null}
                          </span>
                        </td>
                        <td>
                          <span className="flex flex-wrap gap-1">
                            {r.is_hiring ? <span className="tag tag-3">Hiring</span> : null}
                            {r.open_to_work ? <span className="tag tag-5">Open to work</span> : null}
                            {r.last_funding_type ? <span className="tag tag-7 max-w-[120px] truncate">{r.last_funding_type}</span> : null}
                            {!r.is_hiring && !r.open_to_work && !r.last_funding_type ? dash : null}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="flex h-12 shrink-0 items-center justify-between border-t border-white-800 bg-panel px-4">
          <span className="t-label">
            {rows.length ? `Leads ${(page * PAGE_SIZE + 1).toLocaleString('en-GB')}–${(page * PAGE_SIZE + rows.length).toLocaleString('en-GB')} of ${formatCount(total, page * PAGE_SIZE + rows.length)}` : results.isLoading ? 'Loading' : 'No leads'}
          </span>
          <div className="flex gap-2">
            <Button size="compact" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <Button size="compact" disabled={rows.length < PAGE_SIZE || page >= pages - 1 || page >= 99} onClick={() => setPage((p) => p + 1)}>
              Next
            </Button>
          </div>
        </div>
      </div>

      <BulkBar count={selected.size} onClear={() => setSelected(new Set())}>
        <BulkAction disabled={!!busy || !callable.length} onClick={startDialler}>
          <Phone size={16} strokeWidth={1.5} /> {busy === 'dial' ? 'Opening dialler…' : `Start dialler with ${callable.length.toLocaleString('en-GB')} ${callable.length === 1 ? 'lead' : 'leads'}`}
        </BulkAction>
        <BulkAction disabled={!!busy} onClick={() => (targetList ? void addToList(targetList) : setPicker('add'))}>
          <ListPlus size={16} strokeWidth={1.5} /> {targetList ? `Add to ${targetName ?? 'list'}` : 'Add to list'}
          {costLabel}
        </BulkAction>
        <BulkAction disabled={!!busy} onClick={() => setPicker('create')}>
          <Plus size={16} strokeWidth={1.5} /> Create new list{costLabel}
        </BulkAction>
        <BulkAction
          disabled={!!busy || !unrevealed.length}
          onClick={async () => {
            const { people } = await reveal(unrevealed);
            if (people.length) toast(`${people.length} revealed and added to People`);
            setSelected(new Set());
          }}
        >
          <Eye size={16} strokeWidth={1.5} /> Reveal ({cost(unrevealed.length)})
        </BulkAction>
        <BulkAction disabled={!!busy} onClick={exportSelected}>
          <Download size={16} strokeWidth={1.5} /> Export CSV{costLabel}
        </BulkAction>
      </BulkBar>

      <ListPickerDialog
        open={!!picker}
        createOnly={picker === 'create'}
        onClose={() => setPicker(null)}
        onPick={async (listId) => {
          if (picker === 'save-filtered') {
            setPicker(null);
            await saveFilteredToList(listId);
          } else await addToList(listId);
        }}
        title={picker === 'save-filtered' ? 'Save matching leads to a list' : `Add ${ids.length} to list${costLabel}`}
        busyLabel="Revealing…"
      />
      <Dialog open={!!confirm} onClose={() => setConfirm(null)} title={confirm?.title ?? ''}>
        <p className="text-black-700">{confirm?.body}</p>
        <div className="mt-5 flex justify-end gap-2">
          <Button onClick={() => setConfirm(null)}>Cancel</Button>
          <Button
            variant="primary"
            loading={busy === 'bulk'}
            onClick={async () => {
              const c = confirm;
              setConfirm(null);
              await c?.run();
              setSelected(new Set());
            }}
          >
            {confirm?.action}
          </Button>
        </div>
      </Dialog>
      <Dialog open={saveOpen} onClose={() => setSaveOpen(false)} title="Save search">
        <form onSubmit={saveSearch} className="flex flex-col gap-4">
          <Input autoFocus value={saveName} onChange={(e) => setSaveName(e.target.value)} placeholder="UK IT directors with mobiles" aria-label="Search name" />
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
