'use client';
// Local: businesses found on Google Maps, with their mobile, rating, reviews and website.
// Sample data for now (lib/local-data.ts): ten fictional listings.
import { Globe, MapPin, Search as SearchIcon, Star } from 'lucide-react';
import { useMemo, useState } from 'react';
import { LOCAL_BUSINESSES } from '@/lib/local-data';
import { cn, formatPhone } from '@/lib/utils';
import { FilterMenu } from '@/components/app/filter-menu';
import { Avatar, EmptyState, Tag } from '@/components/ui/display';
import { Input } from '@/components/ui/form';
import { RevealOnce } from '@/components/ui/reveal';

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'flex h-8 shrink-0 items-center rounded-sm border px-2.5 transition-colors',
        active ? 'border-accent-500/40 bg-accent-50 text-black-400' : 'border-white-800 text-black-700 hover:border-btnborder hover:text-black-400',
      )}
    >
      {children}
    </button>
  );
}

export default function LocalPage() {
  const [text, setText] = useState('');
  const [category, setCategory] = useState('');
  const [noWebsite, setNoWebsite] = useState(false);
  const [topRated, setTopRated] = useState(false);

  const categories = useMemo(() => [...new Set(LOCAL_BUSINESSES.map((b) => b.category))].sort().map((c) => ({ value: c, label: c })), []);
  const rows = useMemo(() => {
    const q = text.trim().toLowerCase();
    return LOCAL_BUSINESSES.filter(
      (b) =>
        (!q || `${b.name} ${b.category} ${b.address}`.toLowerCase().includes(q)) &&
        (!category || b.category === category) &&
        (!noWebsite || !b.website) &&
        (!topRated || b.rating >= 4.5),
    );
  }, [text, category, noWebsite, topRated]);
  const filtered = !!text.trim() || !!category || noWebsite || topRated;

  return (
    <div className="flex h-full flex-col bg-white-100">
      <div className="flex h-12 shrink-0 items-center gap-2 overflow-x-auto border-b border-white-800 px-4 [scrollbar-width:none]">
        <div className="relative shrink-0">
          <SearchIcon size={16} strokeWidth={1.5} className="pointer-events-none absolute left-2.5 top-2 text-white-900" />
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Search name, category or town" className="h-8 w-72 pl-8 max-sm:w-44" aria-label="Search local businesses" />
        </div>
        <FilterMenu label="Category" allLabel="All" value={category} onChange={setCategory} options={categories} />
        <Chip active={noWebsite} onClick={() => setNoWebsite((v) => !v)}>
          No website
        </Chip>
        <Chip active={topRated} onClick={() => setTopRated((v) => !v)}>
          4.5 stars and up
        </Chip>
        <h1 className="ml-auto shrink-0 text-black-700">
          <span className="text-black-400">{rows.length}</span> {rows.length === 1 ? 'business' : 'businesses'}
        </h1>
        <Tag color={7} className="shrink-0">
          Sample data
        </Tag>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {rows.length ? (
          <RevealOnce id="local:table">
            <div className="tbl-wrap">
              <table className="tbl tbl-fixed">
                <colgroup>
                  <col style={{ width: 270 }} />
                  <col style={{ width: 150 }} />
                  <col style={{ width: 90 }} />
                  <col style={{ width: 90 }} />
                  <col style={{ width: 160 }} />
                  <col style={{ width: 230 }} />
                  <col style={{ width: 260 }} />
                  <col style={{ width: 190 }} />
                  <col style={{ width: 130 }} />
                </colgroup>
                <thead>
                  <tr>
                    <th>Business</th>
                    <th>Category</th>
                    <th>Rating</th>
                    <th>Reviews</th>
                    <th>Mobile</th>
                    <th>Website</th>
                    <th>Address</th>
                    <th>Hours</th>
                    <th>Last review</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((b) => (
                    <tr key={b.id}>
                      <td>
                        <span className="flex min-w-0 items-center gap-2">
                          <Avatar name={b.name} size={24} />
                          <span className="truncate font-medium text-black-400">{b.name}</span>
                        </span>
                      </td>
                      <td>
                        <span className={cn('tag', `tag-${b.tone}`)}>{b.category}</span>
                      </td>
                      <td className="tabular-nums">
                        <span className="flex items-center gap-1 text-black-400">
                          <Star size={14} strokeWidth={0} fill="#e0a526" aria-hidden />
                          {b.rating.toFixed(1)}
                        </span>
                      </td>
                      <td className="tabular-nums text-black-700">{b.reviews.toLocaleString('en-GB')}</td>
                      <td className="tabular-nums">{formatPhone(b.mobile)}</td>
                      <td>
                        {b.website ? (
                          <span className="flex min-w-0 items-center gap-1.5 text-black-700">
                            <Globe size={14} strokeWidth={1.5} className="shrink-0 text-white-900" aria-hidden />
                            <span className="truncate">{b.website}</span>
                          </span>
                        ) : (
                          <span className="tag tag-3">No website</span>
                        )}
                      </td>
                      <td>
                        <span className="flex min-w-0 items-center gap-1.5 text-black-700">
                          <MapPin size={14} strokeWidth={1.5} className="shrink-0 text-white-900" aria-hidden />
                          <span className="truncate">{b.address}</span>
                        </span>
                      </td>
                      <td>
                        <span className={cn('tag', b.hours.open ? 'tag-0' : 'tag-7')}>{b.hours.text}</span>
                      </td>
                      <td className="text-black-700">{b.lastReview}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </RevealOnce>
        ) : (
          <EmptyState title="No businesses match" description={filtered ? 'Try clearing a filter.' : 'Nothing here yet.'} />
        )}
      </div>
    </div>
  );
}
