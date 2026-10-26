'use client';
// Any page outside the app that throws: a calm message and a way back, instead of a blank screen.
import { useEffect } from 'react';
import { Button, ButtonLink } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/display';

export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="flex min-h-dvh items-center justify-center px-6">
      <EmptyState
        shape="diamond"
        title="Something went wrong"
        description={error.digest ? `This page hit an error (ref ${error.digest}). Try again, or head back to the start.` : 'This page hit an error. Try again, or head back to the start.'}
        action={
          <div className="flex gap-2">
            <Button variant="primary" onClick={reset}>
              Try again
            </Button>
            <ButtonLink href="/">Back to Decibel</ButtonLink>
          </div>
        }
      />
    </div>
  );
}
