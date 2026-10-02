'use client';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useApp } from '@/lib/app-context';
import { useStages } from '@/lib/hooks';
import { supabase } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/form';
import { Dialog, useToast } from '@/components/ui/overlay';

interface Draft {
  id: string | null;
  name: string;
  kind: 'open' | 'won' | 'lost';
}

/** Edit, reorder, add and remove pipeline stages (owners and admins). */
export function StagesDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { workspace, isAdmin } = useApp();
  const { data: stages } = useStages();
  const qc = useQueryClient();
  const toast = useToast();
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && stages) {
      setDrafts(stages.map((s) => ({ id: s.id, name: s.name, kind: s.is_won ? 'won' : s.is_lost ? 'lost' : 'open' })));
      setError(null);
    }
  }, [open, stages]);

  const move = (i: number, by: number) =>
    setDrafts((d) => {
      const n = [...d];
      const j = i + by;
      if (j < 0 || j >= n.length) return d;
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });

  const save = async () => {
    const names = drafts.map((d) => d.name.trim());
    if (names.some((n) => !n)) return setError('Every stage needs a name.');
    if (new Set(names.map((n) => n.toLowerCase())).size !== names.length) return setError('Stage names must be unique.');
    if (!drafts.length) return setError('Keep at least one stage.');
    setBusy(true);
    setError(null);
    const db = supabase();
    try {
      const removed = (stages ?? []).filter((s) => !drafts.some((d) => d.id === s.id));
      if (removed.length) {
        const { error } = await db.from('pipeline_stages').delete().in('id', removed.map((s) => s.id));
        if (error) throw error;
      }
      // (workspace_id, position) and (workspace_id, name) are unique: park existing rows first
      for (const [i, d] of drafts.entries()) {
        if (d.id) {
          const { error } = await db.from('pipeline_stages').update({ position: 1000 + i, name: `__tmp_${i}_${d.id.slice(0, 8)}` }).eq('id', d.id);
          if (error) throw error;
        }
      }
      for (const [i, d] of drafts.entries()) {
        const row = { name: d.name.trim(), position: i + 1, is_won: d.kind === 'won', is_lost: d.kind === 'lost' };
        const { error } = d.id ? await db.from('pipeline_stages').update(row).eq('id', d.id) : await db.from('pipeline_stages').insert({ ...row, workspace_id: workspace.id });
        if (error) throw error;
      }
      toast('Stages saved');
      ['stages', 'people'].forEach((k) => void qc.invalidateQueries({ queryKey: [k] }));
      onClose();
    } catch (e) {
      setError((e as Error).message);
      void qc.invalidateQueries({ queryKey: ['stages'] });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Pipeline stages"
      description="Call outcomes move people between stages by name: Attempted, Connected, Meeting booked, Not interested and Wrong number. Rename those and the automatic move stops for that outcome."
      width={600}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save} loading={busy} disabled={!isAdmin}>
            Save stages
          </Button>
        </>
      }
    >
      {!isAdmin ? <p className="mb-3 text-black-700">Only owners and admins can change stages.</p> : null}
      <ul className="flex flex-col gap-2">
        {drafts.map((d, i) => (
          <li key={d.id ?? `new-${i}`} className="flex items-center gap-2">
            <span className="t-caption tabular w-5 text-right text-black-700">{i + 1}</span>
            <Input value={d.name} disabled={!isAdmin} onChange={(e) => setDrafts((all) => all.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} aria-label={`Stage ${i + 1} name`} />
            <Select className="w-28 shrink-0" value={d.kind} disabled={!isAdmin} onChange={(e) => setDrafts((all) => all.map((x, j) => (j === i ? { ...x, kind: e.target.value as Draft['kind'] } : x)))} aria-label={`Stage ${i + 1} type`}>
              <option value="open">Open</option>
              <option value="won">Won</option>
              <option value="lost">Lost</option>
            </Select>
            <Button size="icon" variant="ghost" aria-label="Move up" disabled={!isAdmin || i === 0} onClick={() => move(i, -1)}>
              <ArrowUp size={16} strokeWidth={1.5} />
            </Button>
            <Button size="icon" variant="ghost" aria-label="Move down" disabled={!isAdmin || i === drafts.length - 1} onClick={() => move(i, 1)}>
              <ArrowDown size={16} strokeWidth={1.5} />
            </Button>
            <Button size="icon" variant="ghost" aria-label="Delete stage" disabled={!isAdmin} onClick={() => setDrafts((all) => all.filter((_, j) => j !== i))}>
              <Trash2 size={16} strokeWidth={1.5} />
            </Button>
          </li>
        ))}
      </ul>
      {isAdmin ? (
        <Button className="mt-3" size="compact" onClick={() => setDrafts((all) => [...all, { id: null, name: '', kind: 'open' }])}>
          <Plus size={16} strokeWidth={1.5} /> Add stage
        </Button>
      ) : null}
      {error ? <p className="mt-3 text-danger-700" role="alert">{error}</p> : null}
    </Dialog>
  );
}
