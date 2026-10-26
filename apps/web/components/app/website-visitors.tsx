'use client';

// Website visitors (migration 0042): the companies visiting the workspace's website, matched from their
// business network by the v.js snippet and the visitor-track function, with the decision makers at each
// company from the lead database. Emails and mobiles stay masked until revealed (one credit, as in Leads).
import { CaretDown, Check, Copy, Eye, Globe } from '@phosphor-icons/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { track } from '@/lib/analytics';
import { useApp } from '@/lib/app-context';
import { revealLeads } from '@/lib/reveal';
import { SITE_URL } from '@/lib/site';
import { invoke, supabase } from '@/lib/supabase/client';
import { cn, exportCsv, formatPhone, timeAgo } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { codeFor } from '@/components/app/quick-filters';
import { EmptyState, ErrorCard, Skeleton, Tabs } from '@/components/ui/display';
import { Input } from '@/components/ui/form';
import { Dialog, useToast } from '@/components/ui/overlay';
import { useFirstReveal } from '@/components/ui/reveal';

const BLUE = '#5f86e0';
const PAGE = 25;
const n = (v: number) => v.toLocaleString('en-GB');

interface Site {
  id: string;
  domain: string;
  site_key: string;
  created_at: string;
  last_hit_at: string | null;
}

interface Person {
  lead_id: string;
  full_name: string | null;
  title: string | null;
  seniority: string | null;
  email: string | null;
  has_email: boolean;
  mobile: string | null;
  has_mobile: boolean;
  person_id: string | null;
  on_dnc: boolean;
}

/** one page view, identified or not (0043) */
interface Hit {
  id: number;
  ip: string;
  path: string | null;
  referrer: string | null;
  company_domain: string | null;
  country: string | null;
  country_code: string | null;
  region: string | null;
  city: string | null;
  isp: string | null;
  device: string | null;
  created_at: string;
}

interface Company {
  id: string;
  site_id: string;
  domain: string;
  organization: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  isp: string | null;
  last_ip: string | null;
  page_views: number;
  visits: number;
  pages: string[];
  first_seen: string;
  last_seen: string;
  people: Person[];
  people_found: number;
}

/** where a visit came from: the referring site's host, "Your site" for a click within it, or "Direct" */
function referrerHost(ref: string | null, own: string): string {
  if (!ref) return 'Direct';
  try {
    const host = new URL(ref).hostname.replace(/^www\./, '');
    return host === own || host.endsWith(`.${own}`) ? 'Your site' : host;
  } catch {
    return 'Direct';
  }
}

/** the country's flag (from /public/flags), by ISO code or by name; nothing when it isn't known */
function CountryFlag({ code, name }: { code?: string | null; name?: string | null }) {
  const cc = (code && /^[A-Za-z]{2}$/.test(code) ? code.toUpperCase() : name ? codeFor(name) : null) ?? null;
  if (!cc) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`/flags/${cc}.svg`} alt="" width={18} height={12} className="h-3 w-[18px] shrink-0 rounded-[2px] object-cover shadow-[0_0_0_1px_rgba(8,9,10,0.08)]" />;
}

/** a location cell: flag, then "City, Region, Country" */
function Location({ code, country, parts }: { code?: string | null; country: string | null; parts: (string | null)[] }) {
  const text = [...parts, country].filter(Boolean).join(', ');
  return (
    <span className="flex min-w-0 items-center gap-2" title={text}>
      <CountryFlag code={code} name={country} />
      <span className="truncate">{text || '–'}</span>
    </span>
  );
}

/** Rows shaped like the real table (36px header, 48px app rows, the same column widths). */
function RowsSkeleton({ widths, rows = 12, twoLine = 0 }: { widths: number[]; rows?: number; twoLine?: number }) {
  const bars = [62, 44, 70, 52, 38, 58, 48, 66];
  return (
    <div aria-busy="true" className="overflow-hidden">
      <span className="sr-only">Loading</span>
      <div className="flex h-9 items-center border-b border-white-800 bg-panel">
        {widths.map((w, c) => (
          <div key={c} className="shrink-0 px-3" style={{ width: w }}>
            <Skeleton className="h-2.5 w-14" />
          </div>
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex h-12 items-center border-b border-rule bg-white-100" style={{ opacity: 1 - r * 0.06 }}>
          {widths.map((w, c) => (
            <div key={c} className="shrink-0 px-3" style={{ width: w }}>
              {c === 0 && twoLine ? (
                <div className="flex items-center gap-2.5">
                  <Skeleton className="h-7 w-7 rounded-[6px]" />
                  <div className="flex-1">
                    <Skeleton className="h-3" style={{ width: `${bars[r % bars.length]}%` }} />
                    <Skeleton className="mt-1.5 h-2.5" style={{ width: `${bars[(r + 3) % bars.length] - 10}%` }} />
                  </div>
                </div>
              ) : c < twoLine ? (
                <>
                  <Skeleton className="h-3" style={{ width: `${bars[(r + c * 3) % bars.length]}%` }} />
                  <Skeleton className="mt-1.5 h-2.5" style={{ width: `${bars[(r + c * 5) % bars.length] - 12}%` }} />
                </>
              ) : (
                <Skeleton className="h-3" style={{ width: `${bars[(r + c * 3) % bars.length]}%` }} />
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

const COMPANY_COLS = [240, 220, 210, 160, 104, 130, 160, 120, 100, 210];
const VISIT_COLS = [120, 220, 140, 200, 190, 100, 180, 200];

/** The whole page while the website loads: toolbar, tabs and table, so nothing moves when it arrives. */
export function VisitorsSkeleton() {
  return (
    <div className="flex h-full flex-col bg-white-100" aria-busy="true">
      <div className="flex h-12 shrink-0 items-center gap-3 border-b border-white-800 px-4">
        <Skeleton className="h-4 w-4" />
        <Skeleton className="h-3.5 w-32" />
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-3 w-20" />
        <div className="ml-auto flex gap-2">
          <Skeleton className="h-7 w-24 rounded-sm" />
          <Skeleton className="h-7 w-28 rounded-sm" />
          <Skeleton className="h-7 w-28 rounded-sm" />
        </div>
      </div>
      <div className="flex h-10 shrink-0 items-center gap-6 border-b border-white-800 px-4">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-3 w-20" />
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        <RowsSkeleton widths={COMPANY_COLS} twoLine={2} />
      </div>
    </div>
  );
}

const snippet = (key: string) => `<script defer src="${SITE_URL}/v.js" data-site="${key}"></script>`;
const SENIORITY_LABEL: Record<string, string> = { 'c-level': 'C-level', vp: 'VP', director: 'Director', manager: 'Manager' };

function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      size="compact"
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1600);
        });
      }}
    >
      {done ? <Check size={14} /> : <Copy size={14} />} {done ? 'Copied' : label}
    </Button>
  );
}

/** Install steps: the script tag for the site, and whether visits are arriving yet. */
function InstallPanel({ site }: { site: Site }) {
  const live = !!site.last_hit_at;
  return (
    <div className="space-y-4">
      <div>
        <p className="text-black-700">Paste this into the &lt;head&gt; of every page on {site.domain}, or into your site builder&rsquo;s custom code setting.</p>
        <div className="mt-2.5 flex items-start gap-2">
          <pre className="min-w-0 flex-1 overflow-x-auto rounded-md border border-white-800 bg-panel px-3 py-2.5 text-black-400" data-testid="visitor-snippet">
            {snippet(site.site_key)}
          </pre>
          <CopyButton text={snippet(site.site_key)} />
        </div>
      </div>
      <p className="flex items-center gap-2 text-black-700">
        <span className={cn('h-2 w-2 rounded-full', live ? 'pulse-dot' : 'bg-white-800')} style={live ? { background: '#27a644' } : undefined} />
        {live ? `Receiving visits · last one ${timeAgo(site.last_hit_at)}` : 'Waiting for the first visit. Open your website once the script is in.'}
      </p>
      <p className="text-black-700">
        No cookies and nothing about the person: each visit is matched to a company from its business network only, and visitors with Do Not Track or Global Privacy Control on are never sent. Mention website visitor tracking in your privacy notice.
      </p>
    </div>
  );
}

/** First run: add the website, then show the snippet. */
function Setup({ onAdded }: { onAdded: () => void }) {
  const { workspace } = useApp();
  const [domain, setDomain] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function add() {
    setBusy(true);
    setError('');
    const { error: e } = await supabase().rpc('add_visitor_site', { p_workspace_id: workspace.id, p_domain: domain });
    setBusy(false);
    if (e) return setError(e.message.replace(/^[a-z_]+:\s*/, '').replace(/^./, (c) => c.toUpperCase()) + (/[.]$/.test(e.message) ? '' : '.'));
    track('visitor_site_added');
    onAdded();
  }
  return (
    <div className="h-full overflow-y-auto bg-white-100">
      <div className="mx-auto w-full max-w-[640px] px-6 pb-20 pt-16">
        <span className="flex h-9 w-9 items-center justify-center rounded-md" style={{ background: '#f1f5fd' }}>
          <Eye size={18} weight="duotone" style={{ color: BLUE }} />
        </span>
        <h1 className="t-h2 mt-4">See which companies visit your website</h1>
        <p className="mt-2 text-black-700">
          Add your website and paste one line into its pages. Visits from business networks are matched to the company behind them, with the decision makers there ready to reveal and call.
        </p>
        <form
          className="mt-6 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void add();
          }}
        >
          <Input id="visitor-domain" value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="acme.co.uk" aria-label="Your website" className="flex-1" />
          <Button variant="primary" type="submit" loading={busy} disabled={!domain.trim()}>
            Add website
          </Button>
        </form>
        {error ? (
          <p role="alert" className="mt-2 text-danger-700">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function WebsiteVisitors() {
  const { workspace, refreshWorkspace, isAdmin } = useApp();
  const qc = useQueryClient();
  const toast = useToast();
  const [page, setPage] = useState(0);
  const [install, setInstall] = useState(false);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [revealing, setRevealing] = useState<string | null>(null);
  const [tab, setTab] = useState<'companies' | 'visits'>('companies');
  const [changing, setChanging] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [exporting, setExporting] = useState(false);
  // rows rise in the first time each table shows this session
  const revealCompanies = useFirstReveal('visitors-companies');
  const revealVisits = useFirstReveal('visitors-visits');

  const sites = useQuery({
    queryKey: ['visitor-sites', workspace.id],
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase().from('visitor_sites').select('id,domain,site_key,created_at,last_hit_at').eq('workspace_id', workspace.id).order('created_at');
      if (error) throw new Error(error.message);
      return (data ?? []) as Site[];
    },
  });
  // one website per workspace (the newest, if an older one is still there)
  const site = sites.data?.at(-1) ?? null;

  const visitors = useQuery({
    queryKey: ['visitor-companies', workspace.id, site?.id, page],
    enabled: !!site,
    refetchInterval: 30_000,
    placeholderData: (prev) => prev,
    queryFn: () => invoke<{ companies: Company[]; total: number }>('visitor-companies', { workspace_id: workspace.id, site_id: site!.id, offset: page * PAGE, limit: PAGE }),
  });

  const hits = useQuery({
    queryKey: ['visitor-hits', workspace.id, site?.id, page],
    enabled: !!site && tab === 'visits',
    refetchInterval: 30_000,
    placeholderData: (prev) => prev,
    queryFn: async () => {
      const { data, error, count } = await supabase()
        .from('visitor_hits')
        .select('id,ip,path,referrer,company_domain,country,country_code,region,city,isp,device,created_at', { count: 'exact' })
        .eq('site_id', site!.id)
        .order('created_at', { ascending: false })
        .range(page * PAGE, page * PAGE + PAGE - 1);
      if (error) throw new Error(error.message);
      return { rows: (data ?? []) as Hit[], total: count ?? 0 };
    },
  });

  async function reveal(p: Person) {
    setRevealing(p.lead_id);
    const { error } = await revealLeads(workspace.id, [p.lead_id], { from: 'search' });
    setRevealing(null);
    if (error) return void toast(error.message, error.href ? { label: error.label ?? 'Fix', href: error.href } : undefined);
    track('visitor_person_revealed');
    void refreshWorkspace();
    void qc.invalidateQueries({ queryKey: ['visitor-companies', workspace.id] });
  }

  /** every company found on the website (not just this page), newest first */
  async function exportCompanies() {
    if (!site) return;
    setExporting(true);
    const { data: rows, error } = await supabase()
      .from('visitor_companies')
      .select('organization,domain,city,region,country,isp,visits,page_views,pages,first_seen,last_seen')
      .eq('site_id', site.id)
      .order('last_seen', { ascending: false })
      .limit(5000);
    setExporting(false);
    if (error) return void toast(error.message);
    if (!rows?.length) return void toast('No companies to export yet.');
    exportCsv(
      workspace.id,
      'visitors',
      `decibel-website-visitors-${site.domain}-${new Date().toISOString().slice(0, 10)}.csv`,
      rows.map((r) => ({
        company: r.organization ?? r.domain,
        website: r.domain,
        city: r.city,
        region: r.region,
        country: r.country,
        network: r.isp,
        visits: r.visits,
        page_views: r.page_views,
        pages: ((r.pages as string[] | null) ?? []).join(' '),
        first_seen: r.first_seen,
        last_seen: r.last_seen,
      })),
    );
    track('visitor_companies_exported', { rows: rows.length });
  }

  async function removeSite() {
    if (!site) return;
    setRemoving(true);
    const { error } = await supabase().from('visitor_sites').delete().eq('id', site.id);
    setRemoving(false);
    if (error) return void toast(error.message);
    setChanging(false);
    setPage(0);
    track('visitor_site_removed');
    await sites.refetch();
  }

  if (sites.isLoading) return <VisitorsSkeleton />;
  if (sites.error) return <div className="p-4"><ErrorCard message={(sites.error as Error).message} onRetry={() => sites.refetch()} /></div>;
  if (!site) return <Setup onAdded={() => void sites.refetch().then(() => setInstall(true))} />;

  const data = visitors.data;
  const companies = data?.companies ?? [];
  // the footer pages whichever tab is open
  const shownTotal = tab === 'visits' ? (hits.data?.total ?? 0) : (data?.total ?? 0);
  const pages = Math.max(1, Math.ceil(shownTotal / PAGE));

  return (
    <div className="flex h-full flex-col bg-white-100">
      <div className="flex h-12 shrink-0 items-center gap-3 border-b border-white-800 px-4">
        <Globe size={16} className="text-black-700" />
        <span className="font-medium text-black-400">{site.domain}</span>
        <span className="flex items-center gap-1.5 text-black-700">
          <span className={cn('h-1.5 w-1.5 rounded-full', site.last_hit_at ? 'pulse-dot' : 'bg-white-800')} style={site.last_hit_at ? { background: '#27a644' } : undefined} />
          {site.last_hit_at ? `Last visit ${timeAgo(site.last_hit_at)}` : 'No visits yet'}
        </span>
        <span className="tabular-nums text-black-700">
          {data ? `${n(data.total)} ${data.total === 1 ? 'company' : 'companies'}` : '…'}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Button size="compact" variant="ghost" loading={exporting} disabled={!data?.total} onClick={() => void exportCompanies()}>
            Export CSV
          </Button>
          <Button size="compact" onClick={() => setInstall(true)}>
            Install snippet
          </Button>
          {isAdmin ? (
            <Button size="compact" variant="ghost" onClick={() => setChanging(true)}>
              Change website
            </Button>
          ) : null}
        </div>
      </div>

      <Tabs
        className="shrink-0 px-4"
        active={tab}
        onChange={(id) => {
          setTab(id as 'companies' | 'visits');
          setPage(0);
        }}
        tabs={[
          { id: 'companies', label: 'Companies', count: data?.total },
          { id: 'visits', label: 'All visits', count: hits.data?.total },
        ]}
      />

      {tab === 'visits' ? (
        <div key="visits" className="page-in min-h-0 flex-1 overflow-auto">
          {hits.error ? (
            <div className="p-4">
              <ErrorCard message={(hits.error as Error).message} onRetry={() => hits.refetch()} />
            </div>
          ) : !hits.data ? (
            <RowsSkeleton widths={VISIT_COLS} />
          ) : !hits.data.rows.length ? (
            <EmptyState shape="diamond" title="No visits yet" description={`Every page view on ${site.domain} shows here, with its location and network, whether or not a company was found.`} />
          ) : (
            <div className={cn('tbl-wrap transition-opacity', revealVisits && 'reveal-once', hits.isPlaceholderData && 'opacity-60')}>
              <table className="tbl tbl-fixed" data-testid="visits-table">
                <colgroup>
                  <col style={{ width: 120 }} />
                  <col style={{ width: 220 }} />
                  <col style={{ width: 140 }} />
                  <col style={{ width: 200 }} />
                  <col style={{ width: 190 }} />
                  <col style={{ width: 100 }} />
                  <col style={{ width: 180 }} />
                  <col style={{ width: 200 }} />
                </colgroup>
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Page</th>
                    <th>IP address</th>
                    <th>Location</th>
                    <th>Network</th>
                    <th>Device</th>
                    <th>Came from</th>
                    <th>Company</th>
                  </tr>
                </thead>
                <tbody>
                  {hits.data.rows.map((h) => (
                    <tr key={h.id}>
                      <td className="text-black-700" title={new Date(h.created_at).toLocaleString('en-GB')}>
                        {timeAgo(h.created_at)}
                      </td>
                      <td className="truncate text-black-400" title={h.path ?? ''}>
                        {h.path ?? '–'}
                      </td>
                      <td className="tabular-nums text-black-700">{h.ip}</td>
                      <td className="text-black-700">
                        <Location code={h.country_code} country={h.country} parts={[h.city, h.region]} />
                      </td>
                      <td className="truncate text-black-700">{h.isp ?? '–'}</td>
                      <td className="text-black-700">{h.device ? h.device[0].toUpperCase() + h.device.slice(1) : '–'}</td>
                      <td className="truncate text-black-700" title={h.referrer ?? ''}>
                        {referrerHost(h.referrer, site.domain)}
                      </td>
                      <td>{h.company_domain ? <span className="tag tag-0">{h.company_domain}</span> : <span className="tag tag-7">Not identified</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
      <div key="companies" className="page-in min-h-0 flex-1 overflow-auto">
        {visitors.error ? (
          <div className="p-4">
            <ErrorCard message={(visitors.error as Error).message} onRetry={() => visitors.refetch()} />
          </div>
        ) : !data ? (
          <RowsSkeleton widths={COMPANY_COLS} twoLine={2} />
        ) : !companies.length ? (
          <EmptyState
            shape="diamond"
            title={site.last_hit_at ? 'No companies yet' : 'Install the snippet to start'}
            description={
              site.last_hit_at
                ? 'Visits are arriving. Companies appear here within a minute of someone visiting from a business network.'
                : `Add the script to ${site.domain}, then open the site once. Companies appear here within a minute.`
            }
            action={<Button onClick={() => setInstall(true)}>Install snippet</Button>}
          />
        ) : (
          <div className={cn('tbl-wrap transition-opacity', revealCompanies && 'reveal-once', visitors.isPlaceholderData && 'opacity-60')}>
            <table className="tbl tbl-fixed" data-testid="visitors-table">
              <colgroup>
                <col style={{ width: 240 }} />
                <col style={{ width: 220 }} />
                <col style={{ width: 210 }} />
                <col style={{ width: 160 }} />
                <col style={{ width: 104 }} />
                <col style={{ width: 130 }} />
                <col style={{ width: 160 }} />
                <col style={{ width: 120 }} />
                <col style={{ width: 100 }} />
                <col style={{ width: 210 }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Company</th>
                  <th>Decision maker</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th />
                  <th>IP address</th>
                  <th>Location</th>
                  <th>Visits</th>
                  <th>Last seen</th>
                  <th>Pages</th>
                </tr>
              </thead>
              <tbody>
                {companies.flatMap((c) => {
                  const expanded = open.has(c.id);
                  const people = expanded ? c.people : c.people.slice(0, 1);
                  const rows = (people.length ? people : [null]).map((p, i) => (
                    <tr key={`${c.id}:${p?.lead_id ?? 'none'}`}>
                      {i === 0 ? (
                        <td>
                          <div className="flex items-center gap-2.5">
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] border border-white-800 text-black-700">
                              {(c.organization ?? c.domain).slice(0, 2).toUpperCase()}
                            </span>
                            <span className="min-w-0">
                              <span className="block truncate font-medium text-black-400">{c.organization ?? c.domain}</span>
                              <span className="block truncate text-black-700">{c.domain}</span>
                            </span>
                          </div>
                        </td>
                      ) : (
                        <td />
                      )}
                      {p ? (
                        <>
                          <td>
                            <span className="block truncate text-black-400">{p.full_name ?? '–'}</span>
                            <span className="flex items-center gap-1.5 truncate text-black-700">
                              {p.seniority ? <span className="tag tag-1">{SENIORITY_LABEL[p.seniority] ?? p.seniority}</span> : null}
                              <span className="truncate">{p.title ?? ''}</span>
                            </span>
                          </td>
                          <td className="truncate text-black-700">{p.has_email ? p.email : '–'}</td>
                          <td className="tabular-nums text-black-700">
                            {p.on_dnc ? <span className="tag tag-3">DNC</span> : p.has_mobile ? (p.person_id ? formatPhone(p.mobile ?? '') : p.mobile) : '–'}
                          </td>
                          <td>
                            {p.person_id ? (
                              <span className="tag tag-0">Revealed</span>
                            ) : p.on_dnc || (!p.has_email && !p.has_mobile) ? null : (
                              <Button size="compact" loading={revealing === p.lead_id} onClick={() => void reveal(p)}>
                                Reveal
                              </Button>
                            )}
                          </td>
                        </>
                      ) : (
                        <td colSpan={4} className="text-black-700">
                          No decision makers on file for {c.domain}
                        </td>
                      )}
                      {i === 0 ? (
                        <>
                          <td className="tabular-nums text-black-700">{c.last_ip ?? '–'}</td>
                          <td className="text-black-700">
                            <Location country={c.country} parts={[c.city]} />
                          </td>
                          <td className="tabular-nums">
                            {n(c.visits)} · {n(c.page_views)} {c.page_views === 1 ? 'page' : 'pages'}
                          </td>
                          <td className="text-black-700">{timeAgo(c.last_seen)}</td>
                          <td className="truncate text-black-700" title={c.pages.join('\n')}>
                            {c.pages.slice(0, 3).join('  ') || '–'}
                          </td>
                        </>
                      ) : (
                        <td colSpan={5} />
                      )}
                    </tr>
                  ));
                  if (c.people.length > 1) {
                    rows.push(
                      <tr key={`${c.id}:more`} className="[&>td]:h-8">
                        <td />
                        <td colSpan={9}>
                          <button
                            className="flex items-center gap-1 text-black-700 hover:text-black-400"
                            onClick={() =>
                              setOpen((s) => {
                                const next = new Set(s);
                                if (expanded) next.delete(c.id);
                                else next.add(c.id);
                                return next;
                              })
                            }
                          >
                            <CaretDown size={12} className={cn('transition-transform duration-150', expanded && 'rotate-180')} />
                            {expanded ? 'Show fewer' : `${c.people.length - 1} more decision ${c.people.length - 1 === 1 ? 'maker' : 'makers'}`}
                            {c.people_found > c.people.length ? <span className="text-faint"> · {n(c.people_found)} on file</span> : null}
                          </button>
                        </td>
                      </tr>,
                    );
                  }
                  return rows;
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      )}

      <div className="flex h-12 shrink-0 items-center justify-between border-t border-white-800 bg-panel px-4">
        <span className="tabular-nums text-black-700">
          {shownTotal ? `${n(page * PAGE + 1)}–${n(Math.min((page + 1) * PAGE, shownTotal))} of ${n(shownTotal)}` : ''}
        </span>
        <div className="flex gap-2">
          <Button size="compact" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <Button size="compact" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>
            Next
          </Button>
        </div>
      </div>

      <Dialog
        open={changing}
        onClose={() => setChanging(false)}
        title={`Remove ${site.domain}?`}
        description="To track a different website, remove this one and start again."
        footer={
          <>
            <Button onClick={() => setChanging(false)}>Cancel</Button>
            <Button variant="danger" loading={removing} onClick={() => void removeSite()}>
              Remove and start again
            </Button>
          </>
        }
      >
        <p className="text-black-700">
          Its snippet stops working and the {data ? n(data.total) : ''} {data?.total === 1 ? 'company' : 'companies'} it found are deleted. Take the snippet off {site.domain} too.
        </p>
      </Dialog>

      <Dialog open={install} onClose={() => setInstall(false)} title={`Install on ${site.domain}`} width={600} footer={<Button onClick={() => setInstall(false)}>Done</Button>}>
        <InstallPanel site={site} />
      </Dialog>
    </div>
  );
}
