'use client';
import { ErrorCard } from '@/components/ui/display';

export default function AppError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="p-6">
      <ErrorCard message={error.message || 'Something went wrong.'} onRetry={reset} />
    </div>
  );
}
