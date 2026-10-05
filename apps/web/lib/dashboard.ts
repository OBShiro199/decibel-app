// Team stats date ranges (London, yyyy-mm-dd), shared by the dashboard page and the prefetcher
// so a preloaded period uses exactly the keys the page will ask for.
export type Period = 'today' | 'week' | 'month' | 'custom';

/** Monday of this week to today, in London. */
export function thisWeek(): { start: string; end: string } {
  const fmt = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(d);
  const now = new Date();
  const d = new Date(now);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return { start: fmt(d), end: fmt(now) };
}

export const london = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(d);
export const toDate = (s: string) => new Date(`${s}T12:00:00Z`);
export const iso = (d: Date) => d.toISOString().slice(0, 10);
export const addDays = (s: string, n: number) => {
  const d = toDate(s);
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
};
export const daysBetween = (a: string, b: string) => Math.round((toDate(b).getTime() - toDate(a).getTime()) / 86400000);
export const lastOfMonth = (s: string) => iso(new Date(Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)), 0, 12)));
export const fmtDay = (s: string) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(toDate(s));
export const fmtWeekday = (s: string) => new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: 'UTC' }).format(toDate(s));

export interface Ranges {
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

export function ranges(period: Period, from: string, to: string): Ranges {
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

/** The three ranges the dashboard queries for a period: current, comparison and chart. */
export function dashboardRanges(period: Period, from = '', to = ''): { start: string; end: string }[] {
  const r = ranges(period, from, to);
  const today = london(new Date());
  return [
    { start: r.start, end: r.end },
    { start: r.prevStart, end: r.prevEnd },
    { start: r.chartStart, end: r.chartEnd > today ? today : r.chartEnd },
  ];
}
