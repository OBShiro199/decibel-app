import { TableSkeleton } from '@/components/ui/display';

// Same toolbar height and row geometry as the real page.
export default function Loading() {
  return (
    <div className="flex h-full flex-col">
      <div className="h-12 shrink-0 border-b border-white-800 bg-white-100" />
      <div className="min-h-0 flex-1 overflow-hidden bg-white-100">
        <TableSkeleton rows={12} cols={7} />
      </div>
    </div>
  );
}
