import { Skeleton } from '@/components/ui/display';

export default function Loading() {
  return (
    <div className="flex h-full flex-col" aria-busy="true">
      <div className="h-12 shrink-0 border-b border-white-800" />
      <div className="flex min-h-0 flex-1">
        <div className="w-[320px] shrink-0 border-r border-white-800" />
        <div className="mx-auto w-full max-w-[600px] px-6 py-10">
          <Skeleton className="h-6 w-56" />
          <Skeleton className="mt-3 h-4 w-80" />
        </div>
      </div>
    </div>
  );
}
