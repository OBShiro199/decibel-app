'use client';
import { keepPreviousData, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { ToastProvider } from '@/components/ui/overlay';

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000, // fresh for 30s: no refetch spam
            gcTime: 30 * 60_000, // a tab visited in the last half hour opens with its data at once
            refetchOnWindowFocus: true, // quiet background refresh; content never blanks
            retry: 1,
            placeholderData: keepPreviousData, // a changed filter keeps showing the old rows until new ones arrive
          },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );
}
