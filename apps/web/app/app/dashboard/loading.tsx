import { TilesSkeleton } from '@/components/app/skeletons';
import { Skeleton } from '@/components/ui/display';

export default function Loading() {
  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-4 p-4 md:p-6" aria-busy="true">
      <Skeleton className="h-[52px] w-56" />
      <TilesSkeleton count={6} className="grid grid-cols-2 stat-grid md:grid-cols-3 xl:grid-cols-6" />
      <Skeleton className="h-[260px] w-full" />
    </div>
  );
}
