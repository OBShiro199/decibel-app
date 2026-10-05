import { Skeleton } from '@/components/ui/display';

// Mirrors the wizard shell exactly, so a full page load settles without movement.
export default function Loading() {
  return (
    <div className="flex h-dvh flex-col overflow-hidden md:flex-row" aria-busy>
      <aside className="shrink-0 border-b border-white-800 bg-white-100 p-4 md:w-[var(--settings-rail-width)] md:border-b-0 md:border-r md:p-6">
        <Skeleton className="h-6 w-28" />
        <div className="mt-4 flex gap-0.5 md:mt-8 md:flex-col">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="flex h-8 shrink-0 items-center gap-2.5 px-2">
              <Skeleton className="h-3.5 w-3.5 rounded-full" />
              <Skeleton className="h-3 w-28" />
            </div>
          ))}
        </div>
      </aside>
      <main className="flex min-h-0 flex-1 flex-col bg-white-100">
        <div className="min-h-0 flex-1 overflow-hidden">
          <div className="mx-auto w-full max-w-[680px] px-4 py-8 md:px-6 md:py-12">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="mt-3 h-9 w-80 max-w-full" />
            <Skeleton className="mt-3 h-5 w-full" />
            <div className="card mt-10 flex flex-col gap-5 p-6">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i}>
                  <Skeleton className="h-3 w-28" />
                  <Skeleton className="mt-2 h-9 w-full" />
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="h-[69px] shrink-0 border-t border-white-800 bg-white-100" />
      </main>
    </div>
  );
}
