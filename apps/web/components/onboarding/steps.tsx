'use client';
import { useQuery } from '@tanstack/react-query';
import { BadgeCheck, Building2, CircleOff, Hand, Mic, Phone, Rocket, User, Users } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { track } from '@/lib/analytics';
import { COUNTRIES, JOB_TITLE_SUGGESTIONS, MARKETS, SENIORITIES, SIZE_BANDS } from '@/lib/constants';
import { applyLeadFilters, type LeadFilters } from '@/lib/leads';
import { saveInBackground } from '@/lib/background-save';
import { invoke, supabase } from '@/lib/supabase/client';
import type { CompanySizeBand, ContactPublic, PhoneNumber, RecordingPolicy, Seniority, Workspace, WorkspaceRole } from '@/lib/types';
import { firstName, formatPhone, isFreeMail, normalizePhone, slugify } from '@/lib/utils';
import { MicTest } from '@/components/app/mic-test';
import { BuyNumberPanel, VerifyCallerIdPanel } from '@/components/app/number-flows';
import { useSoftphoneActions } from '@/components/softphone/provider';
import { Button } from '@/components/ui/button';
import { Badge, CompanyLogo, OptionCard, Skeleton } from '@/components/ui/display';
import { Checkbox, ChipsInput, Field, Input, PillSelect, Select } from '@/components/ui/form';
import { useToast } from '@/components/ui/overlay';
import { StepFooter as Footer, useWizardNav, type StepProps } from './wizard';
import { countryFromInternational, DEFAULT_DIAL_COUNTRY, toE164, type DialCountry } from '@/lib/phone';
import { PhoneInput } from '@/components/ui/phone-input';

function Header({ title, description }: { title: string; description: string }) {
  return (
    <header className="mb-6 mt-3 md:min-h-[104px]">
      <h1 className="t-h1 text-black-400">{title}</h1>
      <p className="t-body-lg mt-2 text-black-700">{description}</p>
    </header>
  );
}

function ErrorNote({ children }: { children: React.ReactNode }) {
  return children ? (
    <p className="mt-4 rounded-md border border-white-800 bg-danger-100 p-3 text-danger-700" role="alert">
      {children}
    </p>
  ) : null;
}

const opts = (values: string[]) => values.map((v) => ({ value: v, label: v }));

// ----------------------------------------------------------------- step 1 ---
const TEAM_SIZES = ['1', '2–5', '6–20', '21–50', '51+'];
const ROLES = ['Founder', 'Sales leader', 'SDR/AE', 'RevOps', 'Other'];

export function WorkspaceStep({ user, profile }: Pick<StepProps, 'user' | 'profile'>) {
  const { adopt } = useWizardNav();
  const toast = useToast();
  const domain = user.email.split('@')[1] ?? '';
  const free = isFreeMail(user.email);
  const guess = free ? `${firstName(profile.full_name)}'s team` : domain.split('.')[0].replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const [name, setName] = useState(guess);
  const [touched, setTouched] = useState(false);
  const [website, setWebsite] = useState(free ? '' : `https://${domain}`);
  const [logo, setLogo] = useState<string | null>(null);
  const [teamSize, setTeamSize] = useState('2–5');
  const [role, setRole] = useState('Founder');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lookup = async (url: string) => {
    if (!url.trim()) return;
    try {
      const res = await fetch(`/api/site-meta?url=${encodeURIComponent(url.trim())}`);
      if (!res.ok) return;
      const meta = (await res.json()) as { name: string | null; icon: string | null };
      if (meta.icon) setLogo(meta.icon);
      if (meta.name && !touched) setName(meta.name);
    } catch {
      /* lookup is best-effort */
    }
  };
  useEffect(() => {
    if (website) void lookup(website);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError('Give your workspace a name.');
    setBusy(true);
    setError(null);
    const db = supabase();
    const base = slugify(name);
    let ws: Workspace | null = null;
    let lastError = '';
    for (const slug of [base, `${base}-${Math.random().toString(36).slice(2, 6)}`, `${base}-${Math.random().toString(36).slice(2, 8)}`]) {
      const { data, error } = await db.rpc('create_workspace', {
        p_name: name.trim(),
        p_slug: slug,
        p_website: website.trim() || null,
        p_team_size: teamSize,
      });
      if (!error && data) {
        ws = data as Workspace;
        break;
      }
      lastError = error?.message ?? 'Could not create the workspace.';
      if (!/duplicate|unique/i.test(lastError)) break;
    }
    if (!ws) {
      setError(lastError);
      setBusy(false);
      return;
    }
    const onboarding_state = { step: 2, completed: [1], skipped: [], role, started_at: new Date().toISOString(), short: free && !website.trim() };
    const wsId = ws.id;
    void saveInBackground(() => db.from('workspaces').update({ logo_url: logo, onboarding_state }).eq('id', wsId), { what: 'your workspace details', toast });
    // provision the Twilio subaccount in the background; twilio-token retries it if this fails
    void invoke('create-twilio-subaccount', { workspace_id: ws.id }).catch(() => {});
    track('onboarding_step_completed', { step: 1, skipped: false, workspace_id: ws.id });
    adopt({ ...ws, logo_url: logo, onboarding_state });
  };

  return (
    <form id="step-form" onSubmit={submit}>
      <Header title="Create your workspace" description="This is where your team, numbers and leads live. You can change all of it later." />
      <div className="card flex flex-col gap-5 p-6">
        <Field label="Workspace name" htmlFor="ws-name">
          <div className="flex items-center gap-2">
            <CompanyLogo name={name} src={logo} size={36} />
            <Input id="ws-name" value={name} maxLength={80} onChange={(e) => { setName(e.target.value); setTouched(true); }} />
          </div>
        </Field>
        <Field label="Company website" htmlFor="ws-site" hint="We use it to fetch your logo and name.">
          <Input id="ws-site" type="url" placeholder="https://yourcompany.co.uk" value={website} onChange={(e) => setWebsite(e.target.value)} onBlur={(e) => lookup(e.target.value)} />
        </Field>
        <Field label="Team size">
          <PillSelect single options={opts(TEAM_SIZES)} value={[teamSize]} onChange={(v) => setTeamSize(v[0])} />
        </Field>
        <Field label="Your role">
          <PillSelect single options={opts(ROLES)} value={[role]} onChange={(v) => setRole(v[0])} />
        </Field>
      </div>
      <ErrorNote>{error}</ErrorNote>
      <Footer>
        <Button type="submit" form="step-form" variant="primary" loading={busy}>
          Continue
        </Button>
      </Footer>
    </form>
  );
}

// ----------------------------------------------------------------- step 2 ---
const CATEGORIES = ['SaaS', 'Agency', 'Recruitment', 'Professional services', 'Manufacturing', 'Logistics', 'Finance', 'Other'];
const DEAL_SIZES = ['<£1k', '£1–5k', '£5–25k', '£25k+'];
const MOTIONS = [
  { id: 'Founder-led', icon: User, description: 'The founders do the calling.' },
  { id: 'SDR team', icon: Users, description: 'Reps book meetings for closers.' },
  { id: 'Full-cycle AEs', icon: Rocket, description: 'Reps prospect and close.' },
];

export function BusinessStep({ workspace, state, done }: StepProps) {
  const short = !!state.short; // free-mail sign-ups with no website get the shorter version
  const [form, setForm] = useState({ what_we_sell: '', category: 'SaaS', avg_deal_size: '£1–5k', sales_motion: 'Founder-led', markets: ['UK'] as string[] });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void supabase()
      .from('business_profiles')
      .select('*')
      .eq('workspace_id', workspace.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.what_we_sell || data?.category) {
          setForm((f) => ({
            what_we_sell: data.what_we_sell ?? '',
            category: data.category ?? f.category,
            avg_deal_size: data.avg_deal_size ?? f.avg_deal_size,
            sales_motion: data.sales_motion ?? f.sales_motion,
            markets: data.markets?.length ? data.markets : f.markets,
          }));
        }
      });
  }, [workspace.id]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.what_we_sell.trim()) return setError('Tell us in one line what you sell.');
    if (!form.markets.length) return setError('Pick at least one market.');
    setBusy(true);
    const { error } = await supabase()
      .from('business_profiles')
      .upsert({ workspace_id: workspace.id, ...form, what_we_sell: form.what_we_sell.trim(), updated_at: new Date().toISOString() });
    if (error) {
      setError(error.message);
      setBusy(false);
      return;
    }
    await done();
  };

  const strict = form.markets.includes('DACH');
  return (
    <form id="step-form" onSubmit={submit}>
      <Header title="About your business" description="We use this to suggest who to call and to keep you inside each country's calling rules." />
      <div className="card flex flex-col gap-5 p-6">
        <Field label="What do you sell?" htmlFor="sell" hint="One line is plenty.">
          <Input id="sell" placeholder="Payroll software for care homes" value={form.what_we_sell} maxLength={160} onChange={(e) => setForm({ ...form, what_we_sell: e.target.value })} />
        </Field>
        <Field label="Category">
          <PillSelect single options={opts(CATEGORIES)} value={[form.category]} onChange={(v) => setForm({ ...form, category: v[0] })} />
        </Field>
        {!short ? (
          <>
            <Field label="Average deal size">
              <PillSelect single options={opts(DEAL_SIZES)} value={[form.avg_deal_size]} onChange={(v) => setForm({ ...form, avg_deal_size: v[0] })} />
            </Field>
            <Field label="Sales motion">
              <div className="flex flex-col gap-2" role="radiogroup">
                {MOTIONS.map((m) => (
                  <OptionCard key={m.id} icon={m.icon} title={m.id} description={m.description} selected={form.sales_motion === m.id} onSelect={() => setForm({ ...form, sales_motion: m.id })} />
                ))}
              </div>
            </Field>
          </>
        ) : null}
        <Field label="Markets you sell into" hint={strict ? <span className="text-warning-700">Germany and Austria need presumed consent for B2B calls. Take local advice first.</span> : 'Limits which countries appear in your lead search.'}>
          <PillSelect options={opts(Object.keys(MARKETS))} value={form.markets} onChange={(v) => setForm({ ...form, markets: v })} />
        </Field>
      </div>
      <ErrorNote>{error}</ErrorNote>
      <Footer>
        <Button type="submit" form="step-form" variant="primary" loading={busy}>
          Continue
        </Button>
      </Footer>
    </form>
  );
}

// ----------------------------------------------------------------- step 3 ---
export function IcpStep({ workspace, user, done }: StepProps) {
  const db = supabase();
  const [icpId, setIcpId] = useState<string | null>(null);
  const [industries, setIndustries] = useState<string[]>([]);
  const [sizes, setSizes] = useState<CompanySizeBand[]>([]);
  const [countries, setCountries] = useState<string[]>(['GB']);
  const [titles, setTitles] = useState<string[]>([]);
  const [seniorities, setSeniorities] = useState<Seniority[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ count: number; preview: ContactPublic[] } | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  const { data: industryOptions } = useQuery({
    queryKey: ['industries'],
    queryFn: async () => ((await db.from('industries').select('name').order('name')).data ?? []).map((i) => i.name as string),
    staleTime: Infinity,
  });

  useEffect(() => {
    void (async () => {
      const [{ data: icp }, { data: bp }] = await Promise.all([
        db.from('icp_profiles').select('*').eq('workspace_id', workspace.id).eq('is_default', true).maybeSingle(),
        db.from('business_profiles').select('markets').eq('workspace_id', workspace.id).maybeSingle(),
      ]);
      if (icp) {
        setIcpId(icp.id);
        setIndustries(icp.industries ?? []);
        setSizes(icp.company_sizes ?? []);
        setCountries(icp.countries?.length ? icp.countries : ['GB']);
        setTitles(icp.job_titles ?? []);
        setSeniorities(icp.seniorities ?? []);
      } else if (bp?.markets?.length) {
        setCountries([...new Set((bp.markets as string[]).flatMap((m) => MARKETS[m] ?? []))]);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace.id]);

  const filters: LeadFilters = { industries, sizes, countries, titles, seniorities, hasMobile: true };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const row = { workspace_id: workspace.id, name: 'My ICP', industries, company_sizes: sizes, countries, job_titles: titles, seniorities, is_default: true };
    const res = icpId ? await db.from('icp_profiles').update(row).eq('id', icpId).select('id').single() : await db.from('icp_profiles').insert(row).select('id').single();
    if (res.error) {
      setError(res.error.message);
      setBusy(false);
      return;
    }
    setIcpId(res.data.id);
    // the ICP search is saved as "My ICP" so it is one click away on the Leads page
    await db.from('saved_searches').delete().eq('workspace_id', workspace.id).eq('user_id', user.id).eq('name', 'My ICP');
    await db.from('saved_searches').insert({ workspace_id: workspace.id, user_id: user.id, name: 'My ICP', filters });

    const [{ count }, { data: preview }] = await Promise.all([
      applyLeadFilters(db.from('contacts_public').select('id', { count: 'exact', head: true }), filters),
      applyLeadFilters(db.from('contacts_public').select('*'), filters).order('last_verified_at', { ascending: false }).limit(5),
    ]);
    track('search_run', { filters, result_count: count ?? 0 });
    setResult({ count: count ?? 0, preview: (preview ?? []) as ContactPublic[] });
    setBusy(false);
  };

  return (
    <form id="step-form" onSubmit={save}>
      <Header title="Your ideal customer" description="Describe who you want to call. We search the database and line up matching contacts for your first session." />
      <div className="card flex flex-col gap-5 p-6">
        <Field label="Industries">
          {industryOptions ? (
            <PillSelect options={opts(industryOptions)} value={industries} onChange={(v) => { setIndustries(v); setResult(null); }} />
          ) : (
            <div className="flex min-h-[112px] flex-wrap content-start gap-2" aria-busy>
              {[150, 190, 180, 170, 150, 130, 170, 120, 110, 170, 110, 160].map((w, i) => (
                <Skeleton key={i} className="h-8" style={{ width: w }} />
              ))}
            </div>
          )}
        </Field>
        <Field label="Company size (employees)">
          <PillSelect options={SIZE_BANDS.map((s) => ({ value: s, label: s }))} value={sizes} onChange={(v) => { setSizes(v); setResult(null); }} />
        </Field>
        <Field label="Countries">
          <PillSelect options={COUNTRIES.map((c) => ({ value: c.code, label: c.name }))} value={countries} onChange={(v) => { setCountries(v); setResult(null); }} />
        </Field>
        <Field label="Job titles" htmlFor="icp-titles" hint="Type a title and press Enter.">
          <ChipsInput id="icp-titles" value={titles} onChange={(v) => { setTitles(v); setResult(null); }} placeholder="CEO, Head of Sales…" suggestions={JOB_TITLE_SUGGESTIONS} />
        </Field>
        <Field label="Seniority">
          <PillSelect options={SENIORITIES} value={seniorities} onChange={(v) => { setSeniorities(v); setResult(null); }} />
        </Field>
      </div>

      {result ? (
        <div className="card mt-4 p-4" aria-live="polite">
          <div className="flex items-center justify-between gap-3">
            <p className="t-h4">
              We found {result.count.toLocaleString('en-GB')} matching contact{result.count === 1 ? '' : 's'}
            </p>
            {result.count ? (
              <button type="button" className="link" onClick={() => setShowPreview((s) => !s)}>
                {showPreview ? 'Hide preview' : 'Preview'}
              </button>
            ) : null}
          </div>
          {result.count === 0 ? <p className="mt-1 text-black-700">Loosen a filter to see more. The MVP database holds sample UK data.</p> : null}
          {showPreview ? (
            <ul className="mt-3 divide-y divide-white-800 border-t border-white-800">
              {result.preview.map((c) => (
                <li key={c.id} className="flex h-10 items-center gap-3">
                  <span className="min-w-0 flex-1 truncate">{c.full_name}</span>
                  <span className="hidden min-w-0 flex-1 truncate text-black-700 sm:block">{c.job_title}</span>
                  <span className="min-w-0 flex-1 truncate text-black-700">{c.company_name}</span>
                  <span className="t-mono text-black-700">{c.mobile_masked}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      <ErrorNote>{error}</ErrorNote>
      <Footer back="business">
        {result ? (
          <Button variant="primary" onClick={() => done()}>
            Continue
          </Button>
        ) : (
          <Button type="submit" form="step-form" variant="primary" loading={busy}>
            Find matching contacts
          </Button>
        )}
      </Footer>
    </form>
  );
}

// ----------------------------------------------------------------- step 4 ---
export function NumberStep({ workspace, user, done }: StepProps) {
  const [option, setOption] = useState<'buy' | 'verify'>('verify');
  const [number, setNumber] = useState<PhoneNumber | null>(null);
  const { data: existing } = useQuery({
    queryKey: ['numbers', workspace.id],
    queryFn: async () => ((await supabase().from('phone_numbers').select('*').eq('workspace_id', workspace.id).neq('status', 'released')).data ?? []) as PhoneNumber[],
  });
  const active = number?.status === 'active' ? number : existing?.find((n) => n.status === 'active');
  const pending = existing?.find((n) => n.status === 'pending_review');

  return (
    <div>
      <Header title="Get your number" description="People you call see this number and can call it back. Buy a new one, or use a number you already own." />
      {/* status slot keeps its height in every state so the cards below never move */}
      <div className="mb-4 flex min-h-[54px] items-center gap-3 border border-white-800 bg-white-100 px-4" aria-live="polite">
        {!existing ? (
          <Skeleton className="w-64" />
        ) : active ? (
          <>
            <BadgeCheck size={18} strokeWidth={1.5} className="shrink-0 text-success-500" />
            <p>
              You are set up to call from <span className="tabular-nums">{formatPhone(active.e164)}</span>.
            </p>
          </>
        ) : pending ? (
          <p className="text-warning-700">
            <span className="tabular-nums">{formatPhone(pending.e164)}</span> is being reviewed by Twilio. Verify your own number below to call meanwhile.
          </p>
        ) : (
          <p className="text-black-700">No number yet. Pick an option below.</p>
        )}
      </div>
      <div className="flex flex-col gap-2" role="radiogroup">
        <OptionCard
          icon={Hand}
          title="Use my existing number as caller ID"
          description="Twilio calls you, you key in a code, and you can call straight away."
          selected={option === 'verify'}
          onSelect={() => setOption('verify')}
          badge={<Badge tone="success">Instant</Badge>}
          radio
        />
        <OptionCard
          icon={Building2}
          title="Buy a Decibel number"
          description="A UK local, national or mobile number for your workspace. Some need a business address check first."
          selected={option === 'buy'}
          onSelect={() => setOption('buy')}
          radio
        />
      </div>
      <div className="card mt-4 p-6">
        {option === 'buy' ? (
          <>
            {!user.emailConfirmed ? (
              <p className="mb-4 rounded-md border border-white-800 bg-warning-100 p-3 text-warning-700">Verify your email address before buying a number. You can still search, or verify your own number instead.</p>
            ) : null}
            <BuyNumberPanel workspaceId={workspace.id} onDone={setNumber} />
          </>
        ) : (
          <VerifyCallerIdPanel workspaceId={workspace.id} onDone={setNumber} />
        )}
      </div>
      <Footer back="icp">
        <Button variant="primary" disabled={!active && !number} onClick={() => done()}>
          Continue
        </Button>
      </Footer>
    </div>
  );
}

// ----------------------------------------------------------------- step 5 ---
export function TestStep({ workspace, profile, invited, done }: StepProps) {
  const softphone = useSoftphoneActions();
  const [mic, setMic] = useState(false);
  const [mobile, setMobile] = useState(profile.mobile_e164 ? formatPhone(profile.mobile_e164) : '');
  const [mobileCountry, setMobileCountry] = useState<DialCountry>(() => countryFromInternational(profile.mobile_e164 ?? '') ?? DEFAULT_DIAL_COUNTRY);
  const [status, setStatus] = useState<'idle' | 'calling' | 'passed' | 'failed'>('idle');
  const [error, setError] = useState<string | null>(null);
  const { data: numbers } = useQuery({
    queryKey: ['numbers', workspace.id],
    queryFn: async () => ((await supabase().from('phone_numbers').select('*').eq('workspace_id', workspace.id).eq('status', 'active')).data ?? []) as PhoneNumber[],
  });
  const hasCaller = (numbers?.length ?? 0) > 0;

  const call = async () => {
    const e164 = toE164(mobile, mobileCountry);
    if (!e164) return setError('Enter your mobile number, for example 07700 900123.');
    setError(null);
    setStatus('calling');
    void supabase().from('profiles').update({ mobile_e164: e164 }).eq('id', profile.id);
    const ok = await softphone.testCall(e164);
    setStatus(ok ? 'passed' : 'failed');
  };

  return (
    <div>
      <Header title="Test your setup" description="Check your microphone, then call your own mobile. You should hear: “This is Decibel. Your setup works.”" />
      <div className="flex flex-col gap-4">
        <MicTest onReady={setMic} />
        <div className="card p-4">
          <div className="flex items-center gap-2">
            <Phone size={16} strokeWidth={1.5} />
            <p className="t-h4">Test call</p>
            {status === 'passed' ? <Badge tone="success">Working</Badge> : null}
            {status === 'failed' ? <Badge tone="warning">Not answered</Badge> : null}
          </div>
          {!numbers ? (
            <div className="mt-3 flex flex-col gap-2" aria-busy>
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-9 w-full" />
            </div>
          ) : !hasCaller ? (
            <p className="mt-2 text-black-700">
              You need a number or a verified caller ID before you can place a call.{' '}
              {invited ? 'Ask a workspace admin to add one.' : (
                <Link href="/onboarding/number" className="link">
                  Go back to step 4
                </Link>
              )}
            </p>
          ) : (
            <>
              <Field className="mt-3" label="Your mobile number" htmlFor="test-mobile" error={error}>
                <div className="flex gap-2">
                  <PhoneInput id="test-mobile" value={mobile} onChange={setMobile} country={mobileCountry} onCountryChange={setMobileCountry} />
                  <Button variant={status === 'passed' ? 'outline' : 'primary'} onClick={call} disabled={!mic || status === 'calling'} loading={status === 'calling'}>
                    <Mic size={16} strokeWidth={1.5} /> {status === 'passed' || status === 'failed' ? 'Call again' : 'Call my mobile'}
                  </Button>
                </div>
              </Field>
              {!mic ? <p className="t-caption mt-2 text-black-700">Allow the microphone above first.</p> : null}
              {status === 'failed' ? <p className="mt-2 text-black-700">The call did not connect or was not answered. Check the number and try again, or skip and test later from Settings.</p> : null}
            </>
          )}
        </div>
      </div>
      <Footer back={invited ? undefined : 'number'}>
        <Button variant="primary" disabled={status !== 'passed'} onClick={() => done()}>
          {invited ? 'Open Decibel' : 'Continue'}
        </Button>
      </Footer>
    </div>
  );
}

// ----------------------------------------------------------------- step 6 ---
const POLICIES: { id: RecordingPolicy; title: string; description: string; icon: typeof Mic }[] = [
  { id: 'always', title: 'Always record', description: 'Every call is recorded. The notice plays to the person you call when they answer.', icon: Mic },
  { id: 'rep_choice', title: "Rep's choice", description: 'Each rep switches recording on in the softphone. The notice plays whenever it is on.', icon: Hand },
  { id: 'never', title: 'Never record', description: 'Calls are logged with outcome and duration, but no audio is kept.', icon: CircleOff },
];

export function ComplianceStep({ workspace, done }: StepProps) {
  const [acks, setAcks] = useState([false, false, false]);
  const [policy, setPolicy] = useState<RecordingPolicy>(workspace.recording_policy);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toggle = (i: number) => (v: boolean) => setAcks((a) => a.map((x, j) => (j === i ? v : x)));

  const submit = async () => {
    setBusy(true);
    const { error } = await supabase().from('workspaces').update({ recording_policy: policy }).eq('id', workspace.id);
    if (error) {
      setError(error.message);
      setBusy(false);
      return;
    }
    await done({ compliance_ack_at: new Date().toISOString(), recording_policy: policy });
  };

  return (
    <div>
      <Header title="Compliance" description="Three things we need you to confirm before your team starts calling. Decibel enforces the first two in code." />
      <div className="card flex flex-col gap-4 p-6">
        <Checkbox checked={acks[0]} onChange={toggle(0)} label="We will only call business contacts under legitimate interest, and we keep a record of that assessment." />
        <Checkbox checked={acks[1]} onChange={toggle(1)} label="We understand numbers are screened against TPS and CTPS before dialling, and listed numbers are blocked." />
        <Checkbox checked={acks[2]} onChange={toggle(2)} label="We understand calls may be recorded, and that the person we call is told when they are." />
      </div>
      <h2 className="t-h4 mb-2 mt-6">Call recording</h2>
      <div className="flex flex-col gap-2" role="radiogroup" aria-label="Recording policy">
        {POLICIES.map((p) => (
          <OptionCard key={p.id} icon={p.icon} title={p.title} description={p.description} selected={policy === p.id} onSelect={() => setPolicy(p.id)} radio />
        ))}
      </div>
      <p className="mt-4 text-black-700">
        Read our <Link href="/dpa" target="_blank" className="link">Data Processing Agreement</Link> and download a{' '}
        <a href="/lia-template.txt" className="link">Legitimate Interests Assessment template</a> for your records. This is product guidance, not legal advice.
      </p>
      <ErrorNote>{error}</ErrorNote>
      <Footer back="test">
        <Button variant="primary" disabled={!acks.every(Boolean)} loading={busy} onClick={submit}>
          Continue
        </Button>
      </Footer>
    </div>
  );
}

// ----------------------------------------------------------------- step 7 ---
const CRMS = ['HubSpot', 'Salesforce', 'Attio'];

export function InviteStep({ workspace, user, done }: StepProps) {
  const [emails, setEmails] = useState<string[]>([]);
  const [role, setRole] = useState<WorkspaceRole>('member');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [links, setLinks] = useState<{ email: string; link: string }[]>([]);

  const finish = async () => {
    setBusy(true);
    setError(null);
    const db = supabase();
    const unsent: { email: string; link: string }[] = [];
    for (const email of emails.filter((e) => e.toLowerCase() !== user.email.toLowerCase())) {
      const { data, error } = await db
        .from('invitations')
        .insert({ workspace_id: workspace.id, email, role, invited_by: user.id })
        .select('id,token')
        .single();
      if (error) {
        if (!/duplicate|unique/i.test(error.message)) setError(error.message);
        continue;
      }
      track('invite_sent', { role });
      const fallback = `${window.location.origin}/invite/${data.token}`;
      try {
        const res = await invoke<{ sent: boolean; link: string }>('send-email', { type: 'invite', invitation_id: data.id });
        if (!res.sent) unsent.push({ email, link: fallback });
      } catch {
        unsent.push({ email, link: fallback });
      }
    }
    if (unsent.length && !links.length) {
      // email is not configured: surface the links once so the owner can share them
      setLinks(unsent);
      setBusy(false);
      return;
    }
    await done();
  };

  return (
    <div>
      <Header title="Invite your team" description="Each rep gets their own login and call history. You only pay for seats once your trial ends." />
      <div className="card flex flex-col gap-5 p-6">
        <Field label="Email addresses" htmlFor="invite-emails" hint="Press Enter after each address, or paste a list.">
          <ChipsInput id="invite-emails" value={emails} onChange={setEmails} placeholder="priya@yourcompany.co.uk" validate={(v) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)} />
        </Field>
        <Field label="Role" htmlFor="invite-role" className="max-w-[240px]">
          <Select id="invite-role" value={role} onChange={(e) => setRole(e.target.value as WorkspaceRole)}>
            <option value="member">Member: calls and their own lists</option>
            <option value="admin">Admin: everything except billing</option>
          </Select>
        </Field>
      </div>
      {links.length ? (
        <div className="card mt-4 p-4">
          <p className="t-h4">Share these invite links</p>
          <p className="mt-1 text-black-700">Email sending is not connected yet, so send these links yourself. They expire in 7 days.</p>
          <ul className="mt-3 flex flex-col gap-2">
            {links.map((l) => (
              <li key={l.email} className="flex items-center gap-2">
                <span className="w-48 shrink-0 truncate">{l.email}</span>
                <Input readOnly value={l.link} className="tabular-nums" onFocus={(e) => e.currentTarget.select()} />
                <Button size="compact" onClick={() => navigator.clipboard.writeText(l.link)}>
                  Copy
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <h2 className="t-h4 mb-2 mt-6">Connect your CRM</h2>
      <div className="grid gap-2 sm:grid-cols-3">
        {CRMS.map((c) => (
          <div key={c} className="card flex items-center justify-between p-4">
            <span className="t-h4">{c}</span>
            <Badge>Coming soon</Badge>
          </div>
        ))}
      </div>
      <ErrorNote>{error}</ErrorNote>
      <Footer back="compliance">
        <Button variant="primary" loading={busy} onClick={links.length ? () => done() : finish}>
          {emails.length && !links.length ? 'Send invites and finish' : 'Finish setup'}
        </Button>
      </Footer>
    </div>
  );
}
