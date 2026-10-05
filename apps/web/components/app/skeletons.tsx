import { Skeleton, TableSkeleton } from '@/components/ui/display';

/** Stat strip placeholder with the same hairline grid and tile height as the real one. */
export function TilesSkeleton({ count = 4, className }: { count?: number; className: string }) {
  return (
    <div className={className} aria-busy>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-white-100 p-5">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="mt-3 h-9 w-20" />
        </div>
      ))}
    </div>
  );
}

export function TodaySkeleton() {
  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-4 p-4 md:p-6" aria-busy>
      <div>
        <Skeleton className="h-4 w-16" />
        <Skeleton className="mt-2 h-[30px] w-72" />
        <Skeleton className="mt-2 h-4 w-56" />
      </div>
      <TilesSkeleton className="grid grid-cols-2 stat-grid lg:grid-cols-4" />
      <div className="card overflow-hidden">
        <div className="flex h-12 items-center border-b border-white-800 px-4">
          <Skeleton className="w-16" />
        </div>
        <TableSkeleton rows={6} cols={5} />
      </div>
    </div>
  );
}

export function LeadsSkeleton() {
  return (
    <div className="flex h-full" aria-busy>
      <div className="flex min-w-0 flex-1 flex-col bg-white-100">
        <div className="flex h-12 items-center gap-3 border-b border-white-800 px-4">
          <Skeleton className="h-8 w-72" />
          <Skeleton className="w-24" />
        </div>
        <div className="flex h-11 items-center gap-2 border-b border-white-800 px-4">
          <Skeleton className="h-[22px] w-24" />
          <Skeleton className="h-[22px] w-20" />
        </div>
        <TableSkeleton rows={12} cols={7} />
      </div>
    </div>
  );
}

export function RailSkeleton({ groups = 3 }: { groups?: number }) {
  return (
    <div aria-busy>
      {Array.from({ length: groups }).map((_, g) => (
        <div key={g} className="border-b border-white-800 px-4 py-4">
          <Skeleton className="h-3 w-20" />
          <div className="mt-3 flex flex-col gap-2.5">
            {Array.from({ length: g === 0 ? 2 : 6 }).map((_, i) => (
              <Skeleton key={i} className="h-4" style={{ width: `${45 + ((i * 17 + g * 11) % 40)}%` }} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Checkbox-list placeholder sized to `rows` lines of the real list (16px line + 6px gap). */
export function CheckListSkeleton({ rows }: { rows: number }) {
  return (
    <div className="flex flex-col gap-1.5" aria-busy>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex h-5 items-center gap-2">
          <Skeleton className="h-4 w-4" />
          <Skeleton className="h-3" style={{ width: `${40 + ((i * 23) % 45)}%` }} />
        </div>
      ))}
    </div>
  );
}

/** Person record placeholder: top bar, header, tabs, timeline and the attribute rail. */
export function RecordSkeleton() {
  return (
    <div className="flex h-full flex-col bg-white-100" aria-busy>
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-white-800 px-4">
        <Skeleton className="h-8 w-8" />
        <Skeleton className="h-8 w-8" />
        <Skeleton className="h-8 w-8" />
      </div>
      <div className="flex min-h-0 flex-1 max-lg:flex-col">
        <div className="min-w-0 flex-1 px-6 pt-6">
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10" />
            <div className="flex-1">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="mt-2 h-4 w-64" />
            </div>
            <Skeleton className="h-9 w-20" />
          </div>
          <div className="mt-3 flex gap-2">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-6 w-24" />
            <Skeleton className="h-6 w-20" />
          </div>
          <div className="mt-4 flex h-10 items-center gap-5 border-b border-white-800">
            {[64, 56, 56, 52, 72].map((w, i) => (
              <Skeleton key={i} className="h-3" style={{ width: w }} />
            ))}
          </div>
          <div className="flex flex-col gap-3 py-6">
            <Skeleton className="h-5 w-24" />
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        </div>
        <aside className="w-[var(--rail-width)] shrink-0 border-l border-white-800 px-4 py-4 max-lg:hidden">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="flex h-8 items-center gap-2">
              <Skeleton className="h-4 w-4" />
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-3 flex-1" />
            </div>
          ))}
        </aside>
      </div>
    </div>
  );
}

export function KanbanSkeleton() {
  return (
    <div className="flex h-full gap-3 overflow-hidden bg-canvas p-4" aria-busy>
      {Array.from({ length: 5 }).map((_, c) => (
        <div key={c} className="w-[280px] shrink-0">
          <Skeleton className="mb-3 h-3 w-24" />
          <div className="flex flex-col gap-2 p-1">
            {Array.from({ length: 3 - (c % 3) }).map((_, i) => (
              <div key={i} className="border border-white-800 bg-white-100 p-3">
                <Skeleton className="w-32" />
                <Skeleton className="mt-2 h-3 w-40" />
                <Skeleton className="mt-3 h-[22px] w-20" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Centred auth card placeholder matching the form's footprint. */
export function AuthCardSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="card p-6" aria-busy>
      <Skeleton className="h-6 w-44" />
      <Skeleton className="mt-2 w-60" />
      <Skeleton className="mt-6 h-9 w-full" />
      <div className="my-4 h-4" />
      <div className="flex flex-col gap-4">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i}>
            <Skeleton className="h-3 w-20" />
            <Skeleton className="mt-2 h-9 w-full" />
          </div>
        ))}
        <Skeleton className="h-9 w-full" />
        <Skeleton className="mx-auto w-40" />
      </div>
      <div className="mt-6 border-t border-white-800 pt-4">
        <Skeleton className="mx-auto w-48" />
      </div>
    </div>
  );
}
