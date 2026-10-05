import { Skeleton } from '@/components/ui/display';

// Same geometry as the dashboard while it loads: toolbar, four headline tiles, the
// secondary strip, chart and funnel, then the leaderboard, so nothing moves on swap.
export default function Loading() {
  return (
    <div className="dash-13 mx-auto flex max-w-[1200px] flex-col gap-4 p-4 md:p-6" aria-busy="true">
      <div className="flex h-9 items-center">
        <Skeleton className="h-8 w-[300px]" />
      </div>
      <div className="grid grid-cols-2 stat-grid lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="bg-white-100 p-5">
            <div className="flex h-5 items-center">
              <Skeleton className="h-3 w-20" />
            </div>
            <Skeleton className="mt-2 h-[18px] w-16" />
          </div>
        ))}
      </div>
      <div className="card h-12" />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="card h-[320px] p-4">
          <Skeleton className="h-full w-full" />
        </div>
        <div className="card h-[320px] p-4">
          <Skeleton className="h-full w-full" />
        </div>
      </div>
      <div className="card h-[182px]" />
    </div>
  );
}
