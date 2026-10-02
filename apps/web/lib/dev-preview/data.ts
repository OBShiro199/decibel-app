// Sample data for the local design preview (/dev-preview). Fictional people and
// Ofcom drama-range numbers only. Never used in production.
const WS = '00000000-0000-4000-8000-0000000000aa';
const ME = '00000000-0000-4000-8000-0000000000u1';
const PRIYA = '00000000-0000-4000-8000-0000000000u2';
const ago = (days: number, h = 0) => new Date(Date.now() - days * 86400000 - h * 3600000).toISOString();
const day = (d: number) => new Date(Date.now() - d * 86400000).toISOString().slice(0, 10);

export const ids = { WS, ME, PRIYA };

export const workspace = {
  id: WS, name: "Oliver's Test Team", slug: 'olivers-test-team', website: null, logo_url: null, team_size: '2–5', created_by: ME,
  twilio_account_mode: 'subaccount', recording_policy: 'always', recording_notice_text: 'This call may be recorded for quality and training purposes.',
  art14_notice_text: 'We hold your business contact details under legitimate interest.', stripe_customer_id: null, plan: 'trial',
  trial_ends_at: ago(-9), credit_balance: 42, minute_balance_seconds: 2840, daily_reveal_limit: 300,
  onboarding_state: { step: 7, completed: [1, 2, 3, 4, 5, 6, 7] }, onboarding_completed_at: ago(2), created_at: ago(5),
};
export const profile = { id: ME, email: 'oliver@example.co.uk', full_name: 'Oliver Burt', avatar_url: null, last_workspace_id: WS, timezone: 'Europe/London', mobile_e164: '+447700900001', notification_prefs: {}, created_at: ago(5) };
const priyaProfile = { id: PRIYA, email: 'priya@example.co.uk', full_name: 'Priya Shah', avatar_url: null };
export const members = [
  { workspace_id: WS, user_id: ME, role: 'owner', daily_credit_limit: null, joined_at: ago(5), profile: { id: ME, email: profile.email, full_name: profile.full_name, avatar_url: null } },
  { workspace_id: WS, user_id: PRIYA, role: 'member', daily_credit_limit: 50, joined_at: ago(3), profile: priyaProfile },
];

const INDUSTRY = ['Software & SaaS', 'Marketing & Advertising', 'Recruitment & Staffing', 'Professional Services', 'Financial Services', 'Manufacturing', 'Logistics & Transport', 'Construction', 'Healthcare', 'Retail & E-commerce', 'Hospitality', 'Education & Training'];
export const industries = INDUSTRY.map((name) => ({ name }));

const SEED: [string, string, string, string, string, string, string, string, string][] = [
  ['Oliver', 'Hartley', 'Chief Executive Officer', 'c_level', 'Brightmoor Software Ltd', 'brightmoor.co.uk', 'Software & SaaS', '51-200', 'Manchester'],
  ['Priya', 'Raman', 'Managing Director', 'c_level', 'Harrow & Finch Recruitment', 'harrowfinch.com', 'Recruitment & Staffing', '11-50', 'London'],
  ['James', 'Whitfield', 'Operations Director', 'director', 'Northgate Logistics Group', 'northgatelogistics.co.uk', 'Logistics & Transport', '201-500', 'Leeds'],
  ['Sarah', 'Okafor', 'Head of Sales', 'director', 'Pennine Precision Engineering', 'pennineprecision.co.uk', 'Manufacturing', '51-200', 'Sheffield'],
  ['Tom', 'Bradshaw', 'Founder', 'owner', 'Cobalt Digital Agency', 'cobaltdigital.agency', 'Marketing & Advertising', '11-50', 'Bristol'],
  ['Fiona', 'MacLeod', 'Partner', 'c_level', 'Thistle Financial Planning', 'thistlefp.co.uk', 'Financial Services', '11-50', 'Edinburgh'],
  ['Daniel', 'Evans', 'Practice Manager', 'manager', 'Riverside Dental Group', 'riversidedental.co.uk', 'Healthcare', '51-200', 'Cardiff'],
  ['Charlotte', 'Nkemelu', 'Commercial Director', 'director', 'Ashdown Build Ltd', 'ashdownbuild.co.uk', 'Construction', '51-200', 'Birmingham'],
  ['Rahul', 'Mehta', 'Chief Technology Officer', 'c_level', 'Kestrel Analytics', 'kestrelanalytics.io', 'Software & SaaS', '11-50', 'Cambridge'],
  ['Gary', 'Marlow', 'Owner', 'owner', 'Marlow & Sons Haulage', 'marlowhaulage.co.uk', 'Logistics & Transport', '11-50', 'Nottingham'],
  ['Emily', 'Chen', 'Head of Partnerships', 'director', 'Oakhurst Learning', 'oakhurstlearning.com', 'Education & Training', '11-50', 'Oxford'],
  ['Michael', 'Fenwick', 'Managing Partner', 'c_level', 'Fenwick Legal LLP', 'fenwicklegal.co.uk', 'Professional Services', '51-200', 'Newcastle'],
  ['Hannah', 'Sutherland', 'Group Revenue Manager', 'manager', 'Saltmarsh Hotels', 'saltmarshhotels.co.uk', 'Hospitality', '201-500', 'Norwich'],
  ['Andrew', 'Patel', 'VP Operations', 'vp', 'Beacon Retail Group', 'beaconretail.co.uk', 'Retail & E-commerce', '501-1000', 'Glasgow'],
  ['Laura', 'Jennings', 'Director', 'director', 'Lumen Payroll Services', 'lumenpayroll.co.uk', 'Financial Services', '11-50', 'Reading'],
  ['Ben', 'Carter', 'Business Development Manager', 'manager', 'Greystone Property Management', 'greystonepm.co.uk', 'Professional Services', '11-50', 'Liverpool'],
  ['Aisling', 'Doherty', 'Chief Executive Officer', 'c_level', 'Vantage Cyber Ltd', 'vantagecyber.co.uk', 'Software & SaaS', '11-50', 'Belfast'],
  ['Robert', 'Hughes', 'Sales Manager', 'manager', 'Harbourline Marine Supplies', 'harbourline.co.uk', 'Manufacturing', '11-50', 'Southampton'],
  ['Grace', 'Adebayo', 'Head of Procurement', 'director', 'Meadowbrook Care Homes', 'meadowbrookcare.co.uk', 'Healthcare', '201-500', 'Leicester'],
  ['Jack', 'Morrison', 'Founder & Creative Director', 'owner', 'Pixelforge Studios', 'pixelforge.studio', 'Marketing & Advertising', '1-10', 'Brighton'],
];
const pad = (n: number) => String(n).padStart(2, '0');
export const contacts = SEED.map(([f, l, title, sen, co, domain, ind, size, city], i) => ({
  id: `22222222-0000-4000-8000-0000000000${pad(i + 1)}`, company_id: `11111111-0000-4000-8000-0000000000${pad(i + 1)}`,
  first_name: f, last_name: l, full_name: `${f} ${l}`, job_title: title, seniority: sen, department: 'Executive', country_code: 'GB', city, region: null,
  has_email: true, has_mobile: true, mobile_masked: `+447 ••••••${100 + i + 1}`.replace('+447 ', '+447 '), tps_status: i === 5 ? 'tps_listed' : 'clear',
  last_verified_at: ago(i + 2), company_name: co, company_domain: domain, company_size_band: size, industry: ind,
}));

const STAGES = ['New', 'Attempted', 'Connected', 'Meeting booked', 'Qualified', 'Won', 'Lost', 'Not interested', 'Wrong number'];
export const stages = STAGES.map((name, i) => ({ id: `33333333-0000-4000-8000-0000000000${pad(i + 1)}`, workspace_id: WS, name, position: i + 1, is_won: name === 'Won', is_lost: ['Lost', 'Not interested', 'Wrong number'].includes(name) }));

export const companies = SEED.slice(0, 10).map((r, i) => ({
  id: `44444444-0000-4000-8000-0000000000${pad(i + 1)}`, workspace_id: WS, source_company_id: null, name: r[4], domain: r[5], industry: r[6], size_band: r[7],
  country_code: 'GB', city: r[8], linkedin_url: null, notes: null, owner_id: ME, created_at: ago(4 - i * 0.2), people: [{ count: 1 }],
}));

const OUTCOME = ['connected', 'no_answer', 'meeting_booked', 'voicemail', null, 'call_back', 'not_interested', null, 'no_answer', null];
export const people = SEED.slice(0, 10).map((r, i) => ({
  id: `55555555-0000-4000-8000-0000000000${pad(i + 1)}`, workspace_id: WS, source_contact_id: contacts[i].id, tenant_company_id: companies[i].id,
  first_name: r[0], last_name: r[1], full_name: `${r[0]} ${r[1]}`, job_title: r[2], seniority: r[3], email: `${r[0].toLowerCase()}@${r[5]}`,
  mobile_e164: `+4477009001${pad(i + 1)}`, direct_dial_e164: null, linkedin_url: null, country_code: 'GB', city: r[8],
  tps_status: i === 5 ? 'tps_listed' : 'clear', do_not_call: false, owner_id: i % 3 === 2 ? PRIYA : ME, stage_id: stages[[0, 1, 3, 1, 0, 0, 2, 0, 1, 0][i]].id,
  tags: i === 0 ? ['Warm'] : [], priority: 0, last_called_at: OUTCOME[i] ? ago(i * 0.4 + 0.1) : null, last_outcome: OUTCOME[i], call_count: OUTCOME[i] ? 1 + (i % 3) : 0,
  next_call_at: null, source: 'database', created_at: ago(4, i), company: { id: companies[i].id, name: r[4], domain: r[5] },
}));

const callOutcomes = ['meeting_booked', 'connected', 'no_answer', 'voicemail', 'connected', 'not_interested', 'no_answer', 'call_back', 'connected', 'busy', 'no_answer', 'connected'];
export const calls = callOutcomes.map((outcome, i) => {
  const p = people[i % people.length];
  const dur = outcome === 'connected' || outcome === 'meeting_booked' || outcome === 'call_back' || outcome === 'not_interested' ? 60 + ((i * 47) % 300) : outcome === 'voicemail' ? 34 : 0;
  const id = `66666666-0000-4000-8000-0000000000${pad(i + 1)}`;
  return {
    id, workspace_id: WS, user_id: i % 4 === 3 ? PRIYA : ME, person_id: p.id, list_id: null, phone_number_id: null, direction: i === 6 ? 'inbound' : 'outbound', kind: 'standard',
    from_e164: '+447700900001', to_e164: p.mobile_e164, status: dur ? 'completed' : 'no_answer', outcome, twilio_call_sid: null, twilio_child_call_sid: null, blocked_reason: null,
    started_at: ago(i * 0.35, i), answered_at: dur ? ago(i * 0.35, i) : null, ended_at: ago(i * 0.35, i), duration_seconds: dur, talk_seconds: dur, notes: i === 0 ? 'Keen on a demo next Tuesday. Uses spreadsheets today.' : null,
    person: { id: p.id, full_name: p.full_name, job_title: p.job_title, company: { id: p.tenant_company_id, name: p.company.name } },
    recording: dur > 0 ? [{ id: `r-${i}`, call_id: id, storage_path: `${WS}/${id}.mp3`, duration_seconds: dur }] : [],
  };
});

export const lists = [
  { id: '77777777-0000-4000-8000-000000000001', workspace_id: WS, name: 'Manchester SaaS founders', description: 'Seed to Series A, 10-200 staff', default_view: 'table', is_shared: true, script: null, owner_id: ME, created_at: ago(4), updated_at: ago(0.2), list_members: [{ count: 6 }] },
  { id: '77777777-0000-4000-8000-000000000002', workspace_id: WS, name: 'Logistics directors', description: null, default_view: 'table', is_shared: true, script: null, owner_id: PRIYA, created_at: ago(3), updated_at: ago(1), list_members: [{ count: 3 }] },
  { id: '77777777-0000-4000-8000-000000000003', workspace_id: WS, name: 'Follow-ups this week', description: null, default_view: 'table', is_shared: false, script: null, owner_id: ME, created_at: ago(2), updated_at: ago(2), list_members: [{ count: 0 }] },
];
export const listMembers = people.slice(0, 6).map((p, i) => ({ list_id: lists[0].id, position: i, person: p }));

export const stats = [0, 1, 2, 3, 4].map((d) => ({ workspace_id: WS, user_id: ME, day: day(d), dials: [14, 31, 22, 0, 18][d], connects: [3, 6, 4, 0, 5][d], meetings: [1, 1, 0, 0, 2][d], talk_seconds: [840, 2100, 1300, 0, 1500][d], duration_seconds: 0 }))
  .concat([0, 1, 2].map((d) => ({ workspace_id: WS, user_id: PRIYA, day: day(d), dials: [9, 17, 12][d], connects: [2, 3, 2][d], meetings: [0, 1, 0][d], talk_seconds: [420, 900, 600][d], duration_seconds: 0 })));

export const numbers = [{ id: '88888888-0000-4000-8000-000000000001', workspace_id: WS, e164: '+447700900001', friendly_name: 'Verified caller ID', country_code: 'GB', kind: 'verified_caller_id', status: 'active', assigned_user_id: ME, is_default: true, monthly_cost_pence: 0, regulatory_bundle_sid: null, created_at: ago(4) }];

export const activities = [
  { id: 1, workspace_id: WS, person_id: people[0].id, actor_id: ME, kind: 'call', call_id: calls[0].id, note_id: null, task_id: null, payload: { outcome: 'meeting_booked' }, created_at: ago(0, 1) },
  { id: 2, workspace_id: WS, person_id: people[0].id, actor_id: ME, kind: 'stage_changed', call_id: null, note_id: null, task_id: null, payload: { to: stages[3].id }, created_at: ago(0, 1) },
  { id: 3, workspace_id: WS, person_id: people[0].id, actor_id: ME, kind: 'revealed', call_id: null, note_id: null, task_id: null, payload: {}, created_at: ago(2) },
];

export const creditTx = [
  { id: 1, workspace_id: WS, user_id: ME, delta: 50, reason: 'trial_grant', reference_id: null, note: '14-day trial credits', created_at: ago(5) },
  ...people.slice(0, 8).map((p, i) => ({ id: i + 2, workspace_id: WS, user_id: ME, delta: -1, reason: 'reveal', reference_id: p.source_contact_id, note: null, created_at: ago(4, i) })),
];

export const TABLES: Record<string, unknown[]> = {
  workspaces: [workspace], profiles: [profile, priyaProfile], workspace_members: members, industries, contacts_public: contacts, pipeline_stages: stages,
  tenant_companies: companies, people, calls, lists, list_members: listMembers, call_stats_daily: stats, phone_numbers: numbers, activities,
  credit_transactions: creditTx, business_profiles: [{ workspace_id: WS, markets: ['UK', 'Ireland'], what_we_sell: 'Payroll software', category: 'SaaS' }],
  saved_searches: [{ id: '99999999-0000-4000-8000-000000000001', name: 'My ICP', filters: { hasMobile: true, seniorities: ['c_level'] } }],
  notes: [{ id: 'n1', workspace_id: WS, person_id: people[0].id, call_id: calls[0].id, author_id: ME, body: 'Keen on a demo next Tuesday. Uses spreadsheets today.', created_at: ago(0, 1) }],
  tasks: [{ id: 't1', workspace_id: WS, person_id: people[0].id, assignee_id: ME, created_by: ME, title: 'Send the proposal', due_at: ago(-2), completed_at: null, created_at: ago(0, 1) }],
  recordings: [], subscriptions: [], invitations: [{ id: 'i1', workspace_id: WS, email: 'sam@example.co.uk', role: 'member', token: 'x', status: 'pending', invited_by: ME, expires_at: ago(-6), created_at: ago(1) }],
  dnc_entries: [{ id: 'd1', workspace_id: WS, e164: '+447700900188', reason: 'Requested on call', added_by: ME, created_at: ago(1) }],
  imports: [{ id: 'im1', workspace_id: WS, user_id: ME, storage_path: 'x', filename: 'trade-show-leads.csv', status: 'completed', column_map: {}, row_count: 48, imported_count: 45, skipped_count: 3, error: null, list_id: null, created_at: ago(2), completed_at: ago(2) }],
  icp_profiles: [], usage_reports: [], audit_log: [],
};

export const RPC: Record<string, unknown> = {
  today_queue: people.filter((p) => p.tps_status === 'clear' && p.last_outcome !== 'not_interested'),
  can_dial: [{ allowed: true, reason: null }],
  get_invitation: [],
};
