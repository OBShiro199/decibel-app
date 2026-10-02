import {
  BarChart3,
  Building2,
  CalendarCheck,
  Columns3,
  Grid3x3,
  List,
  ListPlus,
  Mic,
  Pause,
  Phone,
  PhoneOff,
  Search,
  Sun,
  Unlock,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Avatar, Badge, Chip } from '@/components/ui/display';
import { cn } from '@/lib/utils';

// Static, non-interactive product mocks built from the design tokens.
// All people, companies and numbers are fictional (Ofcom drama-reserved range).

const NAV: { label: string; icon: LucideIcon; active?: boolean }[] = [
  { label: 'Today', icon: Sun },
  { label: 'Leads', icon: Search },
  { label: 'People', icon: Users, active: true },
  { label: 'Companies', icon: Building2 },
  { label: 'Lists', icon: List },
  { label: 'Pipeline', icon: Columns3 },
  { label: 'Calls', icon: Phone },
  { label: 'Dashboard', icon: BarChart3 },
];

const TIMELINE: { icon: LucideIcon; title: string; meta: string; body?: string }[] = [
  {
    icon: Phone,
    title: 'Call · Connected · 4:12',
    meta: '2 days ago',
    body: 'Reviewing outbound tooling this quarter. Wants pricing for 12 seats and a follow-up with the sales lead.',
  },
  { icon: CalendarCheck, title: 'Meeting booked', meta: '2 days ago', body: 'Thursday 8 October, 10:30. Invite sent.' },
  { icon: Unlock, title: 'Mobile revealed · 1 credit', meta: '3 days ago' },
  { icon: ListPlus, title: 'Added to list Manchester SaaS founders', meta: '3 days ago' },
];

function RoundControl({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <span className="flex flex-col items-center gap-2">
      <span className="flex h-12 w-12 items-center justify-center rounded-full border border-white-800 bg-white-100 text-black-400">
        <Icon size={16} strokeWidth={1.5} />
      </span>
      <span className="t-caption text-black-700">{label}</span>
    </span>
  );
}

function HangUp({ size = 56 }: { size?: number }) {
  return (
    <span style={{ width: size, height: size }} className="flex items-center justify-center rounded-full bg-danger-500 text-white-100">
      <PhoneOff size={size >= 56 ? 20 : 16} strokeWidth={1.5} />
    </span>
  );
}

/** Hero mock: person record with the softphone drawer open. */
export function ProductMock({ className }: { className?: string }) {
  return (
    <div
      role="img"
      aria-label="Decibels showing the record for Oliver Hartley, CEO at Brightmoor Software Ltd, with the softphone open on a live call"
      className={cn('select-none overflow-hidden rounded-lg border border-white-800 bg-white-100 text-left', className)}
    >
      <div className="flex flex-col md:h-[600px] md:flex-row">
        {/* Sidebar */}
        <div className="hidden w-[208px] shrink-0 flex-col border-r border-white-800 bg-canvas p-2 lg:flex">
          <div className="flex h-10 items-center gap-2 px-2">
            <Avatar name="Larkfield Sales" size={20} square />
            <span className="t-h4 truncate text-black-0">Larkfield Sales</span>
          </div>
          <div className="mt-2 flex flex-col gap-0.5">
            {NAV.map(({ label, icon: Icon, active }) => (
              <span key={label} className={cn('flex h-8 items-center gap-2 rounded-sm px-2', active ? 'bg-white-400 text-black-0' : 'text-black-700')}>
                <Icon size={16} strokeWidth={1.5} />
                {label}
              </span>
            ))}
          </div>
          <div className="mt-auto rounded-md border border-white-800 bg-white-100 p-3">
            <p className="t-caption text-black-700">Credits</p>
            <p className="t-h4 tabular mt-0.5 text-black-0">1,412 of 2,000</p>
            <div className="mt-2 h-1 rounded-full bg-white-400">
              <div className="h-1 w-[70%] rounded-full bg-black-700" />
            </div>
          </div>
        </div>

        {/* Record */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-12 shrink-0 items-center gap-2 border-b border-white-800 px-4 text-black-700 md:px-6">
            <span>People</span>
            <span aria-hidden>/</span>
            <span className="truncate text-black-0">Oliver Hartley</span>
          </div>
          <div className="border-b border-white-800 p-4 md:p-6">
            <div className="flex items-start gap-4">
              <Avatar name="Oliver Hartley" size={48} />
              <div className="min-w-0">
                <p className="t-h2 truncate text-black-0">Oliver Hartley</p>
                <p className="mt-1 text-black-700">CEO at Brightmoor Software Ltd · Manchester</p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Chip icon={Phone}>Called 2 days ago</Chip>
              <Chip icon={CalendarCheck} tone="success">
                Meeting booked
              </Chip>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden p-4 md:p-6">
            <p className="t-small text-black-700">Activity</p>
            <div className="relative mt-4 space-y-5">
              <span aria-hidden className="absolute bottom-2 left-[13.5px] top-2 w-px bg-white-800" />
              {TIMELINE.map(({ icon: Icon, title, meta, body }) => (
                <div key={title} className="relative flex gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white-800 bg-white-100 text-black-700">
                    <Icon size={14} strokeWidth={1.5} />
                  </span>
                  <div className="min-w-0 pt-1">
                    <p className="text-black-0">
                      {title} <span className="t-small ml-1 text-black-700">{meta}</span>
                    </p>
                    {body ? <p className="mt-1 text-black-700">{body}</p> : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Softphone drawer */}
        <div className="flex w-full shrink-0 flex-col border-t border-white-800 md:w-[320px] md:border-l md:border-t-0 lg:w-[360px]">
          <div className="flex h-12 shrink-0 items-center justify-between border-b border-white-800 px-4">
            <span className="t-h4 text-black-0">Softphone</span>
            <Badge tone="success">
              <span className="h-1.5 w-1.5 rounded-full bg-success-500" />
              In call
            </Badge>
          </div>
          <div className="flex flex-1 flex-col items-center px-4 py-6 text-center">
            <Avatar name="Oliver Hartley" size={56} />
            <p className="t-h3 mt-4 text-black-0">Oliver Hartley</p>
            <p className="mt-1 text-black-700">Brightmoor Software Ltd</p>
            <p className="t-mono mt-3 text-black-400">+44 7700 900101</p>
            <p className="tabular mt-4 tabular-nums text-[40px] font-medium leading-[44px] text-black-0">02:14</p>
            <p className="t-caption mt-3 flex items-center gap-1.5 text-black-700">
              <span className="h-1.5 w-1.5 rounded-full bg-danger-500" />
              Recording · TPS clear
            </p>
            <div className="mt-6 flex items-start justify-center gap-6">
              <RoundControl icon={Mic} label="Mute" />
              <RoundControl icon={Pause} label="Hold" />
              <RoundControl icon={Grid3x3} label="Keypad" />
            </div>
            <div className="mt-5">
              <HangUp />
            </div>
          </div>
          <div className="hidden border-t border-white-800 px-4 py-3 md:block">
            <p className="t-caption text-black-700">Up next</p>
            <div className="mt-2 flex items-center gap-2">
              <Avatar name="Priya Raman" size={24} />
              <span className="min-w-0 truncate text-black-400">Priya Raman</span>
              <span className="t-small ml-auto truncate text-black-700">Harrow & Finch Recruitment</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Cropped frame used inside the pillar cards: bleeds off the right and bottom edge. */
function Crop({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div role="img" aria-label={label} className="mt-auto h-[216px] select-none overflow-hidden border-t border-white-800 bg-canvas pl-6 pt-6">
      <div className="h-full overflow-hidden rounded-tl-lg border-l border-t border-white-800 bg-white-100">{children}</div>
    </div>
  );
}

const ROWS = [
  { name: 'Oliver Hartley', company: 'Brightmoor Software Ltd', mobile: '+44 7700 900101' },
  { name: 'Priya Raman', company: 'Harrow & Finch Recruitment' },
  { name: 'James Whitfield', company: 'Northgate Logistics Group' },
  { name: 'Sarah Okafor', company: 'Pennine Precision Engineering' },
];

export function DataMiniMock() {
  return (
    <Crop label="Search results with masked mobile numbers and a reveal button that costs one credit">
      <div className="w-[440px]">
        <div className="t-small flex h-9 items-center border-b border-white-800 px-3 text-black-700">
          <span className="w-[184px]">Person</span>
          <span>Mobile</span>
        </div>
        {ROWS.map((r) => (
          <div key={r.name} className="flex h-11 items-center border-b border-white-800 px-3">
            <span className="w-[184px] min-w-0 pr-3">
              <span className="block truncate text-black-0">{r.name}</span>
              <span className="t-caption block truncate text-black-700">{r.company}</span>
            </span>
            {r.mobile ? (
              <span className="t-mono text-black-400">{r.mobile}</span>
            ) : (
              <span className="flex items-center gap-2">
                <span className="t-mono text-black-700">+44 7••• ••••••</span>
                <span className="t-small flex h-6 items-center whitespace-nowrap rounded-sm border border-white-800 px-2 text-black-400">Reveal · 1 credit</span>
              </span>
            )}
          </div>
        ))}
      </div>
    </Crop>
  );
}

export function DiallerMiniMock() {
  return (
    <Crop label="Softphone on a live call with mute, hold, keypad and hang-up controls">
      <div className="w-[320px] p-4">
        <div className="flex items-center justify-between">
          <div className="flex min-w-0 items-center gap-2">
            <Avatar name="Sarah Okafor" size={24} />
            <span className="truncate text-black-0">Sarah Okafor</span>
          </div>
          <Badge tone="success">
            <span className="h-1.5 w-1.5 rounded-full bg-success-500" />
            In call
          </Badge>
        </div>
        <p className="t-mono mt-3 text-black-700">+44 7700 900104</p>
        <p className="tabular mt-1 tabular-nums text-[28px] font-medium leading-8 text-black-0">02:14</p>
        <div className="mt-4 flex items-center gap-3">
          {[Mic, Pause, Grid3x3].map((Icon, i) => (
            <span key={i} className="flex h-10 w-10 items-center justify-center rounded-full border border-white-800 text-black-400">
              <Icon size={16} strokeWidth={1.5} />
            </span>
          ))}
          <HangUp size={40} />
        </div>
      </div>
    </Crop>
  );
}

const COLUMNS = [
  { stage: 'To call', count: 18, cards: [{ name: 'James Whitfield', company: 'Northgate Logistics Group', tag: 'No answer' }, { name: 'Sarah Okafor', company: 'Pennine Precision Engineering', tag: 'New' }] },
  { stage: 'Connected', count: 7, cards: [{ name: 'Priya Raman', company: 'Harrow & Finch Recruitment', tag: 'Call back' }] },
  { stage: 'Meeting booked', count: 3, cards: [{ name: 'Oliver Hartley', company: 'Brightmoor Software Ltd', tag: 'Thu 10:30' }] },
];

export function PipelineMiniMock() {
  return (
    <Crop label="Pipeline board with columns To call, Connected and Meeting booked">
      <div className="flex w-[520px] gap-3 p-3">
        {COLUMNS.map((col) => (
          <div key={col.stage} className="w-[164px] shrink-0">
            <p className="t-small flex items-center justify-between px-1 text-black-700">
              <span className="text-black-0">{col.stage}</span>
              <span className="tabular">{col.count}</span>
            </p>
            <div className="mt-2 space-y-2">
              {col.cards.map((c) => (
                <div key={c.name} className="rounded-md border border-white-800 bg-white-100 p-2">
                  <p className="truncate text-black-0">{c.name}</p>
                  <p className="t-caption truncate text-black-700">{c.company}</p>
                  <span className="t-caption mt-2 inline-flex rounded-sm bg-white-300 px-1.5 py-0.5 text-black-700">{c.tag}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Crop>
  );
}
