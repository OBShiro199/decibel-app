'use client';
// The Attio-style records view used by People, Pipeline and a single List:
// table or kanban by pipeline stage, search / stage / owner filters, sort,
// selection with a bulk bar, and j/k/Enter/c keyboard navigation.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDownUp, ListPlus, Phone, Search, Trash2, UserMinus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { track } from '@/lib/analytics';
import { useApp } from '@/lib/app-context';
import { peopleQuery } from '@/lib/queries';
import { useDebounced, useMemberNames, useStages, useTableKeys } from '@/lib/hooks';
import { supabase } from '@/lib/supabase/client';
import type { Person, PipelineStage, Task } from '@/lib/types';
import { cn, formatDate, formatPhone, timeAgo } from '@/lib/utils';
import { KanbanSkeleton } from '@/components/app/skeletons';
import { useSoftphoneActions, useSoftphoneStatus } from '@/components/softphone/provider';
import { RevealOnce } from '@/components/ui/reveal';
import { Button } from '@/components/ui/button';
import { CompanyLogo, EmptyState, ErrorCard, TableSkeleton } from '@/components/ui/display';
import { Checkbox, Input, Select } from '@/components/ui/form';
import { Dialog, useToast } from '@/components/ui/overlay';
import { blockedLabel, BulkAction, BulkBar, isBlocked, ListPickerDialog, OutcomeBadge, PersonCell, setRecordNav, TpsBadge, ViewSwitcher } from './records';

type SortKey = 'recent' | 'name' | 'last_called' | 'priority';

export function PeopleView({
  listId,
  defaultView = 'table',
  toolbar,
  empty,
}: {
  listId?: string;
  defaultView?: 'table' | 'kanban';
  toolbar?: React.ReactNode;
  empty: React.ReactNode;
}) {
  const { workspace, user } = useApp();
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const softphone = useSoftphoneActions();
  const phone = useSoftphoneStatus();
  const { data: stages } = useStages();
  const names = useMemberNames();

  const [view, setView] = useState<'table' | 'kanban'>(defaultView);
  const [search, setSearch] = useState('');
  const term = useDebounced(search, 250);
  const [stage, setStage] = useState('');
  const [owner, setOwner] = useState('');
  const [sort, setSort] = useState<SortKey>('recent');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [listPicker, setListPicker] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const key = peopleQuery(workspace.id, listId).queryKey;
  const { data, isLoading, error, refetch } = useQuery(peopleQuery(workspace.id, listId));

  const rows = useMemo(() => {
    let r = data ?? [];
    const t = term.trim().toLowerCase();
    if (t) r = r.filter((p) => [p.full_name, p.job_title, p.company?.name, p.email].some((v) => v?.toLowerCase().includes(t)));
    if (stage) r = r.filter((p) => p.stage_id === stage);
    if (owner) r = r.filter((p) => (owner === 'none' ? !p.owner_id : p.owner_id === owner));
    const sorted = [...r];
    if (sort === 'name') sorted.sort((a, b) => a.full_name.localeCompare(b.full_name));
    else if (sort === 'last_called') sorted.sort((a, b) => (b.last_called_at ?? '').localeCompare(a.last_called_at ?? ''));
    else if (sort === 'priority') sorted.sort((a, b) => b.priority - a.priority);
    else if (!listId) sorted.sort((a, b) => b.created_at.localeCompare(a.created_at));
    return sorted;
  }, [data, term, stage, owner, sort, listId]);

  const stageName = (id: string | null) => stages?.find((s) => s.id === id)?.name ?? '';
  const open = (p: Person) => {
    setRecordNav(rows.map((r) => r.id));
    router.push(`/app/people/${p.id}`);
  };
  const call = (p: Person) => void softphone.callPerson(p, { listId });
  const { index, setIndex } = useTableKeys(rows, { onOpen: open, onCall: call, enabled: view === 'table' && phone.phase === 'idle' });

  const invalidate = () => ['people', 'today', 'list', 'lists'].forEach((k) => void qc.invalidateQueries({ queryKey: [k] }));
  const ids = [...selected];
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const addToList = async (target: string) => {
    const { error } = await supabase()
      .from('list_members')
      .upsert(ids.map((person_id, i) => ({ list_id: target, person_id, workspace_id: workspace.id, position: i, added_by: user.id })), { onConflict: 'list_id,person_id', ignoreDuplicates: true });
    if (error) throw new Error(error.message);
    track('person_added_to_list', { source: 'people', count: ids.length });
    toast(`Added ${ids.length} to the list`);
    setSelected(new Set());
    invalidate();
  };

  const setStageFor = async (personIds: string[], stageId: string) => {
    qc.setQueryData<Person[]>(key, (old) => old?.map((p) => (personIds.includes(p.id) ? { ...p, stage_id: stageId } : p)));
    const { error } = await supabase().from('people').update({ stage_id: stageId }).in('id', personIds);
    if (error) {
      toast(`Could not move: ${error.message}`);
      void refetch();
    }
  };

  const removeFromList = async () => {
    if (!listId) return;
    await supabase().from('list_members').delete().eq('list_id', listId).in('person_id', ids);
    toast(`Removed ${ids.length} from the list`);
    setSelected(new Set());
    invalidate();
  };

  const deletePeople = async () => {
    const { error } = await supabase().from('people').delete().in('id', ids);
    setConfirmDelete(false);
    if (error) return toast(`Could not delete: ${error.message}`);
    toast(`Deleted ${ids.length} ${ids.length === 1 ? 'person' : 'people'}`);
    setSelected(new Set());
    invalidate();
  };

  const owners = useMemo(() => [...new Set((data ?? []).map((p) => p.owner_id).filter(Boolean))] as string[], [data]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-white-800 bg-white-100 px-4 py-2">
        <ViewSwitcher view={view} onChange={setView} />
        <div className="relative">
          <Search size={16} strokeWidth={1.5} className="pointer-events-none absolute left-2.5 top-2 text-white-900" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filter by name, title or company" className="h-8 w-64 pl-8 max-sm:w-40" aria-label="Filter people" />
        </div>
        <Select value={stage} onChange={(e) => setStage(e.target.value)} className="w-40 [&_select]:h-8" aria-label="Filter by stage">
          <option value="">All stages</option>
          {(stages ?? []).map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
        <Select value={owner} onChange={(e) => setOwner(e.target.value)} className="w-40 [&_select]:h-8" aria-label="Filter by owner">
          <option value="">All owners</option>
          <option value="none">Unassigned</option>
          {owners.map((o) => (
            <option key={o} value={o}>
              {names[o] ?? 'Teammate'}
            </option>
          ))}
        </Select>
        <div className="flex items-center gap-1 text-black-700">
          <ArrowDownUp size={16} strokeWidth={1.5} />
          <Select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="w-36 [&_select]:h-8" aria-label="Sort">
            <option value="recent">{listId ? 'List order' : 'Recently added'}</option>
            <option value="name">Name</option>
            <option value="last_called">Last called</option>
            <option value="priority">Priority</option>
          </Select>
        </div>
        <span className="t-label ml-1 min-w-[84px]">{isLoading ? 'Loading' : `${rows.length.toLocaleString('en-GB')} ${rows.length === 1 ? 'person' : 'people'}`}</span>
        <div className="ml-auto flex items-center gap-2">{toolbar}</div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-white-100">
        {error ? (
          <div className="p-4">
            <ErrorCard message={(error as Error).message} onRetry={() => refetch()} />
          </div>
        ) : isLoading || !stages ? (
          view === 'kanban' ? <KanbanSkeleton /> : <TableSkeleton rows={12} cols={7} />
        ) : !data?.length ? (
          empty
        ) : !rows.length ? (
          <EmptyState shape="diamond" title="No matches" description="Nobody matches those filters. Loosen a filter to see more." action={<Button onClick={() => { setSearch(''); setStage(''); setOwner(''); }}>Clear filters</Button>} />
        ) : view === 'table' ? (
          <RevealOnce id={`people:${listId ?? 'all'}`}>
          <div className="tbl-wrap"><table className="tbl tbl-fixed"><colgroup><col style={{ width: 44 }} /><col style={{ width: 220 }} /><col style={{ width: 210 }} /><col style={{ width: 220 }} /><col style={{ width: 250 }} /><col style={{ width: 170 }} /><col style={{ width: 160 }} /><col style={{ width: 140 }} /><col style={{ width: 150 }} /><col style={{ width: 100 }} /></colgroup>
            <thead>
              <tr>
                <th className="w-10">
                  <Checkbox aria-label="Select all" checked={allSelected} indeterminate={!allSelected && selected.size > 0} onChange={(v) => setSelected(v ? new Set(rows.map((r) => r.id)) : new Set())} />
                </th>
                <th>Name</th>
                <th>Title</th>
                <th>Company</th>
                <th>Mobile</th>
                <th>Stage</th>
                <th>Last outcome</th>
                <th>Last called</th>
                <th>Owner</th>
                <th className="w-24" />
              </tr>
            </thead>
            <tbody>
              {rows.map((p, i) => {
                const blocked = blockedLabel(p);
                return (
                  <tr key={p.id} data-selected={selected.has(p.id)} data-active={i === index} onClick={() => setIndex(i)} onDoubleClick={() => open(p)} className="cursor-default">
                    <td>
                      <Checkbox aria-label={`Select ${p.full_name}`} checked={selected.has(p.id)} onChange={() => toggle(p.id)} />
                    </td>
                    <td className="sticky left-0 max-w-[260px]">
                      <button onClick={() => open(p)} className="block w-full text-left hover:underline">
                        <PersonCell name={p.full_name} sub={p.job_title} />
                      </button>
                    </td>
                    <td className="max-w-[220px] truncate text-black-500">{p.job_title ?? <span className="text-faint">–</span>}</td>
                    <td>
                      {p.company?.name ? (
                        <span className="flex items-center gap-2">
                          <CompanyLogo name={p.company.name} size={20} />
                          <span className="max-w-[200px] truncate">{p.company.name}</span>
                        </span>
                      ) : (
                        <span className="text-faint">–</span>
                      )}
                    </td>
                    <td className="tabular-nums text-xs">
                      {p.mobile_e164 ? formatPhone(p.mobile_e164) : <span className="text-white-900">–</span>}{' '}
                      {p.do_not_call || p.tps_status === 'tps_listed' || p.tps_status === 'ctps_listed' ? <TpsBadge status={p.tps_status} doNotCall={p.do_not_call} /> : null}
                    </td>
                    <td>
                      <select
                        aria-label={`Stage for ${p.full_name}`}
                        value={p.stage_id ?? ''}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => setStageFor([p.id], e.target.value)}
                        className="h-7 max-w-[150px] cursor-pointer rounded-sm border border-transparent bg-transparent pr-1 hover:border-white-800"
                      >
                        {!p.stage_id ? <option value="">No stage</option> : null}
                        {(stages ?? []).map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <OutcomeBadge outcome={p.last_outcome} />
                    </td>
                    <td className="tabular-nums text-xs text-white-900">{p.last_called_at ? timeAgo(p.last_called_at) : 'Never'}</td>
                    <td className="max-w-[140px] truncate text-black-700">{p.owner_id ? (names[p.owner_id] ?? 'Teammate') : '–'}</td>
                    <td className="text-right">
                      <Button size="compact" disabled={isBlocked(p)} title={blocked ?? `Call ${p.full_name}`} onClick={(e) => { e.stopPropagation(); call(p); }}>
                        <Phone size={14} strokeWidth={1.5} /> Call
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
          </RevealOnce>
        ) : (
          <Kanban people={rows} stages={stages ?? []} onMove={(id, stageId) => setStageFor([id], stageId)} onOpen={open} />
        )}
      </div>

      <BulkBar count={selected.size} onClear={() => setSelected(new Set())}>
        <BulkAction onClick={() => setListPicker(true)}>
          <ListPlus size={16} strokeWidth={1.5} /> Add to list
        </BulkAction>
        <label className="flex h-8 shrink-0 items-center gap-1.5 rounded-sm px-2.5 hover:bg-black-500">
          Move to
          <select
            aria-label="Move selected to stage"
            value=""
            onChange={(e) => {
              if (e.target.value) {
                void setStageFor(ids, e.target.value);
                toast(`Moved ${ids.length} to ${stageName(e.target.value)}`);
              }
            }}
            className="bg-transparent text-white-100 outline-none"
          >
            <option value="" className="text-black-400">stage…</option>
            {(stages ?? []).map((s) => (
              <option key={s.id} value={s.id} className="text-black-400">
                {s.name}
              </option>
            ))}
          </select>
        </label>
        {listId ? (
          <BulkAction onClick={removeFromList}>
            <UserMinus size={16} strokeWidth={1.5} /> Remove from list
          </BulkAction>
        ) : null}
        <BulkAction onClick={() => setConfirmDelete(true)}>
          <Trash2 size={16} strokeWidth={1.5} /> Delete
        </BulkAction>
      </BulkBar>

      <ListPickerDialog open={listPicker} onClose={() => setListPicker(false)} onPick={addToList} />
      <Dialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={`Delete ${ids.length} ${ids.length === 1 ? 'person' : 'people'}?`}
        description="Their notes and tasks are deleted too. Calls stay in the call log. Revealed contacts can be added again from the database at no cost."
        footer={
          <>
            <Button onClick={() => setConfirmDelete(false)}>Cancel</Button>
            <Button variant="danger" onClick={deletePeople}>
              Delete
            </Button>
          </>
        }
      />
    </div>
  );
}

function Kanban({ people, stages, onMove, onOpen }: { people: Person[]; stages: PipelineStage[]; onMove: (personId: string, stageId: string) => void; onOpen: (p: Person) => void }) {
  const { workspace } = useApp();
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);

  // next open task per person, shown on the card
  const { data: tasks } = useQuery({
    queryKey: ['people', 'kanban-tasks', workspace.id],
    queryFn: async () => {
      const { data } = await supabase().from('tasks').select('id,person_id,title,due_at').eq('workspace_id', workspace.id).is('completed_at', null).order('due_at', { ascending: true, nullsFirst: false }).limit(500);
      const map: Record<string, Pick<Task, 'title' | 'due_at'>> = {};
      (data ?? []).forEach((t) => {
        if (t.person_id && !map[t.person_id]) map[t.person_id] = t;
      });
      return map;
    },
  });

  return (
    <div className="flex h-full gap-3 overflow-x-auto bg-canvas p-4">
      {stages.map((s) => {
        const cards = people.filter((p) => p.stage_id === s.id);
        return (
          <section
            key={s.id}
            aria-label={s.name}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(s.id);
            }}
            onDragLeave={() => setOver((o) => (o === s.id ? null : o))}
            onDrop={(e) => {
              e.preventDefault();
              const id = e.dataTransfer.getData('text/plain');
              if (id) onMove(id, s.id);
              setOver(null);
              setDragging(null);
            }}
            className="flex w-[280px] shrink-0 flex-col"
          >
            <header className="t-label mb-2 flex items-center gap-2 px-1 text-black-700">
              <span className={cn('h-2 w-2', s.is_won ? 'bg-success-500' : s.is_lost ? 'bg-white-900' : 'bg-accent-500')} />
              {s.name}
              <span className="t-caption rounded-full bg-white-300 px-1.5 text-black-700">{cards.length}</span>
            </header>
            <div
              className={cn(
                'flex min-h-[96px] flex-1 flex-col gap-2 rounded-md border border-dashed p-1 transition-colors',
                over === s.id && dragging ? 'border-black-0 bg-white-300' : 'border-transparent',
              )}
            >
              {cards.map((p) => (
                <article
                  key={p.id}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/plain', p.id);
                    e.dataTransfer.effectAllowed = 'move';
                    setDragging(p.id);
                  }}
                  onDragEnd={() => {
                    setDragging(null);
                    setOver(null);
                  }}
                  onClick={() => onOpen(p)}
                  onKeyDown={(e) => e.key === 'Enter' && onOpen(p)}
                  tabIndex={0}
                  className={cn('cursor-grab border border-white-800 bg-white-100 p-3 hover:border-white-900', dragging === p.id && 'opacity-50')}
                >
                  <p className="truncate">{p.full_name}</p>
                  <p className="truncate text-black-700">{p.company?.name ?? p.job_title ?? ''}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {p.last_outcome ? <OutcomeBadge outcome={p.last_outcome} /> : null}
                    {p.do_not_call || p.tps_status === 'tps_listed' || p.tps_status === 'ctps_listed' ? <TpsBadge status={p.tps_status} doNotCall={p.do_not_call} /> : null}
                    {tasks?.[p.id] ? (
                      <span className="t-caption truncate text-black-700">
                        {tasks[p.id].title}
                        {tasks[p.id].due_at ? ` · ${formatDate(tasks[p.id].due_at)}` : ''}
                      </span>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
