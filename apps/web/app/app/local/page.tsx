'use client';
// Local businesses: the real listings table (google_businesses), searched on the server with
// stackable filters (search_local / count_local). Listing details are public business
// information, so phones and emails show in full. "Add to list" saves the selected
// businesses as People (deduplicated by phone) so they can be called from the dialler.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bookmark, Download, Facebook, Globe, Instagram, Linkedin, ListPlus, MapPin, MessageCircle, Phone, Plus, Search, Star, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { track } from '@/lib/analytics';
import { useApp } from '@/lib/app-context';
import { diallerListName } from '@/lib/dialler';
import { useDebounced, useStages } from '@/lib/hooks';
import {
  COUNT_CAP,
  facetsQuery,
  formatCount,
  LOCAL_FILTERS,
  localCountQuery,
  localRowsForFilters,
  localSearchQuery,
  PAGE_SIZE,
  toServer,
  type Filters,
  type LocalRow,
} from '@/lib/lead-search';
import { toE164 } from '@/lib/phone';
import { savedSearchesQuery } from '@/lib/queries';
import { supabase } from '@/lib/supabase/client';
import { cn, exportCsv } from '@/lib/utils';
import { SmartFilterBar } from '@/components/app/smart-filters';
import { BulkAction, BulkBar, ListPickerDialog } from '@/components/app/records';
import { Avatar, EmptyState, ErrorCard, TableSkeleton } from '@/components/ui/display';
import { Button } from '@/components/ui/button';
import { Checkbox, Input } from '@/components/ui/form';
import { Dialog, MenuItem, Popover, useToast } from '@/components/ui/overlay';

const DEFAULT_FILTERS: Filters = { hasPhone: true };
const EXPORT_MAX = 500;
const dash = <span className="text-faint">–</span>;

const href = (u: string) => (/^https?:\/\//.test(u) ? u : `https://${u}`);

/** "Monday: 9 AM-5 PM; …" -> today's opening hours, if listed. */
function todaysHours(hours: string | null): string | null {
  if (!hours) return null;
  const day = new Date().toLocaleDateString('en-GB', { weekday: 'long' });
  const part = hours.split(';').map((s) => s.trim()).find((s) => s.startsWith(`${day}:`));
  return part ? part.slice(day.length + 1).trim() : null;
}

function csvRow(b: LocalRow) {
  return {
    name: b.name ?? '',
    category: b.category ?? '',
    all_categories: b.all_categories ?? '',
    phone: b.phone ?? '',
    mobile: b.has_mobile ? 'yes' : '',
    email: b.email ?? '',
    all_emails: b.all_emails ?? '',
    website: b.website ?? '',
    rating: b.rating ?? '',
    address: b.address ?? '',
    city: b.city ?? '',
    postcode: b.postcode ?? '',
    country: b.country ?? '',
    hours: b.hours ?? '',
    whatsapp: b.whatsapp ?? '',
    facebook: b.facebook ?? '',
    instagram: b.instagram ?? '',
    linkedin: b.linkedin ?? '',
    google_maps: b.maps_url ?? '',
    search_term: b.keyword ?? '',
  };
}

export default function LocalPage() {
  const { workspace, user } = useApp();
  const { data: stages } = useStages();
  const qc = useQueryClient();
  const toast = useToast();
  const db = supabase();
  const router = useRouter();

  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [text, setText] = useState('');
  const q = useDebounced(text, 300);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [picker, setPicker] = useState<null | 'add' | 'create' | 'save-filtered'>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [busy, setBusy] = useState(false);

  const server = useMemo(() => toServer(filters, q), [filters, q]);
  const facets = useQuery(facetsQuery('local'));
  const results = useQuery({ ...localSearchQuery(workspace.id, server, page), placeholderData: (prev) => prev });
  const count = useQuery({ ...localCountQuery(workspace.id, server), placeholderData: (prev) => prev });
  const saved = useQuery(savedSearchesQuery(workspace.id));
  const mySaved = (saved.data ?? []).filter((s) => (s.filters as Record<string, unknown> | null)?.source === 'local');

  useEffect(() => {
    if (count.data !== undefined && !count.isPlaceholderData) track('search_run', { filters: server, result_count: count.data, source: 'local' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count.data, JSON.stringify(server)]);

  const rows = results.data ?? [];
  const total = count.data;
  const pages = total === undefined || total === null ? 100 : Math.max(1, Math.ceil(Math.min(total, COUNT_CAP) / PAGE_SIZE));
  const allSelected = rows.length > 0 && rows.every((b) => selected.has(b.place_id));
  const chosen = rows.filter((b) => selected.has(b.place_id));

  const update = (next: Filters) => {
    setFilters(next);
    setPage(0);
    setSelected(new Set());
  };

  /** Saves businesses as People (skipping numbers already saved) and files them in a list. */
  const saveToList = async (businesses: LocalRow[], listId: string, quiet = false): Promise<number> => {
    setBusy(true);
    try {
      const usable = businesses.map((b) => ({ b, e164: b.phone ? toE164(b.phone) : null })).filter((x) => x.e164) as { b: LocalRow; e164: string }[];
      if (!usable.length) throw new Error('None of these businesses has a phone number.');
      const mobiles = [...new Set(usable.map((x) => x.e164))];
      const have = await db.from('people').select('id,mobile_e164').eq('workspace_id', workspace.id).in('mobile_e164', mobiles);
      if (have.error) throw have.error;
      const byPhone = new Map((have.data ?? []).map((p) => [p.mobile_e164 as string, p.id as string]));
      const fresh = usable.filter((x, i) => !byPhone.has(x.e164) && usable.findIndex((y) => y.e164 === x.e164) === i);

      if (fresh.length) {
        const names = [...new Set(fresh.map((x) => x.b.name ?? 'Business'))];
        const co = await db.from('tenant_companies').select('id,name').eq('workspace_id', workspace.id).in('name', names);
        if (co.error) throw co.error;
        const companyId = new Map((co.data ?? []).map((c) => [c.name as string, c.id as string]));
        const missing = names.filter((n) => !companyId.has(n));
        if (missing.length) {
          const made = await db
            .from('tenant_companies')
            .insert(
              missing.map((n) => {
                const b = fresh.find((x) => (x.b.name ?? 'Business') === n)!.b;
                return { workspace_id: workspace.id, name: n, industry: b.category, country_code: b.country?.length === 2 ? b.country : null, city: b.city };
              }),
            )
            .select('id,name');
          if (made.error) throw made.error;
          (made.data ?? []).forEach((c) => companyId.set(c.name as string, c.id as string));
        }
        const created = await db
          .from('people')
          .insert(
            fresh.map(({ b, e164 }) => ({
              workspace_id: workspace.id,
              tenant_company_id: companyId.get(b.name ?? 'Business') ?? null,
              first_name: b.name ?? 'Business',
              last_name: '',
              job_title: b.category,
              email: b.email || null,
              mobile_e164: e164,
              country_code: b.country?.length === 2 ? b.country : null,
              city: b.city,
              source: 'manual',
              created_by: user.id,
              owner_id: user.id,
              stage_id: stages?.[0]?.id ?? null,
            })),
          )
          .select('id,mobile_e164');
        if (created.error) throw created.error;
        (created.data ?? []).forEach((p) => byPhone.set(p.mobile_e164 as string, p.id as string));
      }

      const personIds = [...new Set(usable.map((x) => byPhone.get(x.e164)).filter(Boolean))] as string[];
      const members = await db
        .from('list_members')
        .upsert(personIds.map((person_id, i) => ({ list_id: listId, person_id, workspace_id: workspace.id, added_by: user.id, position: i })), { onConflict: 'list_id,person_id', ignoreDuplicates: true });
      if (members.error) throw members.error;

      ['people', 'lists', 'list', 'today'].forEach((k) => void qc.invalidateQueries({ queryKey: [k] }));
      const skipped = businesses.length - usable.length;
      if (!quiet) toast(`${personIds.length} added to the list${skipped ? ` (${skipped} without a phone skipped)` : ''}`, { label: 'Open list', href: `/app/lists/${listId}` });
      setSelected(new Set());
      return personIds.length;
    } catch (e) {
      toast(`Could not add to the list: ${(e as Error).message}`);
      return 0;
    } finally {
      setBusy(false);
    }
  };

  /** Saves the selected businesses as a new list and opens the dialler on it, ready to start. */
  const callable = chosen.filter((b) => !!b.phone);
  const startDialler = async () => {
    if (!callable.length) return void toast('None of the selected businesses has a phone number.');
    setBusy(true);
    const { data: list, error } = await db.from('lists').insert({ workspace_id: workspace.id, name: diallerListName(), owner_id: user.id }).select('id').single();
    if (error || !list) {
      setBusy(false);
      return void toast(`Could not create the list: ${error?.message ?? 'unknown error'}`);
    }
    const added = await saveToList(callable, list.id, true);
    if (!added) {
      await db.from('lists').delete().eq('id', list.id);
      return;
    }
    track('dialler_list_created', { source: 'local', count: added });
    router.push(`/app/dialler?list=${list.id}&new=1`);
  };

  const download = (businesses: LocalRow[]) => {
    exportCsv(workspace.id, 'local', `decibel-local-businesses-${new Date().toISOString().slice(0, 10)}.csv`, businesses.map(csvRow));
    toast(`Exported ${businesses.length.toLocaleString('en-GB')} businesses`);
  };

  const exportFiltered = async () => {
    setBusy(true);
    try {
      const all = await localRowsForFilters(workspace.id, server, EXPORT_MAX);
      if (!all.length) toast('Nothing matches these filters.');
      else download(all);
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const saveSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!saveName.trim()) return;
    const { error } = await db.from('saved_searches').insert({ workspace_id: workspace.id, user_id: user.id, name: saveName.trim(), filters: { v: 2, source: 'local', ...filters, q: text.trim() || undefined } });
    if (error) return void toast(error.message);
    setSaveOpen(false);
    setSaveName('');
    toast('Search saved');
    void saved.refetch();
  };

  return (
    <div className="flex h-full flex-col bg-white-100">
      <div className="flex h-12 shrink-0 items-center gap-2 overflow-x-auto border-b border-white-800 px-4 [scrollbar-width:none]">
        <div className="relative shrink-0">
          <Search size={16} strokeWidth={1.5} className="pointer-events-none absolute left-2.5 top-2 text-white-900" />
          <Input
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setPage(0);
              setSelected(new Set());
            }}
            placeholder="Search business name, category or website"
            className="h-8 w-80 pl-8 max-sm:w-44"
            aria-label="Search local businesses"
          />
        </div>
        <h1 className="whitespace-nowrap text-sm text-black-700">
          <span className="text-black-400">{formatCount(total, page * PAGE_SIZE + rows.length)}</span> businesses
        </h1>
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
                        const { v: _v, source: _s, q: savedQ, ...rest } = (s.filters ?? {}) as Record<string, unknown>;
                        update(rest);
                        setText(typeof savedQ === 'string' ? savedQ : '');
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
              <Button size="compact" onClick={toggle} loading={busy} disabled={!rows.length}>
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
                  Export matching businesses (up to {EXPORT_MAX})
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    close();
                    setPicker('save-filtered');
                  }}
                >
                  Save matching businesses to a list
                </MenuItem>
              </div>
            )}
          </Popover>
        </div>
      </div>

      <SmartFilterBar defs={LOCAL_FILTERS} filters={filters} onChange={update} facets={facets.data ?? {}} tone="tag-4" />

      <div className="min-h-0 flex-1 overflow-auto">
        {results.error ? (
          <div className="p-4">
            <ErrorCard message={(results.error as Error).message} onRetry={() => results.refetch()} />
          </div>
        ) : results.isLoading || !results.data ? (
          <TableSkeleton rows={12} cols={7} />
        ) : !rows.length ? (
          <EmptyState shape="diamond" title="No businesses match" description="Remove a filter or two to widen the search." action={<Button onClick={() => update({})}>Clear filters</Button>} />
        ) : (
          <div className={cn('tbl-wrap transition-opacity', results.isPlaceholderData && 'opacity-60')}>
            <table className="tbl tbl-fixed">
              <colgroup>
                <col style={{ width: 44 }} />
                <col style={{ width: 280 }} />
                <col style={{ width: 110 }} />
                <col style={{ width: 190 }} />
                <col style={{ width: 230 }} />
                <col style={{ width: 210 }} />
                <col style={{ width: 210 }} />
                <col style={{ width: 150 }} />
                <col style={{ width: 120 }} />
              </colgroup>
              <thead>
                <tr>
                  <th className="w-10">
                    <Checkbox
                      aria-label="Select all on this page"
                      checked={allSelected}
                      indeterminate={!allSelected && selected.size > 0}
                      onChange={(v) => setSelected(v ? new Set(rows.map((b) => b.place_id)) : new Set())}
                    />
                  </th>
                  <th>Business</th>
                  <th>Rating</th>
                  <th>Phone</th>
                  <th>Email</th>
                  <th>Website</th>
                  <th>Location</th>
                  <th>Today</th>
                  <th>Social</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((b) => {
                  const today = todaysHours(b.hours);
                  return (
                    <tr key={b.place_id} data-selected={selected.has(b.place_id)}>
                      <td>
                        <Checkbox
                          aria-label={`Select ${b.name}`}
                          checked={selected.has(b.place_id)}
                          onChange={(on) =>
                            setSelected((s) => {
                              const n = new Set(s);
                              if (on) n.add(b.place_id);
                              else n.delete(b.place_id);
                              return n;
                            })
                          }
                        />
                      </td>
                      <td>
                        <span className="flex min-w-0 items-center gap-2.5">
                          <Avatar name={b.name ?? 'Business'} size={24} />
                          <span className="min-w-0">
                            <span className="block truncate font-medium text-black-400" title={b.name ?? undefined}>
                              {b.name ?? 'Unnamed business'}
                            </span>
                            <span className="block truncate text-xs text-white-900" title={b.all_categories ?? undefined}>
                              {b.category ?? '–'}
                            </span>
                          </span>
                        </span>
                      </td>
                      <td className="whitespace-nowrap">
                        {b.rating !== null ? (
                          <span className="flex items-center gap-1 tabular-nums text-black-400">
                            <Star size={12} strokeWidth={0} className="fill-[#e3a52b]" />
                            {Number(b.rating).toFixed(1)}
                            {b.review_url ? (
                              <a href={b.review_url} target="_blank" rel="noreferrer" className="ml-1 text-xs text-white-900 hover:text-black-400">
                                Reviews
                              </a>
                            ) : null}
                          </span>
                        ) : (
                          dash
                        )}
                      </td>
                      <td>
                        <span className="flex items-center gap-2">
                          <span className="whitespace-nowrap tabular-nums text-xs text-black-400">{b.phone ?? '–'}</span>
                          {b.has_mobile ? <span className="tag tag-1">Mobile</span> : null}
                        </span>
                      </td>
                      <td className="truncate text-xs text-black-700" title={b.all_emails ?? undefined}>
                        {b.email ?? dash}
                      </td>
                      <td>
                        {b.website ? (
                          <a href={href(b.website)} target="_blank" rel="noreferrer" className="flex min-w-0 items-center gap-1.5 text-black-500 hover:text-black-400">
                            <Globe size={12} strokeWidth={1.5} className="shrink-0 text-white-900" />
                            <span className="truncate text-xs">{b.domain ?? b.website.replace(/^https?:\/\/(www\.)?/, '')}</span>
                          </a>
                        ) : (
                          <span className="tag tag-2">No website</span>
                        )}
                      </td>
                      <td>
                        <span className="flex min-w-0 items-center gap-1.5 text-black-700" title={b.address ?? undefined}>
                          <MapPin size={12} strokeWidth={1.5} className="shrink-0 text-white-900" />
                          <span className="truncate text-xs">{[b.neighbourhood ?? b.city, b.postcode].filter(Boolean).join(' · ') || '–'}</span>
                        </span>
                      </td>
                      <td className="truncate text-xs" title={b.hours ?? undefined}>
                        {today ? <span className={today === 'Closed' ? 'text-white-900' : 'text-success-500'}>{today}</span> : dash}
                      </td>
                      <td>
                        <span className="flex items-center gap-2 text-white-900">
                          {b.whatsapp ? <MessageCircle size={13} strokeWidth={1.5} aria-label="WhatsApp" /> : null}
                          {b.facebook ? (
                            <a href={href(b.facebook)} target="_blank" rel="noreferrer" aria-label="Facebook" className="hover:text-black-400">
                              <Facebook size={13} strokeWidth={1.5} />
                            </a>
                          ) : null}
                          {b.instagram ? (
                            <a href={href(b.instagram)} target="_blank" rel="noreferrer" aria-label="Instagram" className="hover:text-black-400">
                              <Instagram size={13} strokeWidth={1.5} />
                            </a>
                          ) : null}
                          {b.linkedin ? (
                            <a href={href(b.linkedin)} target="_blank" rel="noreferrer" aria-label="LinkedIn" className="hover:text-black-400">
                              <Linkedin size={13} strokeWidth={1.5} />
                            </a>
                          ) : null}
                          {!b.whatsapp && !b.facebook && !b.instagram && !b.linkedin ? dash : null}
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
          {rows.length ? `Businesses ${(page * PAGE_SIZE + 1).toLocaleString('en-GB')}–${(page * PAGE_SIZE + rows.length).toLocaleString('en-GB')} of ${formatCount(total, page * PAGE_SIZE + rows.length)}` : results.isLoading ? 'Loading' : 'No businesses'}
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

      <BulkBar count={selected.size} onClear={() => setSelected(new Set())}>
        <BulkAction disabled={busy || !callable.length} onClick={() => void startDialler()}>
          <Phone size={16} strokeWidth={1.5} /> Start dialler with {callable.length.toLocaleString('en-GB')} {callable.length === 1 ? 'business' : 'businesses'}
        </BulkAction>
        <BulkAction disabled={busy} onClick={() => setPicker('add')}>
          <ListPlus size={16} strokeWidth={1.5} /> Add to list
        </BulkAction>
        <BulkAction disabled={busy} onClick={() => setPicker('create')}>
          <Plus size={16} strokeWidth={1.5} /> Create new list
        </BulkAction>
        <BulkAction onClick={() => download(chosen)}>
          <Download size={16} strokeWidth={1.5} /> Export CSV
        </BulkAction>
      </BulkBar>

      <ListPickerDialog
        open={!!picker}
        createOnly={picker === 'create'}
        onClose={() => setPicker(null)}
        onPick={async (listId) => {
          if (picker === 'save-filtered') {
            setPicker(null);
            const all = await localRowsForFilters(workspace.id, server, EXPORT_MAX);
            await saveToList(all, listId);
          } else await saveToList(chosen, listId);
        }}
        title={picker === 'save-filtered' ? 'Save matching businesses to a list' : `Add ${selected.size} to a list`}
        busyLabel="Saving…"
      />
      <Dialog open={saveOpen} onClose={() => setSaveOpen(false)} title="Save search">
        <form onSubmit={saveSearch} className="flex flex-col gap-4">
          <Input autoFocus value={saveName} onChange={(e) => setSaveName(e.target.value)} placeholder="Electricians in Manchester with mobiles" aria-label="Search name" />
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
