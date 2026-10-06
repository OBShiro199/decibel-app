'use client';
// Local businesses: businesses found on Google Maps, with their mobile, rating, reviews and website.
// Works like Leads: stackable filter chips, row selection, a bulk bar. The listings are sample
// data for now (lib/local-data.ts): twenty fictional businesses. "Add to list" turns the selected
// ones into People (mobile, category, town) so they can be called from the dialler.
import { useQueryClient } from '@tanstack/react-query';
import { Download, Globe, ListPlus, MapPin, Plus, Search, Star } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useApp } from '@/lib/app-context';
import { useFitRows, useStages } from '@/lib/hooks';
import { applyLocalFilters, townOf, type LocalFilters } from '@/lib/local';
import { LOCAL_BUSINESSES } from '@/lib/local-data';
import { supabase } from '@/lib/supabase/client';
import { cn, exportCsv, formatPhone } from '@/lib/utils';
import { LocalFilterBar } from '@/components/app/local-filters';
import { BulkAction, BulkBar, ListPickerDialog } from '@/components/app/records';
import { Avatar, EmptyState, Tag } from '@/components/ui/display';
import { Button } from '@/components/ui/button';
import { Checkbox, Input } from '@/components/ui/form';
import { RevealOnce } from '@/components/ui/reveal';
import { useToast } from '@/components/ui/overlay';

export default function LocalPage() {
  const { workspace, user } = useApp();
  const { data: stages } = useStages();
  const qc = useQueryClient();
  const toast = useToast();

  const [filters, setFilters] = useState<LocalFilters>({});
  const [text, setText] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [picker, setPicker] = useState<null | 'add' | 'create'>(null);

  const [page, setPage] = useState(0);
  // as many rows as fit the window, like Leads (remembered per window height)
  const fit = useFitRows('local');
  const PAGE = fit.rows || 8;

  const matches = useMemo(() => applyLocalFilters(LOCAL_BUSINESSES, filters, text), [filters, text]);
  const pages = Math.max(1, Math.ceil(matches.length / PAGE));
  const current = Math.min(page, pages - 1);
  const rows = matches.slice(current * PAGE, (current + 1) * PAGE);
  const allSelected = rows.length > 0 && rows.every((b) => selected.has(b.id));
  const chosen = LOCAL_BUSINESSES.filter((b) => selected.has(b.id));
  const patch = (p: Partial<LocalFilters>) => {
    setFilters((f) => ({ ...f, ...p }));
    setSelected(new Set());
    setPage(0);
  };
  const clear = () => {
    setFilters({});
    setText('');
    setSelected(new Set());
    setPage(0);
  };

  /** Saves the selected businesses as People (skipping any already saved) and files them in a list. */
  const addToList = async (listId: string) => {
    try {
      const db = supabase();
      const mobiles = chosen.map((b) => b.mobile);
      const have = await db.from('people').select('id,mobile_e164').eq('workspace_id', workspace.id).in('mobile_e164', mobiles);
      if (have.error) throw have.error;
      const byMobile = new Map((have.data ?? []).map((p) => [p.mobile_e164 as string, p.id as string]));
      const fresh = chosen.filter((b) => !byMobile.has(b.mobile));

      if (fresh.length) {
        const names = fresh.map((b) => b.name);
        const co = await db.from('tenant_companies').select('id,name').eq('workspace_id', workspace.id).in('name', names);
        if (co.error) throw co.error;
        const companyId = new Map((co.data ?? []).map((c) => [c.name as string, c.id as string]));
        const newCompanies = fresh.filter((b) => !companyId.has(b.name));
        if (newCompanies.length) {
          const made = await db
            .from('tenant_companies')
            .insert(newCompanies.map((b) => ({ workspace_id: workspace.id, name: b.name, domain: b.website, industry: b.category, country_code: 'GB', city: townOf(b) })))
            .select('id,name');
          if (made.error) throw made.error;
          (made.data ?? []).forEach((c) => companyId.set(c.name as string, c.id as string));
        }
        const created = await db
          .from('people')
          .insert(
            fresh.map((b) => ({
              workspace_id: workspace.id,
              tenant_company_id: companyId.get(b.name) ?? null,
              first_name: b.name,
              last_name: '',
              job_title: b.category,
              mobile_e164: b.mobile,
              country_code: 'GB',
              city: townOf(b),
              source: 'manual',
              created_by: user.id,
              owner_id: user.id,
              stage_id: stages?.[0]?.id ?? null,
            })),
          )
          .select('id,mobile_e164');
        if (created.error) throw created.error;
        (created.data ?? []).forEach((p) => byMobile.set(p.mobile_e164 as string, p.id as string));
      }

      const ids = chosen.map((b) => byMobile.get(b.mobile)).filter(Boolean) as string[];
      if (ids.length !== chosen.length) throw new Error('Some businesses could not be saved.');
      const members = await db
        .from('list_members')
        .upsert(ids.map((person_id, i) => ({ list_id: listId, person_id, workspace_id: workspace.id, added_by: user.id, position: i })), { onConflict: 'list_id,person_id', ignoreDuplicates: true });
      if (members.error) throw members.error;

      ['people', 'lists', 'list', 'today'].forEach((k) => void qc.invalidateQueries({ queryKey: [k] }));
      toast(`${ids.length} added to the list`, { label: 'Open list', href: `/app/lists/${listId}` });
      setSelected(new Set());
    } catch (e) {
      toast(`Could not add to the list: ${(e as Error).message}`);
    }
  };

  const exportRows = () =>
    exportCsv(
      workspace.id,
      'local',
      'decibel-local.csv',
      chosen.map((b) => ({ name: b.name, category: b.category, rating: b.rating, reviews: b.reviews, mobile: b.mobile, website: b.website ?? '', address: b.address, hours: b.hours.text, last_review: b.lastReview })),
    );

  return (
    <div className="flex h-full flex-col bg-white-100">
      <div className="flex h-12 shrink-0 items-center gap-2 overflow-x-auto border-b border-white-800 px-4 [scrollbar-width:none]">
        <div className="relative shrink-0">
          <Search size={16} strokeWidth={1.5} className="pointer-events-none absolute left-2.5 top-2 text-white-900" />
          <Input
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setSelected(new Set());
              setPage(0);
            }}
            placeholder="Search name, category or town"
            className="h-8 w-72 pl-8 max-sm:w-44"
            aria-label="Search local businesses"
          />
        </div>
        <h1 className="shrink-0 text-black-700">
          <span className="text-black-400">{matches.length}</span> {matches.length === 1 ? 'business' : 'businesses'}
        </h1>
        <Tag color={7} className="shrink-0">
          Sample data
        </Tag>
      </div>
      <LocalFilterBar filters={filters} onChange={patch} onClear={clear} />

      <div ref={fit.ref} className="min-h-0 flex-1 overflow-hidden">
        {rows.length ? (
          <RevealOnce id="local:table">
            <div className="tbl-wrap">
              <table className="tbl tbl-fixed">
                <colgroup>
                  <col style={{ width: 44 }} />
                  <col style={{ width: 270 }} />
                  <col style={{ width: 150 }} />
                  <col style={{ width: 90 }} />
                  <col style={{ width: 90 }} />
                  <col style={{ width: 160 }} />
                  <col style={{ width: 230 }} />
                  <col style={{ width: 260 }} />
                  <col style={{ width: 190 }} />
                  <col style={{ width: 130 }} />
                </colgroup>
                <thead>
                  <tr>
                    <th className="w-10">
                      <Checkbox
                        aria-label="Select all on this page"
                        checked={allSelected}
                        indeterminate={!allSelected && selected.size > 0}
                        onChange={(v) => setSelected(v ? new Set(rows.map((b) => b.id)) : new Set())}
                      />
                    </th>
                    <th>Business</th>
                    <th>Category</th>
                    <th>Rating</th>
                    <th>Reviews</th>
                    <th>Mobile</th>
                    <th>Website</th>
                    <th>Address</th>
                    <th>Hours</th>
                    <th>Last review</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((b) => (
                    <tr key={b.id} data-selected={selected.has(b.id)}>
                      <td>
                        <Checkbox
                          aria-label={`Select ${b.name}`}
                          checked={selected.has(b.id)}
                          onChange={(v) =>
                            setSelected((s) => {
                              const next = new Set(s);
                              if (v) next.add(b.id);
                              else next.delete(b.id);
                              return next;
                            })
                          }
                        />
                      </td>
                      <td>
                        <span className="flex min-w-0 items-center gap-2">
                          <Avatar name={b.name} size={24} />
                          <span className="truncate font-medium text-black-400">{b.name}</span>
                        </span>
                      </td>
                      <td>
                        <span className={cn('tag', `tag-${b.tone}`)}>{b.category}</span>
                      </td>
                      <td className="tabular-nums">
                        <span className="flex items-center gap-1 text-black-400">
                          <Star size={14} strokeWidth={0} fill="#e0a526" aria-hidden />
                          {b.rating.toFixed(1)}
                        </span>
                      </td>
                      <td className="tabular-nums text-black-700">{b.reviews.toLocaleString('en-GB')}</td>
                      <td className="tabular-nums">{formatPhone(b.mobile)}</td>
                      <td>
                        {b.website ? (
                          <span className="flex min-w-0 items-center gap-1.5 text-black-700">
                            <Globe size={14} strokeWidth={1.5} className="shrink-0 text-white-900" aria-hidden />
                            <span className="truncate">{b.website}</span>
                          </span>
                        ) : (
                          <span className="tag tag-3">No website</span>
                        )}
                      </td>
                      <td>
                        <span className="flex min-w-0 items-center gap-1.5 text-black-700">
                          <MapPin size={14} strokeWidth={1.5} className="shrink-0 text-white-900" aria-hidden />
                          <span className="truncate">{b.address}</span>
                        </span>
                      </td>
                      <td>
                        <span className={cn('tag', b.hours.open ? 'tag-0' : 'tag-7')}>{b.hours.text}</span>
                      </td>
                      <td className="text-black-700">{b.lastReview}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </RevealOnce>
        ) : (
          <EmptyState shape="diamond" title="No results" description="Loosen a filter to see more businesses." action={<Button onClick={clear}>Clear filters</Button>} />
        )}
      </div>

      <div className="flex h-12 shrink-0 items-center justify-between border-t border-white-800 bg-panel px-4">
        <span className="t-label">{`Page ${current + 1} / ${pages} · rows ${matches.length ? current * PAGE + 1 : 0}–${Math.min((current + 1) * PAGE, matches.length)}`}</span>
        <div className="flex gap-2">
          <Button size="compact" disabled={current === 0} onClick={() => setPage(current - 1)}>
            Previous
          </Button>
          <Button size="compact" disabled={current >= pages - 1} onClick={() => setPage(current + 1)}>
            Next
          </Button>
        </div>
      </div>

      <BulkBar count={selected.size} onClear={() => setSelected(new Set())}>
        <BulkAction onClick={() => setPicker('add')}>
          <ListPlus size={16} strokeWidth={1.5} /> Add to list
        </BulkAction>
        <BulkAction onClick={() => setPicker('create')}>
          <Plus size={16} strokeWidth={1.5} /> Create new list
        </BulkAction>
        <BulkAction onClick={exportRows}>
          <Download size={16} strokeWidth={1.5} /> Export CSV
        </BulkAction>
      </BulkBar>

      <ListPickerDialog open={!!picker} createOnly={picker === 'create'} onClose={() => setPicker(null)} onPick={addToList} title={`Add ${selected.size} to list`} busyLabel="Adding…" />
    </div>
  );
}
