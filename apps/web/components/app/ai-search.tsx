'use client';
// Search with AI. The rep picks what to search (local businesses or B2B decision-makers),
// describes who they want in plain English, and the `ai-search` Edge Function turns that into
// the same filters Leads and Local businesses use. Results open in the normal search
// workspace (LeadsView / LocalView), so saving, exporting and the dialler work as usual and
// every filter the AI chose can be edited as a chip.
import { ArrowUp, Buildings, Check, ClockCounterClockwise, PencilSimple, Plus, Sparkle, X } from '@phosphor-icons/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { track } from '@/lib/analytics';
import { useApp } from '@/lib/app-context';
import { leadSearchQuery, localSearchQuery, toServer, type Filters } from '@/lib/lead-search';
import { supabase } from '@/lib/supabase/client';
import { cn, timeAgo } from '@/lib/utils';
import { LeadsView } from '@/components/app/leads-view';
import { LocalView } from '@/components/app/local-view';
import { GoogleIcon } from '@/components/ui/google-icon';

type Mode = 'leads' | 'local';
const BLUE = '#5f86e0';

const MODES: Record<Mode, { label: string; lower: string; blurb: string; noun: string; placeholder: string; examples: string[] }> = {
  local: {
    label: 'Local businesses',
    lower: 'local businesses',
    blurb: '365,000 UK listings',
    noun: '365,000 local businesses',
    placeholder: 'e.g. Electricians in Manchester with a mobile number',
    examples: [
      'Electricians in Manchester with a mobile number',
      'Builders in Nottingham with no website',
      'Accountants in London rated 4.5 or above',
      'IT support companies in Glasgow with an email address',
      'Day nurseries in Birmingham that open on Saturdays',
      'Dentists in London with an Instagram account',
    ],
  },
  leads: {
    label: 'B2B decision-makers',
    lower: 'B2B decision-makers',
    blurb: '690,000 people at UK and EU firms',
    noun: '690,000 decision-makers',
    placeholder: 'e.g. CEOs of software companies with 50–100 employees, who have a mobile',
    examples: [
      'CEOs of software companies with 50–100 employees, who have a mobile',
      'Heads of sales at UK SaaS companies that are hiring',
      'IT managers in Manchester at companies with over 200 staff',
      'Founders of recruitment agencies in London with a mobile',
      'Finance directors at manufacturing firms with $10M–$50M revenue',
      'Marketing directors in Germany or the Netherlands',
    ],
  },
};

interface AiResult {
  id: string | null;
  mode: Mode;
  suggested_mode: Mode;
  mode_reason: string;
  title: string;
  summary: string;
  notes: string[];
  leads_filters: Filters;
  local_filters: Filters;
}
interface Shown {
  key: string;
  mode: Mode;
  filters: Filters;
  title: string;
  summary: string;
  notes: string[];
  prompt: string;
}
type Stage = 0 | 1 | 2 | 3 | 4; // reading, matching, searching, preparing, done

async function askAi(workspaceId: string, mode: Mode, prompt: string, signal: AbortSignal): Promise<AiResult> {
  const { data } = await supabase().auth.getSession();
  const token = data.session?.access_token;
  const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/ai-search`, {
    method: 'POST',
    signal,
    headers: { 'content-type': 'application/json', apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, authorization: `Bearer ${token}` },
    body: JSON.stringify({ workspace_id: workspaceId, mode, prompt }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.message ?? 'The AI could not build that search. Try again.');
  return body as AiResult;
}

const recentQuery = (workspaceId: string) => ({
  queryKey: ['ai-searches', workspaceId],
  staleTime: 60_000,
  queryFn: async () => {
    const { data, error } = await supabase()
      .from('ai_searches')
      .select('id,mode,suggested_mode,prompt,title,summary,notes,leads_filters,local_filters,created_at')
      .eq('workspace_id', workspaceId)
      .eq('ok', true)
      .order('created_at', { ascending: false })
      .limit(6);
    if (error) throw error;
    return data ?? [];
  },
});

function ModeIcon({ mode, size = 16 }: { mode: Mode; size?: number }) {
  return mode === 'local' ? <GoogleIcon size={size} /> : <Buildings size={size} weight="duotone" style={{ color: BLUE }} />;
}

// ---- loading view ------------------------------------------------------------------
function Working({
  prompt,
  mode,
  stage,
  mismatch,
  onSwitch,
  onKeep,
  onCancel,
}: {
  prompt: string;
  mode: Mode;
  stage: Stage;
  mismatch: AiResult | null;
  onSwitch: () => void;
  onKeep: () => void;
  onCancel: () => void;
}) {
  const steps = ['Reading your request', 'Matching it to real filters', `Searching ${MODES[mode].noun}`, 'Preparing your list'];
  // a gentle creep while the AI works, then real jumps as each stage completes
  const [creep, setCreep] = useState(0);
  useEffect(() => {
    if (stage > 1) return;
    const t = window.setInterval(() => setCreep((c) => Math.min(c + 1.2, 38)), 180);
    return () => window.clearInterval(t);
  }, [stage]);
  useEffect(() => {
    if (stage === 1) setCreep((c) => Math.max(c, 18));
  }, [stage]);
  const pct = stage <= 1 ? 6 + creep : stage === 2 ? 72 : stage === 3 ? 92 : 100;

  return createPortal(
    <div className="fixed inset-0 z-menu flex items-center justify-center bg-white-100/75 px-4 backdrop-blur-[2px]" role="dialog" aria-modal="true" aria-label="Building your search">
      <div className="ai-pop w-full max-w-[460px] overflow-hidden rounded-md border border-white-800 bg-white-100 shadow-[0_24px_64px_rgba(18,18,18,0.12)]">
        <div className="px-6 pb-5 pt-6">
          <div className="flex items-center gap-3">
            <span className="ai-orb relative flex h-9 w-9 items-center justify-center rounded-md" style={{ background: '#f1f5fd' }}>
              <Sparkle size={18} weight="duotone" style={{ color: BLUE }} />
            </span>
            <div className="min-w-0">
              <p className="font-medium text-black-400">{mismatch ? 'One quick check' : stage >= 4 ? 'Your list is ready' : 'Building your search'}</p>
              <p className="truncate text-black-700">“{prompt}”</p>
            </div>
          </div>

          {mismatch ? (
            <div className="mt-5 rounded-md border border-white-800 bg-white-200 p-4">
              <p className="flex items-center gap-2 font-medium text-black-400">
                <ModeIcon mode={mismatch.suggested_mode} /> This sounds like a {MODES[mismatch.suggested_mode].lower} search
              </p>
              <p className="mt-1.5 text-black-700">{mismatch.mode_reason || `It looks like you want ${MODES[mismatch.suggested_mode].lower}, not ${MODES[mode].lower}.`}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button onClick={onSwitch} className="flex h-8 items-center gap-2 rounded-sm bg-black-400 px-3 font-medium text-white-100 hover:opacity-90">
                  <ModeIcon mode={mismatch.suggested_mode} size={14} /> Search {MODES[mismatch.suggested_mode].lower}
                </button>
                <button onClick={onKeep} className="flex h-8 items-center rounded-sm border border-btnborder bg-white-100 px-3 text-black-400 hover:border-white-900">
                  Keep {MODES[mode].lower}
                </button>
              </div>
            </div>
          ) : (
            <ol className="mt-5 space-y-2.5">
              {steps.map((s, i) => {
                const state = stage > i ? 'done' : stage === i ? 'active' : 'todo';
                return (
                  <li key={s} className={cn('flex items-center gap-3 transition-colors', state === 'todo' ? 'text-white-900' : 'text-black-400')}>
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                      {state === 'done' ? (
                        <span className="flex h-5 w-5 items-center justify-center rounded-full" style={{ background: BLUE }}>
                          <Check size={11} weight="bold" className="text-white-100" />
                        </span>
                      ) : state === 'active' ? (
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white-800" style={{ borderTopColor: BLUE }} />
                      ) : (
                        <span className="h-1.5 w-1.5 rounded-full bg-white-800" />
                      )}
                    </span>
                    {s}
                  </li>
                );
              })}
            </ol>
          )}
        </div>
        <div className="flex items-center gap-3 border-t border-white-800 px-6 py-3">
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-white-300">
            <div className="h-full rounded-full transition-[width] duration-500 ease-out" style={{ width: `${mismatch ? 50 : pct}%`, background: `linear-gradient(90deg, #a9c1f5, ${BLUE})` }} />
          </div>
          <button onClick={onCancel} className="text-black-700 hover:text-black-400">
            Cancel
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ---- results banner ----------------------------------------------------------------
function Banner({ shown, onEdit, onNew }: { shown: Shown; onEdit: () => void; onNew: () => void }) {
  return (
    <div className="flex shrink-0 items-start gap-3 border-b border-white-800 px-4 py-2.5" style={{ background: 'linear-gradient(90deg, #f5f8fe, #ffffff 60%)' }}>
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-[4px]" style={{ background: '#e8eefc' }}>
        <Sparkle size={13} weight="duotone" style={{ color: BLUE }} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate">
          <span className="font-medium text-black-400">{shown.title}</span>
          <span className="ml-2 text-black-700">“{shown.prompt}”</span>
        </p>
        <p className="truncate text-black-700">
          {shown.summary} The filters below are editable.
          {shown.notes.length ? <span className="ml-1 text-[#8a5d0f]">Not covered: {shown.notes.join(' ')}</span> : null}
        </p>
      </div>
      <button onClick={onEdit} className="flex h-7 shrink-0 items-center gap-1.5 rounded-sm px-2 text-black-700 hover:bg-white-300 hover:text-black-400">
        <PencilSimple size={13} /> Edit prompt
      </button>
      <button onClick={onNew} className="flex h-7 shrink-0 items-center gap-1.5 rounded-sm border border-btnborder bg-white-100 px-2 text-black-400 hover:border-white-900">
        <Plus size={13} /> New search
      </button>
    </div>
  );
}

// ---- page ----------------------------------------------------------------------------
export function AiSearch() {
  const { workspace } = useApp();
  const qc = useQueryClient();
  const [mode, setMode] = useState<Mode | null>(null);
  const [prompt, setPrompt] = useState('');
  const [error, setError] = useState('');
  const [working, setWorking] = useState<null | { prompt: string; mode: Mode }>(null);
  const [stage, setStage] = useState<Stage>(0);
  const [mismatch, setMismatch] = useState<AiResult | null>(null);
  const [shown, setShown] = useState<Shown | null>(null);
  const abort = useRef<AbortController | null>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const recent = useQuery(recentQuery(workspace.id));

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${Math.min(Math.max(el.scrollHeight, 72), 220)}px`;
  }, [prompt, mode]);

  /** Runs the search for one mode's filters, then opens the results. */
  const finish = async (r: AiResult, useMode: Mode, text: string) => {
    const filters = useMode === 'leads' ? r.leads_filters : r.local_filters;
    setMismatch(null);
    setStage(2);
    try {
      if (useMode === 'leads') await qc.fetchQuery(leadSearchQuery(workspace.id, toServer(filters, ''), 0));
      else await qc.fetchQuery(localSearchQuery(workspace.id, toServer(filters, ''), 0));
    } catch {
      /* the results view shows its own error and a retry */
    }
    setStage(3);
    await new Promise((res) => setTimeout(res, 350));
    setStage(4);
    await new Promise((res) => setTimeout(res, 300));
    setShown({ key: `${r.id ?? Date.now()}-${useMode}`, mode: useMode, filters, title: r.title, summary: r.summary, notes: r.notes, prompt: text });
    setWorking(null);
    void qc.invalidateQueries({ queryKey: ['ai-searches', workspace.id] });
  };

  const run = async (text: string, chosen: Mode) => {
    const clean = text.trim();
    if (!clean) return;
    setError('');
    setWorking({ prompt: clean, mode: chosen });
    setStage(0);
    const ctrl = new AbortController();
    abort.current = ctrl;
    const t = window.setTimeout(() => setStage((s) => (s === 0 ? 1 : s)), 900);
    try {
      const r = await askAi(workspace.id, chosen, clean, ctrl.signal);
      window.clearTimeout(t);
      setStage(2);
      track('ai_search', { mode: chosen, suggested: r.suggested_mode });
      if (r.suggested_mode !== chosen) setMismatch(r);
      else await finish(r, chosen, clean);
    } catch (e) {
      window.clearTimeout(t);
      if ((e as Error).name === 'AbortError') return;
      setWorking(null);
      setError((e as Error).message);
    }
  };

  const cancel = () => {
    abort.current?.abort();
    setWorking(null);
    setMismatch(null);
  };

  if (shown) {
    const banner = (
      <Banner
        shown={shown}
        onEdit={() => {
          setMode(shown.mode);
          setPrompt(shown.prompt);
          setShown(null);
          setTimeout(() => box.current?.focus(), 50);
        }}
        onNew={() => {
          setPrompt('');
          setShown(null);
        }}
      />
    );
    return shown.mode === 'leads' ? (
      <LeadsView key={shown.key} initialFilters={shown.filters} banner={banner} />
    ) : (
      <LocalView key={shown.key} initialFilters={shown.filters} banner={banner} />
    );
  }

  const m = mode ? MODES[mode] : null;
  return (
    <div className="h-full overflow-y-auto bg-white-100">
      <div className="mx-auto w-full max-w-[720px] px-6 pb-16 pt-[9vh]">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-md" style={{ background: '#f1f5fd' }}>
            <Sparkle size={17} weight="duotone" style={{ color: BLUE }} />
          </span>
          <h1 className="t-h2">Search with AI</h1>
        </div>
        <p className="mt-2 text-black-700">Describe who you want to call. Decibel turns it into filters on real data and builds the list for you.</p>

        {/* what to search */}
        <div className="mt-7 grid gap-2.5 sm:grid-cols-2" role="radiogroup" aria-label="What to search">
          {(['local', 'leads'] as Mode[]).map((id) => {
            const on = mode === id;
            return (
              <button
                key={id}
                role="radio"
                aria-checked={on}
                onClick={() => {
                  setMode(id);
                  setError('');
                  setTimeout(() => box.current?.focus(), 30);
                }}
                className={cn('flex items-center gap-3 rounded-md border px-4 py-3 text-left transition-colors', on ? 'bg-[#f5f8fe]' : 'border-white-800 bg-white-100 hover:border-white-900')}
                style={on ? { borderColor: BLUE } : undefined}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-white-800 bg-white-100">
                  <ModeIcon mode={id} size={17} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-black-400">{MODES[id].label}</span>
                  <span className="block truncate text-black-700">{MODES[id].blurb}</span>
                </span>
                <span className={cn('flex h-4 w-4 shrink-0 items-center justify-center rounded-full border', on ? 'border-transparent' : 'border-white-900')} style={on ? { background: BLUE } : undefined}>
                  {on ? <Check size={9} weight="bold" className="text-white-100" /> : null}
                </span>
              </button>
            );
          })}
        </div>

        {/* prompt */}
        <form
          className={cn('relative mt-3 rounded-md border bg-white-100 shadow-[0_8px_28px_rgba(18,18,18,0.06)] transition-colors', mode ? 'border-white-900' : 'border-white-800')}
          onSubmit={(e) => {
            e.preventDefault();
            if (mode) void run(prompt, mode);
          }}
        >
          <textarea
            ref={box}
            value={prompt}
            disabled={!mode}
            maxLength={1000}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                if (mode) void run(prompt, mode);
              }
            }}
            placeholder={m ? m.placeholder : 'Choose local businesses or B2B decision-makers above to start'}
            aria-label="Describe who you want to find"
            className="block w-full resize-none bg-transparent px-4 pb-12 pt-3.5 text-[15px] leading-[22px] tracking-[-0.01em] text-black-400 outline-none placeholder:text-white-900 disabled:cursor-not-allowed"
          />
          <div className="absolute inset-x-3 bottom-2.5 flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-black-700">
              {mode ? (
                <>
                  <ModeIcon mode={mode} size={13} /> {MODES[mode].label}
                </>
              ) : null}
            </span>
            <button type="submit" disabled={!mode || !prompt.trim()} aria-label="Build the list" className="flex h-8 w-8 items-center justify-center rounded-[6px] bg-black-400 text-white-100 transition-opacity disabled:opacity-20">
              <ArrowUp size={15} weight="bold" />
            </button>
          </div>
        </form>
        {error ? (
          <p className="mt-3 flex items-start gap-2 rounded-md border border-white-800 bg-white-200 px-3 py-2.5 text-black-700">
            <X size={14} className="mt-0.5 shrink-0" /> {error}
          </p>
        ) : null}

        {/* examples */}
        {m ? (
          <div className="mt-8">
            <p className="text-black-700">Try one of these</p>
            <div className="mt-2.5 grid gap-2.5 sm:grid-cols-2">
              {m.examples.map((ex) => (
                <button
                  key={ex}
                  onClick={() => {
                    setPrompt(ex);
                    box.current?.focus();
                  }}
                  className="group flex items-start gap-2.5 rounded-md border border-white-800 bg-white-100 px-3.5 py-3 text-left transition-colors hover:border-white-900 hover:bg-white-200"
                >
                  <Sparkle size={14} weight="duotone" className="mt-[3px] shrink-0 opacity-60 transition-opacity group-hover:opacity-100" style={{ color: BLUE }} />
                  <span className="text-black-400">{ex}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <p className="mt-8 text-center text-white-900">Pick what to search and you will see example prompts here.</p>
        )}

        {/* recent */}
        {recent.data?.length ? (
          <div className="mt-10">
            <p className="flex items-center gap-1.5 text-black-700">
              <ClockCounterClockwise size={14} /> Recent searches
            </p>
            <ul className="mt-2 divide-y divide-white-800 rounded-md border border-white-800">
              {recent.data.map((r) => (
                <li key={r.id}>
                  <button
                    onClick={() => {
                      // reopening a past search reuses its filters; no new AI call
                      const useMode = (r.mode as Mode) ?? 'leads';
                      setShown({
                        key: `${r.id}-${useMode}`,
                        mode: useMode,
                        filters: (useMode === 'leads' ? r.leads_filters : r.local_filters) as Filters,
                        title: r.title,
                        summary: r.summary,
                        notes: r.notes ?? [],
                        prompt: r.prompt,
                      });
                    }}
                    className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left hover:bg-white-200"
                  >
                    <ModeIcon mode={r.mode as Mode} size={14} />
                    <span className="min-w-0 flex-1 truncate text-black-400">{r.prompt}</span>
                    <span className="shrink-0 text-black-700">{timeAgo(r.created_at)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      {working ? (
        <Working
          prompt={working.prompt}
          mode={working.mode}
          stage={stage}
          mismatch={mismatch}
          onSwitch={() => {
            const r = mismatch!;
            setMode(r.suggested_mode);
            setWorking({ prompt: working.prompt, mode: r.suggested_mode });
            void finish(r, r.suggested_mode, working.prompt);
          }}
          onKeep={() => void finish(mismatch!, working.mode, working.prompt)}
          onCancel={cancel}
        />
      ) : null}
    </div>
  );
}
