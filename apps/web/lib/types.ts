// Row types mirroring supabase/migrations (0001 + 0003). Hand-written so the
// repo builds without database access; regenerate with `supabase gen types` if preferred.
export type WorkspaceRole = 'owner' | 'admin' | 'member';
export type PlanTier = 'trial' | 'starter' | 'growth' | 'scale';
export type RecordingPolicy = 'always' | 'rep_choice' | 'never';
export type Seniority = 'c_level' | 'vp' | 'director' | 'manager' | 'ic' | 'owner';
export type CompanySizeBand = '1-10' | '11-50' | '51-200' | '201-500' | '501-1000' | '1001-5000' | '5001+';
export type TpsStatus = 'unchecked' | 'clear' | 'tps_listed' | 'ctps_listed';
export type CallStatus =
  | 'queued' | 'initiated' | 'ringing' | 'in_progress' | 'completed'
  | 'busy' | 'no_answer' | 'failed' | 'canceled' | 'blocked';
export type CallOutcome =
  | 'connected' | 'no_answer' | 'voicemail' | 'busy' | 'wrong_number'
  | 'meeting_booked' | 'not_interested' | 'call_back' | 'do_not_call';
export type PhoneNumberKind = 'twilio_local' | 'twilio_national' | 'twilio_mobile' | 'verified_caller_id';
export type PhoneNumberStatus = 'pending_bundle' | 'pending_review' | 'active' | 'rejected' | 'released';
export type ActivityKind =
  | 'call' | 'note' | 'task_created' | 'task_completed' | 'stage_changed'
  | 'revealed' | 'imported' | 'created' | 'assigned';

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  avatar_url: string | null;
  last_workspace_id: string | null;
  timezone: string;
  mobile_e164?: string | null;
  notification_prefs?: Record<string, boolean>;
  created_at: string;
}

export interface OnboardingState {
  step: number;
  completed?: number[];
  skipped?: number[];
  role?: string;
  started_at?: string;
  [key: string]: unknown;
}

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  website: string | null;
  logo_url: string | null;
  team_size: string | null;
  created_by: string;
  twilio_account_mode?: 'pending' | 'subaccount' | 'parent';
  recording_policy: RecordingPolicy;
  recording_notice_text: string;
  art14_notice_text?: string;
  stripe_customer_id: string | null;
  plan: PlanTier;
  trial_ends_at: string;
  credit_balance: number;
  minute_balance_seconds: number;
  daily_reveal_limit?: number;
  onboarding_state: OnboardingState;
  onboarding_completed_at: string | null;
  created_at: string;
}

export interface Member {
  workspace_id: string;
  user_id: string;
  role: WorkspaceRole;
  daily_credit_limit: number | null;
  joined_at: string;
  profile?: Pick<Profile, 'id' | 'email' | 'full_name' | 'avatar_url'>;
}

export interface Invitation {
  id: string;
  workspace_id: string;
  email: string;
  role: WorkspaceRole;
  token: string;
  status: 'pending' | 'accepted' | 'revoked' | 'expired';
  invited_by: string;
  expires_at: string;
  created_at: string;
}

export interface PhoneNumber {
  id: string;
  workspace_id: string;
  e164: string;
  friendly_name: string | null;
  country_code: string;
  kind: PhoneNumberKind;
  status: PhoneNumberStatus;
  assigned_user_id: string | null;
  is_default: boolean;
  monthly_cost_pence: number;
  regulatory_bundle_sid: string | null;
  created_at: string;
}

export interface ContactPublic {
  id: string;
  company_id: string | null;
  first_name: string;
  last_name: string;
  full_name: string;
  job_title: string | null;
  seniority: Seniority | null;
  department: string | null;
  country_code: string;
  city: string | null;
  region: string | null;
  has_email: boolean;
  has_mobile: boolean;
  mobile_masked: string | null;
  tps_status: TpsStatus;
  last_verified_at: string | null;
  company_name: string | null;
  company_domain: string | null;
  company_size_band: CompanySizeBand | null;
  industry: string | null;
}

export interface TenantCompany {
  id: string;
  workspace_id: string;
  source_company_id: string | null;
  name: string;
  domain: string | null;
  industry: string | null;
  size_band: CompanySizeBand | null;
  country_code: string | null;
  city: string | null;
  linkedin_url: string | null;
  notes: string | null;
  owner_id: string | null;
  created_at: string;
}

export interface PipelineStage {
  id: string;
  workspace_id: string;
  name: string;
  position: number;
  is_won: boolean;
  is_lost: boolean;
}

export interface Person {
  id: string;
  workspace_id: string;
  source_contact_id: string | null;
  tenant_company_id: string | null;
  first_name: string;
  last_name: string;
  full_name: string;
  job_title: string | null;
  seniority: Seniority | null;
  email: string | null;
  mobile_e164: string | null;
  direct_dial_e164: string | null;
  linkedin_url: string | null;
  country_code: string | null;
  city: string | null;
  tps_status: TpsStatus;
  do_not_call: boolean;
  owner_id: string | null;
  stage_id: string | null;
  tags: string[];
  priority: number;
  last_called_at: string | null;
  last_outcome: CallOutcome | null;
  call_count: number;
  next_call_at: string | null;
  source: string;
  created_at: string;
  company?: Pick<TenantCompany, 'id' | 'name' | 'domain'> | null;
}

export interface List {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  default_view: 'table' | 'kanban';
  is_shared: boolean;
  script: string | null;
  owner_id: string;
  created_at: string;
  updated_at: string;
}

export interface Call {
  id: string;
  workspace_id: string;
  user_id: string | null;
  person_id: string | null;
  list_id: string | null;
  direction: 'outbound' | 'inbound';
  kind: 'standard' | 'test' | 'voicemail';
  from_e164: string | null;
  to_e164: string;
  status: CallStatus;
  outcome: CallOutcome | null;
  twilio_call_sid: string | null;
  twilio_child_call_sid: string | null;
  blocked_reason: string | null;
  started_at: string;
  answered_at: string | null;
  ended_at: string | null;
  duration_seconds: number;
  talk_seconds: number;
  notes: string | null;
  person?: (Pick<Person, 'id' | 'full_name' | 'job_title'> & { company?: Pick<TenantCompany, 'id' | 'name'> | null }) | null;
  recording?: Recording | Recording[] | null;
}

export interface Recording {
  id: string;
  call_id: string;
  storage_path: string;
  duration_seconds: number;
}

export interface Note {
  id: string;
  workspace_id: string;
  person_id: string | null;
  tenant_company_id: string | null;
  call_id: string | null;
  author_id: string | null;
  body: string;
  created_at: string;
}

export interface Task {
  id: string;
  workspace_id: string;
  person_id: string | null;
  assignee_id: string | null;
  created_by: string | null;
  title: string;
  due_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface Activity {
  id: number;
  workspace_id: string;
  person_id: string | null;
  actor_id: string | null;
  kind: ActivityKind;
  call_id: string | null;
  note_id: string | null;
  task_id: string | null;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface Subscription {
  workspace_id: string;
  plan: PlanTier;
  status: 'trialing' | 'active' | 'past_due' | 'canceled' | 'paused' | 'incomplete';
  seats: number;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
}
