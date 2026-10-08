'use client';
// Founder support chat: a small launcher in the bottom right of the app that opens a
// conversation with Oliver. Messages are saved by the `support` Edge Function, which also
// emails the founder; replies come from the inbox at /private and land here (and by email).
import { ArrowUp, X } from '@phosphor-icons/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useSoftphoneState } from '@/components/softphone/provider';
import { useApp } from '@/lib/app-context';
import { FOUNDER } from '@/lib/site';
import { invoke, supabase } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

type Msg = { id: string; sender: 'user' | 'founder'; body: string; created_at: string; pending?: boolean };
type Conversation = { threadId: string | null; unread: boolean; messages: Msg[] };

const key = (userId: string) => ['support', userId] as const;

async function fetchConversation(): Promise<Conversation> {
  const sb = supabase();
  const { data: thread, error } = await sb.from('support_threads').select('id,user_unread').maybeSingle();
  if (error) throw error;
  if (!thread) return { threadId: null, unread: false, messages: [] };
  const { data: messages, error: mErr } = await sb
    .from('support_messages')
    .select('id,sender,body,created_at')
    .eq('thread_id', thread.id)
    .order('created_at', { ascending: true });
  if (mErr) throw mErr;
  return { threadId: thread.id, unread: thread.user_unread, messages: (messages ?? []) as Msg[] };
}

/** The founder's picture, or his initials until a photo is added (FOUNDER.photo in lib/site.ts). */
function FounderFace({ size }: { size: number }) {
  if (FOUNDER.photo) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={FOUNDER.photo} alt={FOUNDER.name} width={size} height={size} className="shrink-0 rounded-[4px] object-cover" style={{ width: size, height: size }} />;
  }
  return (
    <span className="flex shrink-0 items-center justify-center rounded-[4px] bg-white-300 font-medium text-black-400" style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}>
      OB
    </span>
  );
}

const timeOf = (iso: string) => {
  const d = new Date(iso);
  const today = new Date().toDateString() === d.toDateString();
  return today
    ? d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};

const OPEN_EVENT = 'decibel:support';
/** Opens the founder chat; with a message, sends it straight away (e.g. a top-up request). */
export function openSupport(message?: string) {
  window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: { message } }));
}

export function SupportWidget() {
  const { user } = useApp();
  const pathname = usePathname();
  const softphone = useSoftphoneState();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const convo = useQuery({
    queryKey: key(user.id),
    queryFn: fetchConversation,
    // quick while the chat is open, a light check for replies while it is closed
    refetchInterval: open ? 6000 : 60000,
    staleTime: 5000,
    retry: 1,
  });
  const messages = convo.data?.messages ?? [];
  const unread = !!convo.data?.unread;

  // links in reply emails open the chat (?support=1)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('support') === '1') {
      setOpen(true);
      params.delete('support');
      const q = params.toString();
      window.history.replaceState(null, '', `${window.location.pathname}${q ? `?${q}` : ''}`);
    }
  }, []);

  // reading the conversation clears the unread badge
  useEffect(() => {
    if (!open || !unread) return;
    qc.setQueryData<Conversation>(key(user.id), (c) => (c ? { ...c, unread: false } : c));
    void supabase().rpc('support_mark_read');
  }, [open, unread, qc, user.id]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // keep the newest message in view
  useLayoutEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, open]);

  // grow the composer with its text, up to a few lines
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [draft, open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  async function send(text?: string) {
    const fromDraft = text === undefined;
    const body = (fromDraft ? draft : text).trim();
    if (!body || (fromDraft && sending)) return;
    setSending(true);
    setError('');
    const temp: Msg = { id: `tmp-${Date.now()}`, sender: 'user', body, created_at: new Date().toISOString(), pending: true };
    qc.setQueryData<Conversation>(key(user.id), (c) => ({ threadId: c?.threadId ?? null, unread: false, messages: [...(c?.messages ?? []), temp] }));
    if (fromDraft) setDraft('');
    try {
      const { message } = await invoke<{ message: Msg }>('support', { action: 'send', body });
      qc.setQueryData<Conversation>(key(user.id), (c) => (c ? { ...c, messages: c.messages.map((m) => (m.id === temp.id ? message : m)) } : c));
      void qc.invalidateQueries({ queryKey: key(user.id) });
    } catch (e) {
      qc.setQueryData<Conversation>(key(user.id), (c) => (c ? { ...c, messages: c.messages.filter((m) => m.id !== temp.id) } : c));
      if (fromDraft) setDraft(body);
      const msg = (e as Error).message;
      setError(msg === 'slow_down' ? 'You have sent a lot of messages. Try again in a little while.' : 'Your message did not send. Try again.');
    } finally {
      setSending(false);
    }
  }

  // openSupport(message) from anywhere in the app opens the chat and sends that message
  const sendRef = useRef(send);
  sendRef.current = send;
  useEffect(() => {
    const onOpen = (e: Event) => {
      const message = (e as CustomEvent<{ message?: string }>).detail?.message;
      setOpen(true);
      if (message) void sendRef.current(message);
    };
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, []);

  // the dialler and an open softphone own the bottom right corner
  if (pathname?.endsWith('/dialler') || softphone.open) return null;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="support-launcher fixed bottom-16 right-5 z-menu flex h-10 items-center gap-2.5 rounded-md border border-white-800 bg-white-100 pl-[5px] pr-3.5 text-black-400 shadow-[0_6px_20px_rgba(18,18,18,0.07)] transition-[border-color,transform] duration-150 hover:-translate-y-px hover:border-white-900"
        aria-label="Ask the founder a question"
      >
        <FounderFace size={28} />
        <span className="font-medium">Ask any question</span>
        {unread ? <span className="h-2 w-2 rounded-full" style={{ background: '#5f86e0' }} aria-label="New reply" /> : null}
      </button>
    );
  }

  return (
    <section
      aria-label="Support chat"
      className="support-panel fixed bottom-16 right-5 z-menu flex h-[min(540px,calc(100dvh-96px))] w-[360px] max-w-[calc(100vw-40px)] flex-col overflow-hidden rounded-md border border-white-800 bg-white-100 shadow-[0_16px_48px_rgba(18,18,18,0.12)]"
    >
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-white-800 px-3">
        <FounderFace size={32} />
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate font-medium text-black-400">{FOUNDER.name}, founder of Decibel</p>
          <p className="truncate text-black-700">Usually replies within a few hours</p>
        </div>
        <button onClick={() => setOpen(false)} className="flex h-8 w-8 items-center justify-center rounded-sm text-black-700 hover:bg-white-300 hover:text-black-400" aria-label="Close chat">
          <X size={16} />
        </button>
      </header>

      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
        <div className="mb-4 flex gap-2.5">
          <FounderFace size={24} />
          <div className="max-w-[260px] rounded-md border border-white-800 bg-white-100 px-3 py-2 text-black-400">
            Hi, I&apos;m {FOUNDER.name}. Ask me anything about Decibel, from finding leads to the dialler. I read every message and reply here and by email.
          </div>
        </div>

        {convo.isLoading ? <p className="px-1 text-black-700">Loading your messages</p> : null}

        <ol className="space-y-3">
          {messages.map((m, i) => {
            const mine = m.sender === 'user';
            const showTime = i === messages.length - 1 || messages[i + 1]?.sender !== m.sender;
            return (
              <li key={m.id} className={cn('flex gap-2.5', mine ? 'justify-end' : 'justify-start')}>
                {!mine ? <FounderFace size={24} /> : null}
                <div className={cn('flex max-w-[260px] flex-col', mine ? 'items-end' : 'items-start')}>
                  <div
                    className={cn(
                      'whitespace-pre-wrap break-words rounded-md px-3 py-2',
                      mine ? 'bg-white-300 text-black-400' : 'border border-white-800 bg-white-100 text-black-400',
                      m.pending && 'opacity-60',
                    )}
                  >
                    {m.body}
                  </div>
                  {showTime ? <span className="mt-1 px-0.5 text-black-700">{m.pending ? 'Sending' : timeOf(m.created_at)}</span> : null}
                </div>
              </li>
            );
          })}
        </ol>
      </div>

      <form
        className="shrink-0 border-t border-white-800 p-2.5"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        {error ? <p className="mb-2 px-1 text-danger-700">{error}</p> : null}
        <div className="flex items-end gap-2 rounded-md border border-white-800 bg-white-100 py-1.5 pl-3 pr-1.5 transition-colors focus-within:border-white-900">
          <textarea
            ref={inputRef}
            value={draft}
            maxLength={4000}
            rows={1}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void send();
              }
            }}
            placeholder="Ask a question"
            aria-label="Your message"
            className="min-h-[24px] flex-1 resize-none bg-transparent py-0.5 leading-5 text-black-400 outline-none placeholder:text-black-700"
          />
          <button
            type="submit"
            disabled={!draft.trim() || sending}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[4px] bg-black-400 text-white-100 transition-opacity disabled:opacity-25"
            aria-label="Send"
          >
            <ArrowUp size={14} weight="bold" />
          </button>
        </div>
        <p className="mt-1.5 px-1 text-black-700">Replies also go to {user.email}</p>
      </form>
    </section>
  );
}
