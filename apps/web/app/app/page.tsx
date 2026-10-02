'use client';
import { useQuery } from '@tanstack/react-query';
import { Phone } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect } from 'react';
import { useApp } from '@/lib/app-context';
import { todayQueueQuery, todayStatsQuery } from '@/lib/queries';
import { useNumbers, useTableKeys } from '@/lib/hooks';
import { supabase } from '@/lib/supabase/client';
import type { Person } from '@/lib/types';
import { firstName, formatPhone, formatTalkTime, greeting } from '@/lib/utils';
import { blockedLabel, isBlocked, OutcomeBadge, PersonCell, setRecordNav } from '@/components/app/records';
import { useSoftphoneActions, useSoftphoneStatus } from '@/components/softphone/provider';
import { Button, ButtonLink } from '@/components/ui/button';
import { RevealOnce } from '@/components/ui/reveal';
import { TodaySkeleton } from '@/components/app/skeletons';
import { Badge, EmptyState, ErrorCard, Skeleton, StatTile, TableSkeleton } from '@/components/ui/display';
import { useToast } from '@/components/ui/overlay';

export default function TodayPage() {
  return (
    <Suspense fallback={<TodaySkeleton />}>
      <Today />
    </Suspense>
  );
}

function Today() {
  const { workspace, user, profile } = useApp();
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const softphone = useSoftphoneActions();
  const phone = useSoftphoneStatus();
  const { data: numbers } = useNumbers();
  // first arrival from onboarding: an overlay toast, so nothing on the page moves
  useEffect(() => {
    if (params.get('welcome') !== '1') return;
    toast('Start calling. Your first 50 credits are free.');
    router.replace('/app');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const queue = useQuery(todayQueueQuery(workspace.id, user.id));

  const stats = useQuery(todayStatsQuery(workspace.id, user.id));

  // Suggested leads from the saved ICP search, minus anyone already revealed.

  const rows = queue.data ?? [];
  const call = (p: Person) => void softphone.callPerson(p);
  const open = (p: Person) => {
    setRecordNav(rows.map((r) => r.id));
    router.push(`/app/people/${p.id}`);
  };
  const { index, setIndex } = useTableKeys(rows, { onCall: call, onOpen: open, onSkip: () => {}, enabled: phone.phase === 'idle' });



  const active = numbers?.find((n) => n.status === 'active');
  const pending = numbers?.find((n) => n.status === 'pending_review' || n.status === 'pending_bundle');

  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-4 p-4 md:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="t-h2">
            {greeting()}, {firstName(profile.full_name || profile.email.split('@')[0])}
          </h1>
          <p className="mt-1 text-black-700">
            {queue.isLoading ? 'Loading your queue.' : rows.length ? `${rows.length} ${rows.length === 1 ? 'person' : 'people'} in your queue.` : 'Your queue for today.'}{' '}
            <Link href="/app/dashboard" className="link">
              Team stats
            </Link>
          </p>
        </div>
        {/* caller ID status sits in a fixed-height slot so nothing below it moves when it loads */}
        <div className="flex h-9 items-center gap-2">
          {!numbers ? (
            <Skeleton className="h-6 w-44" />
          ) : active ? (
            <>
              <span className="tag tag-0 tabular-nums" title="Your caller ID">
                <Phone size={12} strokeWidth={1.7} />
                {formatPhone(active.e164)}
              </span>
              {pending ? <span className="tag tag-2">1 number in review</span> : null}
            </>
          ) : (
            <>
              <Badge tone="warning">{pending ? 'Number in review' : 'No number yet'}</Badge>
              <ButtonLink size="compact" href="/app/settings/phone-numbers">
                {pending ? 'Verify my number' : 'Get a number'}
              </ButtonLink>
            </>
          )}
        </div>
      </header>


      <div className="stagger grid grid-cols-2 stat-grid lg:grid-cols-4">
        <StatTile label="Dials today" value={stats.data?.dials ?? 0} loading={stats.isLoading} />
        <StatTile label="Connects" value={stats.data?.connects ?? 0} loading={stats.isLoading} />
        <StatTile label="Meetings booked" value={stats.data?.meetings ?? 0} loading={stats.isLoading} />
        <StatTile label="Talk time" value={formatTalkTime(stats.data?.talk ?? 0)} loading={stats.isLoading} />
      </div>

      <section className="card overflow-hidden" aria-label="Call queue">
        <div className="flex h-12 items-center justify-between border-b border-white-800 px-4">
          <h2 className="t-h4">Queue</h2>
          <ButtonLink size="compact" href="/app/lists">
            Start from a list
          </ButtonLink>
        </div>
        {queue.error ? (
          <div className="p-4">
            <ErrorCard message={(queue.error as Error).message} onRetry={() => queue.refetch()} />
          </div>
        ) : queue.isLoading ? (
          <TableSkeleton rows={6} cols={5} />
        ) : rows.length ? (
          <RevealOnce id="today:queue"><div className="tbl-wrap">
            <table className="tbl tbl-fixed"><colgroup><col style={{ width: 220 }} /><col style={{ width: 200 }} /><col style={{ width: 200 }} /><col style={{ width: 170 }} /><col style={{ width: 160 }} /><col style={{ width: 110 }} /></colgroup>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Company</th>
                  <th>Title</th>
                  <th>Mobile</th>
                  <th>Last outcome</th>
                  <th className="w-24" />
                </tr>
              </thead>
              <tbody>
                {rows.map((p, i) => (
                  <tr key={p.id} data-active={i === index} onClick={() => setIndex(i)} onDoubleClick={() => open(p)}>
                    <td className="max-w-[220px]">
                      <Link href={`/app/people/${p.id}`} onClick={() => setRecordNav(rows.map((r) => r.id))} className="hover:underline">
                        <PersonCell name={p.full_name} />
                      </Link>
                    </td>
                    <td className="max-w-[200px] truncate">{p.company?.name ?? '–'}</td>
                    <td className="max-w-[200px] truncate text-black-700">{p.job_title ?? '–'}</td>
                    <td className="tabular-nums text-xs">{formatPhone(p.mobile_e164)}</td>
                    <td>
                      <OutcomeBadge outcome={p.last_outcome} />
                    </td>
                    <td className="text-right">
                      <Button size="compact" className="row-action" disabled={isBlocked(p)} title={blockedLabel(p) ?? undefined} onClick={(e) => { e.stopPropagation(); call(p); }}>
                        <Phone size={14} strokeWidth={1.5} /> Call
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div></RevealOnce>
        ) : (
          <EmptyState
            title="Nothing to call"
            description="Add people from the database or a list and they will queue up here."
            action={
              <ButtonLink variant="primary" href="/app/leads">
                Open database
              </ButtonLink>
            }
          />
        )}
        {rows.length ? (
          <footer className="t-caption flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-white-800 px-4 py-2 text-black-700">
            <span><span className="kbd">C</span> call</span>
            <span><span className="kbd">N</span> skip</span>
            <span><span className="kbd">J</span> <span className="kbd">K</span> move</span>
            <span><span className="kbd">1</span>–<span className="kbd">9</span> outcome after hang-up</span>
            <span><span className="kbd">?</span> all shortcuts</span>
          </footer>
        ) : null}
      </section>

    </div>
  );
}
