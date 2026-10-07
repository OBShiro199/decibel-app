'use client';
// The founder's support inbox. Password-gated by the `support` Edge Function, which returns a
// signed token kept in this browser; every request sends it back. Polls for new messages.
import { ArrowUp, Check, MagnifyingGlass, SignOut } from '@phosphor-icons/react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { LogoMark } from '@/components/marketing/logo';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type Thread = {
  id: string;
  email: string;
  name: string;
  workspace_name: string;
  status: 'open' | 'closed';
  founder_unread: boolean;
  last_message_at: string;
  last_preview: string;
  last_sender: 'user' | 'founder';
  created_at: string;
};
type Msg = { id: string; sender: 'user' | 'founder'; body: string; created_at: string; pending?: boolean };

const TOKEN_KEY = 'decibel.private-inbox';
const FN_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/support`;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

class InboxError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const res = await fetch(FN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', apikey: ANON, authorization: `Bearer ${ANON}` },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new InboxError(data.error ?? 'request_failed', res.status);
  return data as T;
}

const readToken = () => {
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    if (!raw) return null;
    const exp = Number(raw.split('.')[0]);
    return exp > Date.now() ? raw : null;
  } catch {
    return null;
  }
};

const when = (iso: string) => {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const days = (now.getTime() - d.getTime()) / 86400_000;
  if (days < 6) return d.toLocaleDateString('en-GB', { weekday: 'short' });
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};
const full = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

const initials = (t: Pick<Thread, 'name' | 'email'>) =>
  (t.name.trim() ? t.name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]) : [t.email[0]]).join('').toUpperCase();

export function PrivateInbox() {
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setToken(readToken());
    setReady(true);
  }, []);

  const signOut = useCallback(() => {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* ignore */
    }
    setToken(null);
  }, []);

  return (
    <div className="app-shell min-h-dvh bg-white-100 text-black-400">
      {!ready ? null : token ? <Inbox token={token} onSignOut={signOut} /> : <Gate onToken={setToken} />}
    </div>
  );
}

function Gate({ onToken }: { onToken: (t: string) => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError('');
    try {
      const { token } = await call<{ token: string }>({ action: 'login', password });
      try {
        localStorage.setItem(TOKEN_KEY, token);
      } catch {
        /* the session lasts for this tab only */
      }
      onToken(token);
    } catch (err) {
      const code = (err as Error).message;
      setError(code === 'locked' ? 'Too many attempts. Try again in 15 minutes.' : code === 'wrong_password' ? 'That password is not right.' : 'Could not sign in. Try again.');
      setPassword('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <form onSubmit={submit} className="w-full max-w-[320px]">
        <div className="mb-8 flex items-center gap-2">
          <LogoMark size={20} />
          <span className="font-medium">Inbox</span>
        </div>
        <label htmlFor="pw" className="mb-2 block text-black-700">
          Password
        </label>
        <input
          id="pw"
          type="password"
          autoFocus
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="h-9 w-full rounded-sm border border-white-800 bg-white-100 px-3 outline-none transition-colors focus:border-white-900"
        />
        {error ? <p className="mt-2 text-danger-700">{error}</p> : null}
        <Button type="submit" variant="primary" loading={busy} className="mt-4 w-full">
          Open inbox
        </Button>
      </form>
    </div>
  );
}

type Filter = 'open' | 'closed' | 'all';

function Inbox({ token, onSignOut }: { token: string; onSignOut: () => void }) {
  const [threads, setThreads] = useState<Thread[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('open');
  const [search, setSearch] = useState('');
  const [loadError, setLoadError] = useState('');

  const loadThreads = useCallback(async () => {
    try {
      const { threads } = await call<{ threads: Thread[] }>({ action: 'threads', token });
      setThreads(threads);
      setLoadError('');
    } catch (e) {
      if ((e as InboxError).status === 401) onSignOut();
      else setLoadError('Could not load the inbox.');
    }
  }, [token, onSignOut]);

  useEffect(() => {
    void loadThreads();
    const t = window.setInterval(() => document.visibilityState === 'visible' && void loadThreads(), 15000);
    return () => window.clearInterval(t);
  }, [loadThreads]);

  // links in the notification email open a conversation: /private#<thread id>
  useEffect(() => {
    const fromHash = () => {
      const id = window.location.hash.slice(1);
      if (id) setSelected(id);
    };
    fromHash();
    window.addEventListener('hashchange', fromHash);
    return () => window.removeEventListener('hashchange', fromHash);
  }, []);

  // pick the newest conversation when nothing is chosen
  useEffect(() => {
    if (!selected && threads?.length) setSelected(threads.find((t) => t.status === 'open')?.id ?? threads[0].id);
  }, [threads, selected]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (threads ?? []).filter(
      (t) =>
        (filter === 'all' || t.status === filter) &&
        (!q || t.email.toLowerCase().includes(q) || t.name.toLowerCase().includes(q) || t.workspace_name.toLowerCase().includes(q) || t.last_preview.toLowerCase().includes(q)),
    );
  }, [threads, filter, search]);

  const counts = useMemo(() => {
    const all = threads ?? [];
    return { open: all.filter((t) => t.status === 'open').length, closed: all.filter((t) => t.status === 'closed').length, all: all.length };
  }, [threads]);
  const unread = (threads ?? []).filter((t) => t.founder_unread).length;

  useEffect(() => {
    document.title = unread ? `(${unread}) Inbox | Decibel` : 'Inbox | Decibel';
  }, [unread]);

  const current = threads?.find((t) => t.id === selected) ?? null;

  const patchThread = useCallback((id: string, patch: Partial<Thread>) => {
    setThreads((list) => list?.map((t) => (t.id === id ? { ...t, ...patch } : t)) ?? list);
  }, []);

  return (
    <div className="flex h-dvh">
      <aside className="flex w-[340px] shrink-0 flex-col border-r border-white-800">
        <div className="flex h-12 shrink-0 items-center gap-2 border-b border-white-800 px-4">
          <LogoMark size={18} />
          <span className="font-medium">Support inbox</span>
          {unread ? <span className="rounded-xs bg-white-300 px-1.5 tabular-nums text-black-400">{unread} new</span> : null}
          <button onClick={onSignOut} className="ml-auto flex h-8 w-8 items-center justify-center rounded-sm text-black-700 hover:bg-white-300 hover:text-black-400" aria-label="Sign out" title="Sign out">
            <SignOut size={16} />
          </button>
        </div>
        <div className="shrink-0 space-y-2 border-b border-white-800 p-3">
          <div className="flex h-8 items-center gap-2 rounded-sm border border-white-800 px-2.5 focus-within:border-white-900">
            <MagnifyingGlass size={14} className="text-black-700" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search people and messages" className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-black-700" />
          </div>
          <div className="flex gap-1">
            {(['open', 'closed', 'all'] as Filter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn('h-7 rounded-xs border px-2 capitalize transition-colors', filter === f ? 'border-white-900 bg-white-100 text-black-400' : 'border-transparent text-black-700 hover:text-black-400')}
              >
                {f === 'all' ? 'All' : f === 'open' ? 'Open' : 'Closed'} <span className="tabular-nums text-black-700">{counts[f]}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {loadError ? <p className="p-4 text-danger-700">{loadError}</p> : null}
          {threads === null && !loadError ? <p className="p-4 text-black-700">Loading</p> : null}
          {threads && !shown.length ? <p className="p-4 text-black-700">{threads.length ? 'Nothing here.' : 'No support requests yet. They will appear here, and in your email, as they arrive.'}</p> : null}
          <ul>
            {shown.map((t) => (
              <li key={t.id}>
                <button
                  onClick={() => {
                    setSelected(t.id);
                    window.history.replaceState(null, '', `#${t.id}`);
                  }}
                  className={cn('flex w-full gap-3 border-b border-white-800 px-4 py-3 text-left transition-colors', t.id === selected ? 'bg-white-300' : 'hover:bg-white-200')}
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[4px] border border-white-800 bg-white-100 font-medium text-black-700">{initials(t)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className={cn('truncate', t.founder_unread ? 'font-medium text-black-400' : 'text-black-400')}>{t.name || t.email}</span>
                      <span className="ml-auto shrink-0 tabular-nums text-black-700">{when(t.last_message_at)}</span>
                    </span>
                    <span className="mt-0.5 flex items-center gap-2">
                      <span className={cn('truncate', t.founder_unread ? 'text-black-400' : 'text-black-700')}>
                        {t.last_sender === 'founder' ? 'You: ' : ''}
                        {t.last_preview}
                      </span>
                      {t.founder_unread ? <span className="ml-auto h-2 w-2 shrink-0 rounded-full" style={{ background: '#5f86e0' }} aria-label="Unread" /> : null}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </aside>

      <main className="min-w-0 flex-1">
        {current ? (
          <Conversation key={current.id} token={token} thread={current} onPatch={patchThread} onUnauthorized={onSignOut} />
        ) : (
          <div className="flex h-full items-center justify-center text-black-700">{threads?.length ? 'Choose a conversation' : ''}</div>
        )}
      </main>
    </div>
  );
}

function Conversation({
  token,
  thread,
  onPatch,
  onUnauthorized,
}: {
  token: string;
  thread: Thread;
  onPatch: (id: string, patch: Partial<Thread>) => void;
  onUnauthorized: () => void;
}) {
  const [messages, setMessages] = useState<Msg[] | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await call<{ messages: Msg[] }>({ action: 'messages', token, thread_id: thread.id });
      setMessages((prev) => {
        const pending = (prev ?? []).filter((m) => m.pending);
        return [...res.messages, ...pending];
      });
      onPatch(thread.id, { founder_unread: false });
    } catch (e) {
      if ((e as InboxError).status === 401) onUnauthorized();
      else setError('Could not load this conversation.');
    }
  }, [token, thread.id, onPatch, onUnauthorized]);

  useEffect(() => {
    void load();
    inputRef.current?.focus();
  }, [load]);

  // new messages from the person show up while the conversation is open
  useEffect(() => {
    if (thread.last_sender === 'user' && messages && !messages.some((m) => m.created_at >= thread.last_message_at && m.sender === 'user')) void load();
  }, [thread.last_message_at, thread.last_sender, messages, load]);

  useLayoutEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages?.length]);

  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [draft]);

  async function reply() {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setError('');
    const temp: Msg = { id: `tmp-${Date.now()}`, sender: 'founder', body, created_at: new Date().toISOString(), pending: true };
    setMessages((m) => [...(m ?? []), temp]);
    setDraft('');
    try {
      const { message } = await call<{ message: Msg }>({ action: 'reply', token, thread_id: thread.id, body });
      setMessages((m) => (m ?? []).map((x) => (x.id === temp.id ? message : x)));
      onPatch(thread.id, { last_message_at: message.created_at, last_preview: body.replace(/\s+/g, ' ').slice(0, 140), last_sender: 'founder' });
    } catch (e) {
      if ((e as InboxError).status === 401) return onUnauthorized();
      setMessages((m) => (m ?? []).filter((x) => x.id !== temp.id));
      setDraft(body);
      setError('Your reply did not send. Try again.');
    } finally {
      setSending(false);
    }
  }

  async function setStatus(status: Thread['status']) {
    onPatch(thread.id, { status });
    try {
      await call({ action: 'status', token, thread_id: thread.id, status });
    } catch {
      onPatch(thread.id, { status: thread.status });
    }
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-white-800 px-5">
        <div className="min-w-0 flex-1 truncate">
          <span className="font-medium">{thread.name || thread.email}</span>
          {thread.name ? <span className="ml-2 text-black-700">{thread.email}</span> : null}
          {thread.workspace_name ? <span className="ml-2 text-black-700">· {thread.workspace_name}</span> : null}
        </div>
        <span className="hidden text-black-700 lg:inline">Started {full(thread.created_at)}</span>
        {thread.status === 'open' ? (
          <Button size="compact" onClick={() => setStatus('closed')}>
            <Check size={14} /> Mark as done
          </Button>
        ) : (
          <Button size="compact" onClick={() => setStatus('open')}>
            Reopen
          </Button>
        )}
      </header>

      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto px-5 py-6">
        <div className="mx-auto max-w-[680px]">
          {messages === null && !error ? <p className="text-black-700">Loading</p> : null}
          <ol className="space-y-4">
            {(messages ?? []).map((m) => {
              const mine = m.sender === 'founder';
              return (
                <li key={m.id} className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
                  <div className={cn('flex max-w-[520px] flex-col', mine ? 'items-end' : 'items-start')}>
                    <div className={cn('whitespace-pre-wrap break-words rounded-md px-3.5 py-2.5', mine ? 'bg-white-300' : 'border border-white-800 bg-white-100', m.pending && 'opacity-60')}>
                      {m.body}
                    </div>
                    <span className="mt-1 px-0.5 text-black-700">
                      {mine ? 'You' : thread.name || thread.email} · {m.pending ? 'Sending' : full(m.created_at)}
                    </span>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      </div>

      <form
        className="shrink-0 border-t border-white-800 px-5 py-3"
        onSubmit={(e) => {
          e.preventDefault();
          void reply();
        }}
      >
        <div className="mx-auto max-w-[680px]">
          {error ? <p className="mb-2 text-danger-700">{error}</p> : null}
          <div className="flex items-end gap-2 rounded-md border border-white-800 py-2 pl-3.5 pr-2 focus-within:border-white-900">
            <textarea
              ref={inputRef}
              rows={1}
              value={draft}
              maxLength={4000}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  void reply();
                }
              }}
              placeholder={`Reply to ${thread.name.split(' ')[0] || thread.email}`}
              className="min-h-[24px] flex-1 resize-none bg-transparent py-0.5 leading-5 outline-none placeholder:text-black-700"
            />
            <button type="submit" disabled={!draft.trim() || sending} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[4px] bg-black-400 text-white-100 transition-opacity disabled:opacity-25" aria-label="Send reply">
              <ArrowUp size={15} weight="bold" />
            </button>
          </div>
          <p className="mt-1.5 text-black-700">They see this in the chat and get it by email. ⌘ Enter to send.</p>
        </div>
      </form>
    </div>
  );
}
