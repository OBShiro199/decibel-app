// There is no Today tab: /app (bookmarks, old links, emails) opens Leads.
import { redirect } from 'next/navigation';
import { HOME } from '@/lib/constants';

export default async function AppHome({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const welcome = (await searchParams).welcome === '1';
  redirect(welcome ? `${HOME}?welcome=1` : HOME);
}
