'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, FileText, Phone, Plus, Trash2, Users, Zap } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useApp } from '@/lib/app-context';
import { supabase } from '@/lib/supabase/client';
import type { List } from '@/lib/types';
import { PeopleView } from '@/components/app/people-view';
import { AddPersonDialog, AssignDialog } from '@/components/app/records';
import { Button, ButtonLink } from '@/components/ui/button';
import { EmptyState, ErrorCard, Skeleton, TableSkeleton } from '@/components/ui/display';
import { Checkbox, Field, Input, Textarea } from '@/components/ui/form';
import { Dialog, useToast } from '@/components/ui/overlay';

export default function ListPage() {
  const { id } = useParams<{ id: string }>();
  const { isAdmin, user } = useApp();
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const [assign, setAssign] = useState(false);
  const [add, setAdd] = useState(false);
  const [settings, setSettings] = useState(false);
  const [starting, setStarting] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', script: '', is_shared: true });

  const list = useQuery({
    queryKey: ['list', id], placeholderData: undefined,
    queryFn: async () => {
      const { data, error } = await supabase().from('lists').select('*').eq('id', id).maybeSingle();
      if (error) throw error;
      return data as List | null;
    },
  });
  useEffect(() => {
    if (list.data) setForm({ name: list.data.name, description: list.data.description ?? '', script: list.data.script ?? '', is_shared: list.data.is_shared });
  }, [list.data]);

  const start = async () => {
    setStarting(true);
    const { data, error } = await supabase().rpc('start_calling_list', { p_list_id: id });
    setStarting(false);
    if (error) return toast(`Could not start: ${error.message}`);
    toast(`${data ?? 0} people queued for you`);
    router.push('/app');
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase()
      .from('lists')
      .update({ name: form.name.trim(), description: form.description.trim() || null, script: form.script.trim() || null, is_shared: form.is_shared })
      .eq('id', id);
    if (error) return toast(/duplicate|unique/i.test(error.message) ? 'A list with that name already exists.' : `Could not save: ${error.message}`);
    setSettings(false);
    toast('List saved');
    ['list', 'lists'].forEach((k) => void qc.invalidateQueries({ queryKey: [k] }));
  };

  const remove = async () => {
    const { error } = await supabase().from('lists').delete().eq('id', id);
    if (error) return toast(`Could not delete: ${error.message}`);
    void qc.invalidateQueries({ queryKey: ['lists'] });
    router.replace('/app/lists');
  };

  if (list.error) {
    return (
      <div className="p-6">
        <ErrorCard message={(list.error as Error).message} onRetry={() => list.refetch()} />
      </div>
    );
  }
  if (list.isLoading) {
    return (
      <div className="flex h-full flex-col" aria-busy>
        <div className="flex h-12 items-center gap-3 border-b border-white-800 bg-white-100 px-4">
          <Skeleton className="h-8 w-8" />
          <Skeleton className="h-5 w-56" />
        </div>
        <div className="h-[49px] border-b border-white-800 bg-white-100" />
        <div className="bg-white-100">
          <TableSkeleton rows={10} cols={7} />
        </div>
      </div>
    );
  }
  if (!list.data) return <EmptyState title="List not found" action={<ButtonLink href="/app/lists">Back to lists</ButtonLink>} />;
  const l = list.data;
  const canEdit = isAdmin || l.owner_id === user.id;

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-12 shrink-0 items-center gap-3 overflow-x-auto border-b border-white-800 bg-white-100 px-4 [scrollbar-width:none]">
        <Link href="/app/lists" aria-label="Back to lists" className="flex h-8 w-8 items-center justify-center rounded-sm hover:bg-white-300">
          <ChevronLeft size={16} strokeWidth={1.5} />
        </Link>
        {/* one line, so the toolbar keeps the shared 48px height */}
        <div className="flex min-w-0 flex-1 items-baseline gap-2">
          <h1 className="t-h4 shrink-0 truncate">{l.name}</h1>
          {l.description ? <p className="t-small min-w-0 truncate text-black-700">{l.description}</p> : null}
        </div>
        <Button size="compact" onClick={() => setSettings(true)} disabled={!canEdit}>
          <FileText size={16} strokeWidth={1.5} /> {l.script ? 'Script and settings' : 'Settings'}
        </Button>
        <Button size="compact" onClick={() => setAssign(true)} disabled={!isAdmin} title={isAdmin ? undefined : 'Only owners and admins can assign'}>
          <Users size={16} strokeWidth={1.5} /> Assign to
        </Button>
        <Button size="compact" loading={starting} onClick={start} title="Queue everyone in this list on your Today page">
          <Phone size={16} strokeWidth={1.5} /> Add to Today
        </Button>
        <ButtonLink size="compact" variant="primary" href={`/app/dialler?list=${id}`}>
          <Zap size={16} strokeWidth={1.6} style={{ color: 'var(--dialler)' }} /> Start power dialler
        </ButtonLink>
      </div>
      {l.script ? (
        <details className="border-b border-white-800 bg-white-100 px-4 py-2">
          <summary className="t-small cursor-pointer text-black-700">Call script</summary>
          <p className="mt-2 max-w-3xl whitespace-pre-wrap pb-2">{l.script}</p>
        </details>
      ) : null}
      <div className="min-h-0 flex-1">
        <PeopleView
          listId={id}
          defaultView={l.default_view}
          toolbar={
            <>
              <Button size="compact" onClick={() => setAdd(true)}>
                <Plus size={16} strokeWidth={1.5} /> Add person
              </Button>
              <ButtonLink size="compact" href={`/app/leads?list=${id}`}>
                Add from database
              </ButtonLink>
            </>
          }
          empty={
            <EmptyState
              title="No people in this list yet"
              description="Search the database and add the people you want to call."
              action={
                <ButtonLink variant="primary" href={`/app/leads?list=${id}`}>
                  Add from database
                </ButtonLink>
              }
            />
          }
        />
      </div>

      <AssignDialog open={assign} onClose={() => setAssign(false)} listId={id} />
      <AddPersonDialog open={add} onClose={() => setAdd(false)} listId={id} />
      <Dialog open={settings} onClose={() => setSettings(false)} title="List settings" width={600}>
        <form onSubmit={save} className="flex flex-col gap-4">
          <Field label="Name" htmlFor="ls-name">
            <Input id="ls-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </Field>
          <Field label="Description" htmlFor="ls-desc">
            <Input id="ls-desc" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Field>
          <Field label="Call script" htmlFor="ls-script" hint="Shown at the top of the list for every rep working it.">
            <Textarea id="ls-script" className="min-h-[140px]" value={form.script} onChange={(e) => setForm({ ...form, script: e.target.value })} placeholder="Hi, it's … from … . The reason for my call is …" />
          </Field>
          <Checkbox checked={form.is_shared} onChange={(v) => setForm({ ...form, is_shared: v })} label="Shared with the whole workspace" />
          <div className="flex items-center justify-between gap-2">
            <Button variant="ghost" className="text-danger-700" onClick={remove}>
              <Trash2 size={16} strokeWidth={1.5} /> Delete list
            </Button>
            <div className="flex gap-2">
              <Button onClick={() => setSettings(false)}>Cancel</Button>
              <Button type="submit" variant="primary">
                Save
              </Button>
            </div>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
