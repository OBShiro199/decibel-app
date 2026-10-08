'use client';
// Saving a search makes it a list in Lists (migration 0024): the list keeps the filters, and
// opening it runs the search again on Leads or Local businesses. One kind of list, one place.
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useApp } from '@/lib/app-context';
import { supabase } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/form';
import { Dialog, useToast } from '@/components/ui/overlay';

export interface SavedListRef {
  id: string;
  name: string;
}

export function SaveSearchDialog({
  open,
  onClose,
  source,
  search,
  savedList,
  placeholder,
}: {
  open: boolean;
  onClose: () => void;
  source: 'leads' | 'local';
  /** The filters and search text, in the saved format ({ v: 2, ...filters, q }). */
  search: Record<string, unknown>;
  /** Set when the page was opened from a saved search list: offers to update it. */
  savedList?: SavedListRef;
  placeholder: string;
}) {
  const { workspace, user } = useApp();
  const qc = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState<null | 'new' | 'update'>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setName(savedList ? `${savedList.name} (copy)` : '');
      setError('');
    }
  }, [open, savedList]);

  const done = (message: string) => {
    void qc.invalidateQueries({ queryKey: ['lists', workspace.id] });
    void qc.invalidateQueries({ queryKey: ['search-list'] });
    onClose();
    toast(message, { label: 'Open Lists', href: '/app/lists' });
  };

  async function saveNew(e: React.FormEvent) {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    setBusy('new');
    setError('');
    const { error: err } = await supabase()
      .from('lists')
      .insert({ workspace_id: workspace.id, owner_id: user.id, name: n.slice(0, 120), is_shared: true, search, search_source: source });
    setBusy(null);
    if (err) return setError(err.code === '23505' ? 'You already have a list with that name. Choose another.' : 'That did not save. Try again.');
    done(`Saved “${n}” to Lists`);
  }

  async function update() {
    if (!savedList) return;
    setBusy('update');
    const { error: err } = await supabase().from('lists').update({ search, updated_at: new Date().toISOString() }).eq('id', savedList.id);
    setBusy(null);
    if (err) return setError('That did not save. Try again.');
    done(`Updated “${savedList.name}”`);
  }

  return (
    <Dialog open={open} onClose={onClose} title="Save as a list">
      <form onSubmit={saveNew} className="flex flex-col gap-4">
        <p className="text-black-700">The list keeps these filters and appears in Lists. Open it any time to run the search again with the latest data.</p>
        {savedList ? (
          <div className="flex items-center gap-3 rounded-md border border-white-800 px-3 py-2.5">
            <p className="min-w-0 flex-1 truncate text-black-700">
              Opened from <span className="font-medium text-black-400">{savedList.name}</span>
            </p>
            <Button size="compact" loading={busy === 'update'} onClick={() => void update()}>
              Update this list
            </Button>
          </div>
        ) : null}
        <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={placeholder} aria-label="List name" maxLength={120} />
        {error ? (
          <p role="alert" className="text-danger-700">
            {error}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" loading={busy === 'new'} disabled={!name.trim()}>
            {savedList ? 'Save as new list' : 'Save list'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
