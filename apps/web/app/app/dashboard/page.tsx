'use client';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useApp } from '@/lib/app-context';
import { dashboardQuery, thisWeek, type StatRow } from '@/lib/queries';
import { useMemberNames } from '@/lib/hooks';
import { supabase } from '@/lib/supabase/client';
import { cn, formatTalkTime } from '@/lib/utils';
import { ButtonLink } from '@/components/ui/button';
import { Avatar, EmptyState, ErrorCard, Skeleton, StatTile } from '@/components/ui/display';
import { Input } from '@/components/ui/form';

type Period = 'today' | 'week' | 'month' | 'custom';

const london = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(d);

function range(period: Period, from: string, to: string): { start: string; end: string } {
  const now = new Date();
  const end = london(now);
  if (period === 'today') return { start: end, end };
  if (period === 'week') return thisWeek();
  if (period === 'month') return { start: `${end.slice(0, 8)}01`, end };
  return { start: from || end, end: to || end };
}

function daysBetween(start: string, end: string): string[] {
  const out: string[] = [];
  const d = new Date(`${start}T12:00:00Z`);
  const last = new Date(`${end}T12:00:00Z`);
  while (d <= last && out.length < 92) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

export default function DashboardPage() {
  const { workspace } = useApp();
  const names = useMemberNames();
  const [period, setPeriod] = useState<Period>('week');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const { start, end } = range(period, from, to);

  const stats = useQuery(dashboardQuery(workspace.id, start, end));

  const { totals, perDay, perRep } = useMemo(() => {
    const rows = stats.data?.rows ?? [];
    const totals = rows.reduce((a, r) => ({ dials: a.dials + r.dials, connects: a.connects + r.connects, meetings: a.meetings + r.meetings, talk: a.talk + (r.talk_seconds ?? 0) }), { dials: 0, connects: 0, meetings: 0, talk: 0 });
    const perDay = daysBetween(start, end).map((day) => ({ day, dials: rows.filter((r) => r.day === day).reduce((s, r) => s + r.dials, 0) }));
    const reps = new Map<string, { dials: number; connects: number; meetings: number; talk: number }>();
    rows.forEach((r) => {
      const k = r.user_id ?? 'unknown';
      const cur = reps.get(k) ?? { dials: 0, connects: 0, meetings: 0, talk: 0 };
      reps.set(k, { dials: cur.dials + r.dials, connects: cur.connects + r.connects, meetings: cur.meetings + r.meetings, talk: cur.talk + (r.talk_seconds ?? 0) });
    });
    return { totals, perDay, perRep: [...reps.entries()].sort((a, b) => b[1].dials - a[1].dials) };
  }, [stats.data, start, end]);

  const max = Math.max(1, ...perDay.map((d) => d.dials));
  const rate = totals.dials ? Math.round((totals.connects / totals.dials) * 100) : 0;
  const empty = !stats.isLoading && totals.dials === 0 && (stats.data?.credits ?? 0) === 0;
  const label = (day: string) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(new Date(`${day}T12:00:00Z`));

  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <div className="mr-auto"><h1 className="t-h2">Team stats</h1></div>
        <div className="flex rounded-sm border border-white-800 bg-white-100 p-0.5" role="radiogroup" aria-label="Period">
          {(
            [
              ['today', 'Today'],
              ['week', 'This week'],
              ['month', 'This month'],
              ['custom', 'Custom'],
            ] as [Period, string][]
          ).map(([id, text]) => (
            <button key={id} role="radio" aria-checked={period === id} onClick={() => setPeriod(id)} className={cn('h-7 px-2.5', period === id ? 'bg-black-0 text-white-100' : 'text-black-700 hover:bg-white-300')}>
              {text}
            </button>
          ))}
        </div>
        {period === 'custom' ? (
          <div className="flex items-center gap-2">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-8 w-40" aria-label="From date" />
            <span className="text-black-700">to</span>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-8 w-40" aria-label="To date" />
          </div>
        ) : null}
      </div>

      {stats.error ? <ErrorCard message={(stats.error as Error).message} onRetry={() => stats.refetch()} /> : null}

      <div className="stagger grid grid-cols-2 gap-px border border-white-800 bg-white-800 md:grid-cols-3 xl:grid-cols-6">
        <StatTile label="Dials" value={totals.dials.toLocaleString('en-GB')} loading={stats.isLoading} />
        <StatTile label="Connects" value={totals.connects.toLocaleString('en-GB')} loading={stats.isLoading} />
        <StatTile label="Connect rate" value={`${rate}%`} loading={stats.isLoading} />
        <StatTile label="Talk time" value={formatTalkTime(totals.talk)} loading={stats.isLoading} />
        <StatTile label="Meetings booked" value={totals.meetings.toLocaleString('en-GB')} loading={stats.isLoading} />
        <StatTile label="Credits used" value={(stats.data?.credits ?? 0).toLocaleString('en-GB')} loading={stats.isLoading} />
      </div>

      {empty ? (
        <div className="card">
          <EmptyState title="Data appears after your first call" description="Dials, connects, talk time and meetings fill in as your team calls." action={<ButtonLink variant="primary" href="/app">Go to Today</ButtonLink>} />
        </div>
      ) : (
        <>
          <section className="card p-4" aria-label="Dials per day">
            <h2 className="t-label">Dials per day</h2>
            {stats.isLoading ? (
              <Skeleton className="mt-4 h-48 w-full" />
            ) : (
              <>
                <div className="mt-4 flex h-48 items-end gap-1" role="img" aria-label={`Bar chart of dials per day from ${label(start)} to ${label(end)}. Total ${totals.dials}.`}>
                  {perDay.map((d) => (
                    <div key={d.day} className="group relative flex h-full min-w-0 flex-1 flex-col justify-end" title={`${label(d.day)}: ${d.dials} dials`}>
                      {perDay.length <= 14 || d.dials === max ? <span className="t-caption tabular mb-1 text-center text-black-700">{d.dials || ''}</span> : null}
                      <div className="bg-black-0 transition-colors group-hover:bg-accent-500" style={{ height: `${(d.dials / max) * 100}%`, minHeight: d.dials ? 2 : 0 }} />
                    </div>
                  ))}
                </div>
                <div className="t-caption flex justify-between border-t border-white-800 pt-2 text-black-700">
                  <span>{label(start)}</span>
                  {perDay.length > 2 ? <span>{label(perDay[Math.floor(perDay.length / 2)].day)}</span> : null}
                  <span>{label(end)}</span>
                </div>
              </>
            )}
          </section>

          <section className="card overflow-hidden" aria-label="Per rep">
            <h2 className="t-label px-4 py-3">By rep</h2>
            <div className="overflow-x-auto border-t border-white-800">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Rep</th>
                    <th className="text-right">Dials</th>
                    <th className="text-right">Connects</th>
                    <th className="text-right">Connect rate</th>
                    <th className="text-right">Meetings</th>
                    <th className="text-right">Avg talk time</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.isLoading
                    ? [0, 1, 2].map((i) => (
                        <tr key={i}>
                          {[0, 1, 2, 3, 4, 5].map((c) => (
                            <td key={c}>
                              <Skeleton className={c === 0 ? 'h-3 w-32' : 'ml-auto h-3 w-8'} />
                            </td>
                          ))}
                        </tr>
                      ))
                    : null}
                  {perRep.map(([id, r]) => (
                    <tr key={id}>
                      <td>
                        <span className="flex items-center gap-2">
                          <Avatar name={names[id]} size={24} /> {names[id] ?? 'Former member'}
                        </span>
                      </td>
                      <td className="tabular text-right">{r.dials}</td>
                      <td className="tabular text-right">{r.connects}</td>
                      <td className="tabular text-right">{r.dials ? Math.round((r.connects / r.dials) * 100) : 0}%</td>
                      <td className="tabular text-right">{r.meetings}</td>
                      <td className="tabular text-right">{r.connects ? formatTalkTime(r.talk / r.connects) : '–'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
