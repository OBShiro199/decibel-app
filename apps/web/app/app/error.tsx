'use client';
// A page inside the app that throws: keep the sidebar, explain calmly, offer a retry and a way back.
import { useEffect } from 'react';
import { ErrorCard } from '@/components/ui/display';
import { HOME } from '@/lib/constants';

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  // server errors arrive with their message hidden; show a plain sentence and the reference instead
  const message = error.digest
    ? `This page couldn't load (ref ${error.digest}). Try again, or go back to Leads.`
    : error.message || 'Something went wrong loading this page.';
  return (
    <div className="p-6">
      <ErrorCard message={message} onRetry={reset} />
      <a href={HOME} className="mt-3 inline-block text-black-700 underline underline-offset-2 hover:text-black-400">
        Back to Leads
      </a>
    </div>
  );
}
