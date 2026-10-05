'use client';
// Team stats. Headline numbers with a like-for-like comparison, an activity chart
// over the whole period (future days marked), a dials-to-meetings funnel and a rep
// leaderboard. Every block has a fixed height so switching period never moves the page.
import { useQuery } from '@tanstack/react-query';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '@/lib/app-context';
import { dashboardQuery, thisWeek, type StatRow } from '@/lib/queries';
import { useMemberNames } from '@/lib/hooks';
import { cn, formatTalkTime } from '@/lib/utils';
import { ButtonLink } from '@/components/ui/button';
import { Avatar, EmptyState, ErrorCard, Skeleton } from '@/components/ui/display';
import { Input } from '@/components/ui/form';
import { useFirstReveal } from '@/components/ui/reveal';

type Period = 'today' | 'week' | 'month' | 'custom';
const PERIODS: [Period, string][] = [
  ['today', 'Today'],
  ['week', 'This week'],
  ['month', 'This month'],
  ['custom', 'Custom'],
];

// ---------------------------------------------------------------- dates (London, yyyy-mm-dd) --
const london = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(d);
const toDate = (s: string) => new Date(`${s}T12:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (s: string, n: number) => {
  const d = toDate(s);
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
};
const daysBetween = (a: string, b: string) => Math.round((toDate(b).getTime() - toDate(a).getTime()) / 86400000);
const lastOfMonth = (s: string) => iso(new Date(Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)), 0, 12)));
const fmtDay = (s: string) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(toDate(s));
const fmtWeekday = (s: string) => new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: 'UTC' }).format(toDate(s));

interface Ranges {
  /** what the numbers cover (never past today) */
  start: string;
  end: string;
  /** the same span one period earlier */
  prevStart: string;
  prevEnd: string;
  prevLabel: string;
  /** the days the chart draws; days after today are drawn as empty slots */
  chartStart: string;
  chartEnd: string;
}

function ranges(period: Period, from: string, to: string): Ranges {
  const today = london(new Date());
  if (period === 'today') {
    return { start: today, end: today, prevStart: addDays(today, -1), prevEnd: addDays(today, -1), prevLabel: 'yesterday', chartStart: addDays(today, -6), chartEnd: today };
  }
  if (period === 'week') {
    const { start } = thisWeek();
    return { start, end: today, prevStart: addDays(start, -7), prevEnd: addDays(today, -7), prevLabel: 'the same days last week', chartStart: start, chartEnd: addDays(start, 6) };
  }
  if (period === 'month') {
    const start = `${today.slice(0, 8)}01`;
    const prevStart = iso(new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 2, 1, 12)));
    const prevLast = lastOfMonth(prevStart);
    const sameDay = `${prevStart.slice(0, 8)}${today.slice(8)}`;
    return { start, end: today, prevStart, prevEnd: sameDay > prevLast ? prevLast : sameDay, prevLabel: 'the same days last month', chartStart: start, chartEnd: lastOfMonth(today) };
  }
  let start = from || today;
  let end = to || today;
  if (start > end) [start, end] = [end, start];
  if (end > today) end = today;
  if (daysBetween(start, end) > 91) start = addDays(end, -91);
  const span = daysBetween(start, end) + 1;
  return { start, end, prevStart: addDays(start, -span), prevEnd: addDays(start, -1), prevLabel: `the previous ${span === 1 ? 'day' : `${span} days`}`, chartStart: start, chartEnd: end };
}

function sum(rows: StatRow[]) {
  return rows.reduce((a, r) => ({ dials: a.dials + r.dials, connects: a.connects + r.connects, meetings: a.meetings + r.meetings, talk: a.talk + (r.talk_seconds ?? 0) }), { dials: 0, connects: 0, meetings: 0, talk: 0 });
}
const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);
const num = (n: number) => n.toLocaleString('en-GB');

/** Rounds up to 1, 2 or 5 × 10^k so gridlines land on readable numbers. */
function niceMax(v: number) {
  if (v <= 4) return 4;
  const p = 10 ** Math.floor(Math.log10(v));
  return ([1, 2, 5, 10].find((m) => m * p >= v) ?? 10) * p;
}

// ------------------------------------------------------------------------------------- page --
export default function DashboardPage() {
  const firstReveal = useFirstReveal('dashboard:kpis');
  const { workspace } = useApp();
  const names = useMemberNames();
  const [period, setPeriod] = useState<Period>('week');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const r = ranges(period, from, to);
  const today = london(new Date());

  const cur = useQuery(dashboardQuery(workspace.id, r.start, r.end));
  const prev = useQuery(dashboardQuery(workspace.id, r.prevStart, r.prevEnd));
  const chartEndQuery = r.chartEnd > today ? today : r.chartEnd;
  const chart = useQuery(dashboardQuery(workspace.id, r.chartStart, chartEndQuery));

  const totals = useMemo(() => sum(cur.data?.rows ?? []), [cur.data]);
  const before = useMemo(() => sum(prev.data?.rows ?? []), [prev.data]);
  const credits = cur.data?.credits ?? 0;

  const days = useMemo(() => {
    const rows = chart.data?.rows ?? [];
    const out: { day: string; dials: number; connects: number; meetings: number; future: boolean }[] = [];
    for (let d = r.chartStart; d <= r.chartEnd && out.length < 92; d = addDays(d, 1)) {
      const t = sum(rows.filter((x) => x.day === d));
      out.push({ day: d, ...t, future: d > today });
    }
    return out;
  }, [chart.data, r.chartStart, r.chartEnd, today]);

  const reps = useMemo(() => {
    const byRep = new Map<string, StatRow[]>();
    (cur.data?.rows ?? []).forEach((x) => {
      const k = x.user_id ?? 'unknown';
      byRep.set(k, [...(byRep.get(k) ?? []), x]);
    });
    return [...byRep.entries()].map(([id, rows]) => [id, sum(rows)] as const).sort((a, b) => b[1].dials - a[1].dials || b[1].meetings - a[1].meetings);
  }, [cur.data]);

  const loading = cur.isLoading;
  const compareReady = !prev.isLoading;
  const empty = !loading && totals.dials === 0 && credits === 0 && !reps.length;

  return (
    <div className="dash-13 mx-auto flex max-w-[1200px] flex-col gap-4 p-4 md:p-6">
      <h1 className="sr-only">Team stats</h1>

      {/* toolbar: fixed height, the custom range slots in without moving anything below */}
      <div className="flex h-9 items-center gap-3">
        <Segmented value={period} onChange={setPeriod} />
        <div className={cn('flex items-center gap-2 transition-opacity duration-150', period === 'custom' ? 'opacity-100' : 'pointer-events-none opacity-0')} aria-hidden={period !== 'custom'}>
          <Input type="date" value={from} max={today} onChange={(e) => setFrom(e.target.value)} className="h-8 w-[150px]" aria-label="From date" tabIndex={period === 'custom' ? 0 : -1} />
          <span className="text-black-700">to</span>
          <Input type="date" value={to} max={today} onChange={(e) => setTo(e.target.value)} className="h-8 w-[150px]" aria-label="To date" tabIndex={period === 'custom' ? 0 : -1} />
        </div>
        <p className="t-caption ml-auto truncate text-black-700 max-md:hidden">
          {r.start === r.end ? fmtDay(r.start) : `${fmtDay(r.start)} to ${fmtDay(r.end)}`} · vs {r.prevLabel}
        </p>
      </div>

      {cur.error ? <ErrorCard message={(cur.error as Error).message} onRetry={() => cur.refetch()} /> : null}

      {/* headline numbers */}
      <section aria-label="Headline numbers" className={cn(firstReveal && 'stagger', 'grid grid-cols-2 stat-grid lg:grid-cols-4')}>
        <Kpi label="Dials" value={num(totals.dials)} loading={loading} delta={compareReady ? change(totals.dials, before.dials) : null} />
        <Kpi label="Connects" value={num(totals.connects)} loading={loading} delta={compareReady ? change(totals.connects, before.connects) : null} />
        <Kpi label="Connect rate" value={`${pct(totals.connects, totals.dials)}%`} loading={loading} delta={compareReady ? points(pct(totals.connects, totals.dials), pct(before.connects, before.dials), before.dials > 0) : null} />
        <Kpi label="Meetings booked" value={num(totals.meetings)} loading={loading} delta={compareReady ? change(totals.meetings, before.meetings) : null} />
      </section>

      {/* secondary numbers: a quiet strip */}
      <section aria-label="More numbers" className="card grid h-12 grid-cols-3 items-center divide-x divide-white-800 px-0">
        <Secondary label="Talk time" value={formatTalkTime(totals.talk)} loading={loading} />
        <Secondary label="Avg call when connected" value={totals.connects ? formatTalkTime(totals.talk / totals.connects) : '–'} loading={loading} />
        <Secondary label="Credits used" value={num(credits)} loading={loading} />
      </section>

      {empty ? (
        <div className="card">
          <EmptyState title="Data appears after your first call" description="Dials, connects, talk time and meetings fill in as your team calls." action={<ButtonLink variant="primary" href="/app">Go to Today</ButtonLink>} />
        </div>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <ActivityChart days={days} loading={chart.isLoading} today={today} subtitle={period === 'today' ? 'Last 7 days' : period === 'week' ? 'This week' : period === 'month' ? 'This month' : 'Selected days'} />
            <Funnel dials={totals.dials} connects={totals.connects} meetings={totals.meetings} loading={loading} />
          </div>
          <Leaderboard reps={reps} names={names} loading={loading} />
        </>
      )}
    </div>
  );
}

// ------------------------------------------------------------------------ period switcher --
/** Segmented control with a sliding highlight (a transition, so it retargets if clicked mid-move). */
function Segmented({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const group = useRef<HTMLDivElement>(null);
  const [thumb, setThumb] = useState<{ x: number; w: number } | null>(null);
  useLayoutEffect(() => {
    const measure = () => {
      const el = refs.current[value];
      if (el) setThumb({ x: el.offsetLeft, w: el.offsetWidth });
    };
    measure();
    // re-measure if the labels change width (web font arriving, zoom)
    const ro = new ResizeObserver(measure);
    if (group.current) ro.observe(group.current);
    return () => ro.disconnect();
  }, [value]);
  return (
    <div ref={group} className="relative flex h-8 shrink-0 items-center rounded-sm border border-white-800 bg-white-100 p-0.5" role="radiogroup" aria-label="Period">
      {thumb ? (
        <span
          aria-hidden
          className="absolute bottom-0.5 left-0 top-0.5 rounded-[4px] bg-white-300 transition-[transform,width] duration-200 ease-[cubic-bezier(0.2,0,0,1)]"
          style={{ transform: `translateX(${thumb.x}px)`, width: thumb.w }}
        />
      ) : null}
      {PERIODS.map(([id, text]) => (
        <button
          key={id}
          ref={(el) => {
            refs.current[id] = el;
          }}
          role="radio"
          aria-checked={value === id}
          onClick={() => onChange(id)}
          className={cn(
            'relative z-10 h-full rounded-[4px] px-2.5 transition-[color,scale] duration-150 ease-out active:scale-[0.96]',
            value === id ? 'text-black-400' : 'text-black-700 hover:text-black-400',
            !thumb && value === id && 'bg-white-300',
          )}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------------------- numbers --
type Delta = { text: string; dir: 'up' | 'down' | 'flat' } | null;

function change(now: number, then: number): Delta {
  if (now === then) return { text: 'No change', dir: 'flat' };
  if (then === 0) return { text: 'New', dir: 'up' };
  const p = Math.round(((now - then) / then) * 100);
  if (p === 0) return { text: 'No change', dir: 'flat' };
  return { text: `${Math.abs(p)}%`, dir: p > 0 ? 'up' : 'down' };
}
function points(now: number, then: number, hadData: boolean): Delta {
  if (!hadData) return { text: 'New', dir: now > 0 ? 'up' : 'flat' };
  const d = now - then;
  if (d === 0) return { text: 'No change', dir: 'flat' };
  return { text: `${Math.abs(d)} ${Math.abs(d) === 1 ? 'pt' : 'pts'}`, dir: d > 0 ? 'up' : 'down' };
}

function DeltaTag({ delta }: { delta: Delta }) {
  // the slot is always reserved, so the tag arriving never moves the number
  if (!delta) return <span className="h-5" />;
  const Icon = delta.dir === 'up' ? ArrowUpRight : delta.dir === 'down' ? ArrowDownRight : Minus;
  return (
    <span className={cn('tag t-fade gap-0.5', delta.dir === 'up' ? 'tag-0' : delta.dir === 'down' ? 'tag-3' : 'tag-7')}>
      <Icon size={12} strokeWidth={1.5} aria-hidden />
      <span className="tabular">{delta.text}</span>
      <span className="sr-only">{delta.dir === 'up' ? 'up' : delta.dir === 'down' ? 'down' : ''} on the previous period</span>
    </span>
  );
}

function Kpi({ label, value, loading, delta }: { label: string; value: string; loading: boolean; delta: Delta }) {
  return (
    <div className="bg-white-100 p-5">
      <div className="flex h-5 items-center justify-between gap-2">
        <p className="t-label">{label}</p>
        {loading ? null : <DeltaTag delta={delta} />}
      </div>
      {loading ? <Skeleton className="mt-2 h-[18px] w-16" /> : <p className="tabular mt-2 font-medium text-black-400">{value}</p>}
    </div>
  );
}

function Secondary({ label, value, loading }: { label: string; value: string; loading: boolean }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 px-4 max-sm:flex-col max-sm:items-start max-sm:justify-center max-sm:gap-0">
      <span className="t-caption truncate text-black-700">{label}</span>
      {loading ? <Skeleton className="h-3 w-12" /> : <span className="tabular truncate font-medium text-black-400">{value}</span>}
    </div>
  );
}

// ----------------------------------------------------------------------------- activity --
function ActivityChart({ days, loading, today, subtitle }: { days: { day: string; dials: number; connects: number; meetings: number; future: boolean }[]; loading: boolean; today: string; subtitle: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const top = niceMax(Math.max(0, ...days.map((d) => d.dials)));
  const n = days.length;
  const showEvery = n <= 14 ? 1 : n <= 31 ? 5 : 10;
  const h = hover != null ? days[hover] : null;
  const total = days.reduce((s, d) => s + d.dials, 0);

  return (
    <section className="card flex h-[320px] flex-col p-4" aria-label="Activity">
      <div className="flex h-5 items-center gap-4">
        <h2 className="t-label">Activity</h2>
        <span className="t-caption text-black-700">{subtitle}</span>
        <span className="t-caption ml-auto flex items-center gap-3 text-black-700">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-[2px] bg-accent-500 opacity-25" /> Dials
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-[2px] bg-accent-500" /> Connects
          </span>
        </span>
      </div>

      {loading ? (
        <Skeleton className="mt-4 flex-1" />
      ) : (
        <div className="mt-4 flex min-h-0 flex-1 gap-3">
          {/* y axis */}
          <div className="t-caption tabular flex w-7 shrink-0 flex-col justify-between pb-6 text-right text-black-700" aria-hidden>
            <span className="-translate-y-1/2">{num(top)}</span>
            <span>{num(top / 2)}</span>
            <span className="translate-y-1/2">0</span>
          </div>

          <div className="relative flex min-w-0 flex-1 flex-col">
            {/* plot */}
            <div
              className="relative flex-1"
              role="img"
              aria-label={`Dials and connects per day, ${fmtDay(days[0]?.day ?? today)} to ${fmtDay(days[n - 1]?.day ?? today)}. ${num(total)} dials in total.`}
              onMouseLeave={() => setHover(null)}
            >
              {[0, 50, 100].map((y) => (
                <div key={y} className="absolute inset-x-0 border-t border-white-800" style={{ top: `${y}%`, borderStyle: y === 100 ? 'solid' : 'dashed' }} />
              ))}
              <div className="absolute inset-0 flex items-end gap-[3px]">
                {days.map((d, i) => (
                  <div
                    key={d.day}
                    className="relative flex h-full min-w-0 flex-1 items-end justify-center"
                    onMouseEnter={() => setHover(i)}
                  >
                    {/* hover column */}
                    <div className={cn('absolute inset-0 rounded-[3px] bg-white-300 transition-opacity duration-150', hover === i ? 'opacity-100' : 'opacity-0')} />
                    {d.future ? (
                      <div className="relative mx-auto h-[2px] w-full max-w-[56px] rounded-full bg-white-800" />
                    ) : (
                      <div className="relative mx-auto w-full max-w-[56px] transition-[height] duration-300 ease-[cubic-bezier(0.2,0,0,1)]" style={{ height: `${(d.dials / top) * 100}%`, minHeight: d.dials ? 2 : 0 }}>
                        <div className="absolute inset-0 rounded-t-[3px] bg-accent-500 opacity-25" />
                        <div className="absolute inset-x-0 bottom-0 rounded-t-[3px] bg-accent-500 transition-[height] duration-300 ease-[cubic-bezier(0.2,0,0,1)]" style={{ height: d.dials ? `${(d.connects / d.dials) * 100}%` : 0 }} />
                      </div>
                    )}
                    {d.day === today ? <span className="absolute -bottom-[3px] left-1/2 h-[3px] w-[3px] -translate-x-1/2 rounded-full bg-black-400" aria-hidden /> : null}
                  </div>
                ))}
              </div>

              {/* tooltip */}
              <div
                className={cn('pointer-events-none absolute top-0 z-10 w-[148px] rounded-sm border border-white-800 bg-white-100 p-2.5 shadow-[0_4px_12px_rgba(8,9,10,0.08)] transition-opacity duration-150', h ? 'opacity-100' : 'opacity-0')}
                style={hover != null ? { left: `clamp(0px, calc(${((hover + 0.5) / n) * 100}% - 74px), calc(100% - 148px))` } : undefined}
                aria-hidden
              >
                {h ? (
                  <>
                    <p className="t-caption text-black-700">
                      {fmtWeekday(h.day)} {fmtDay(h.day)}
                    </p>
                    {h.future ? (
                      <p className="mt-1 text-sm text-black-700">Still to come</p>
                    ) : (
                      <dl className="tabular mt-1.5 grid grid-cols-[1fr_auto] gap-y-0.5 text-sm">
                        <dt className="text-black-700">Dials</dt>
                        <dd className="text-right text-black-400">{num(h.dials)}</dd>
                        <dt className="text-black-700">Connects</dt>
                        <dd className="text-right text-black-400">{num(h.connects)}</dd>
                        <dt className="text-black-700">Meetings</dt>
                        <dd className="text-right text-black-400">{num(h.meetings)}</dd>
                      </dl>
                    )}
                  </>
                ) : null}
              </div>
            </div>

            {/* x axis: labels centred under their bar, never clipped */}
            <div className="t-caption tabular relative h-6 text-black-700" aria-hidden>
              {days.map((d, i) =>
                n <= 7 || i % showEvery === 0 || i === n - 1 ? (
                  <span
                    key={d.day}
                    className={cn('absolute bottom-0 -translate-x-1/2 whitespace-nowrap', d.day === today && 'text-black-400')}
                    style={{ left: `${((i + 0.5) / n) * 100}%` }}
                  >
                    {n <= 7 ? fmtWeekday(d.day) : i === 0 || i === n - 1 ? fmtDay(d.day) : fmtDay(d.day).split(' ')[0]}
                  </span>
                ) : null,
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

// ------------------------------------------------------------------------------- funnel --
function Funnel({ dials, connects, meetings, loading }: { dials: number; connects: number; meetings: number; loading: boolean }) {
  const steps = [
    { label: 'Dials', value: dials, rate: null as string | null },
    { label: 'Connects', value: connects, rate: dials ? `${pct(connects, dials)}% of dials` : null },
    { label: 'Meetings booked', value: meetings, rate: connects ? `${pct(meetings, connects)}% of connects` : null },
  ];
  const per100 = dials ? ((meetings / dials) * 100).toFixed(1) : '0.0';
  return (
    <section className="card flex h-[320px] flex-col p-4" aria-label="Funnel">
      <h2 className="t-label flex h-5 items-center">Funnel</h2>
      <ol className="mt-4 flex flex-1 flex-col justify-between">
        {steps.map((s, i) => (
          <li key={s.label}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm text-black-500">{s.label}</span>
              {loading ? <Skeleton className="h-3 w-10" /> : <span className="tabular font-medium text-black-400">{num(s.value)}</span>}
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-white-300">
              <div
                className={cn('h-full rounded-full transition-[width] duration-300 ease-[cubic-bezier(0.2,0,0,1)]', i === 2 ? 'bg-success-500' : 'bg-accent-500', i === 0 && 'opacity-25')}
                style={{ width: loading ? '0%' : `${dials ? Math.max(s.value ? 2 : 0, (s.value / dials) * 100) : 0}%` }}
              />
            </div>
            <p className="t-caption mt-1.5 h-4 text-black-700">{loading ? '' : (s.rate ?? (dials ? 'Every call placed' : 'No calls yet'))}</p>
          </li>
        ))}
      </ol>
      <p className="t-caption mt-3 border-t border-white-800 pt-3 text-black-700">
        <span className="tabular font-medium text-black-400">{loading ? '–' : per100}</span> meetings per 100 dials
      </p>
    </section>
  );
}

// -------------------------------------------------------------------------- leaderboard --
function Leaderboard({ reps, names, loading }: { reps: (readonly [string, { dials: number; connects: number; meetings: number; talk: number }])[]; names: Record<string, string>; loading: boolean }) {
  const top = Math.max(1, ...reps.map(([, r]) => r.dials));
  return (
    <section className="card overflow-hidden" aria-label="Leaderboard">
      <div className="flex h-12 items-center border-b border-white-800 px-4">
        <h2 className="t-label">Leaderboard</h2>
        <span className="t-caption ml-auto text-black-700">Ranked by dials</span>
      </div>
      <div className="tbl-wrap">
        <table className="tbl tbl-fixed">
          <colgroup>
            <col style={{ width: 56 }} />
            <col style={{ width: 240 }} />
            <col style={{ width: 240 }} />
            <col style={{ width: 120 }} />
            <col style={{ width: 130 }} />
            <col style={{ width: 120 }} />
            <col style={{ width: 150 }} />
          </colgroup>
          <thead>
            <tr>
              <th>Rank</th>
              <th>Rep</th>
              <th>Dials</th>
              <th className="text-right">Connects</th>
              <th className="text-right">Connect rate</th>
              <th className="text-right">Meetings</th>
              <th className="text-right">Avg call</th>
            </tr>
          </thead>
          <tbody>
            {loading
              ? [0, 1, 2].map((i) => (
                  <tr key={i}>
                    {[0, 1, 2, 3, 4, 5, 6].map((c) => (
                      <td key={c}>
                        <Skeleton className={c === 1 ? 'h-3 w-32' : c === 2 ? 'h-2 w-40' : c === 0 ? 'h-3 w-4' : 'ml-auto h-3 w-8'} />
                      </td>
                    ))}
                  </tr>
                ))
              : reps.map(([id, r], i) => (
                  <tr key={id}>
                    <td className="tabular text-black-700">{i + 1}</td>
                    <td>
                      <span className="flex min-w-0 items-center gap-2">
                        <Avatar name={names[id]} size={24} />
                        <span className="truncate">{names[id] ?? 'Former member'}</span>
                      </span>
                    </td>
                    <td>
                      <span className="flex items-center gap-3">
                        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white-300">
                          <span className="block h-full rounded-full bg-accent-500 transition-[width] duration-300 ease-[cubic-bezier(0.2,0,0,1)]" style={{ width: `${(r.dials / top) * 100}%` }} />
                        </span>
                        <span className="tabular w-10 text-right">{num(r.dials)}</span>
                      </span>
                    </td>
                    <td className="tabular text-right">{num(r.connects)}</td>
                    <td className="tabular text-right">{pct(r.connects, r.dials)}%</td>
                    <td className="tabular text-right">{r.meetings ? <span className="tag tag-0">{num(r.meetings)}</span> : <span className="text-black-700">0</span>}</td>
                    <td className="tabular text-right">{r.connects ? formatTalkTime(r.talk / r.connects) : '–'}</td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
