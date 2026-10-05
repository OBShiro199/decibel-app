import { AlertCircle, Inbox, SearchX } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Tone } from '@/lib/constants';
import { cn, initials } from '@/lib/utils';

const tones: Record<Tone, string> = {
  neutral: 'tag-7',
  success: 'tag-0',
  warning: 'tag-2',
  danger: 'tag-3',
  accent: 'tag-1',
};

/** Square pastel pill. Colour is stable per label unless `color` (0-7) is given. */
export function Tag({ children, color, className }: { children: string; color?: number; className?: string }) {
  let h = 0;
  for (let i = 0; i < children.length; i++) h = (h * 31 + children.charCodeAt(i)) >>> 0;
  return <span className={cn('tag', `tag-${color ?? h % 7}`, className)}>{children}</span>;
}

/** Small label above a heading. */
export function Eyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn('eyebrow', className)}>{children}</p>;
}

export function Badge({ tone = 'neutral', className, children }: { tone?: Tone; className?: string; children: React.ReactNode }) {
  return (
    <span className={cn('tag', tones[tone], className)}>
      {children}
    </span>
  );
}

/** Pill chip: radius 999, white-200 fill, 1px border, 13px, icon + text. */
export function Chip({ icon: Icon, tone, className, children }: { icon?: LucideIcon; tone?: 'danger' | 'success'; className?: string; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        't-small inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-[3px] border border-white-800 bg-white-100 px-2',
        tone === 'danger' && 'border-danger-500 bg-danger-100 text-danger-700',
        tone === 'success' && 'bg-success-100 text-success-700',
        className,
      )}
    >
      {Icon ? <Icon size={14} strokeWidth={1.5} /> : null}
      {children}
    </span>
  );
}

export function Avatar({ name, src, size = 24, square, className }: { name?: string | null; src?: string | null; size?: number; square?: boolean; className?: string }) {
  const style = { width: size, height: size, fontSize: Math.max(9, Math.round(size * 0.36)) };
  return (
    <span
      style={style}
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden border border-white-800 bg-panel tabular-nums font-medium leading-none tracking-normal text-black-700',
        square ? 'rounded-[2px]' : 'rounded-[4px]',
        className,
      )}
      aria-hidden
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" width={size} height={size} className="h-full w-full object-cover" />
      ) : (
        initials(name)
      )}
    </span>
  );
}

/** Company logo chip: workspace-supplied logo, or initials on a square tile. */
export function CompanyLogo({ name, src, size = 20 }: { name?: string | null; src?: string | null; size?: number }) {
  return <Avatar name={name} src={src} size={size} square />;
}

export function Skeleton({ className, style }: { className?: string; style?: React.CSSProperties }) {
  // a span (styled as a block) so it is valid inside <p>, <button> and other phrasing content
  return <span className={cn('skeleton block h-4', className)} style={style} aria-hidden />;
}

/** Same geometry as `.tbl`: 36px header, 40px rows, so real rows drop in without a shift. */
export function TableSkeleton({ rows = 8, cols = 5 }: { rows?: number; cols?: number }) {
  const widths = [38, 62, 48, 70, 44, 56, 40, 52];
  return (
    <div aria-busy="true" className="overflow-hidden">
      <span className="sr-only">Loading</span>
      <div className="flex h-9 items-center gap-6 border-b border-white-800 bg-panel px-3">
        {Array.from({ length: cols }).map((_, c) => (
          <div key={c} className="flex-1">
            <Skeleton className="h-2.5 w-14" />
          </div>
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex h-10 items-center gap-6 border-b border-rule bg-white-100 px-3">
          {Array.from({ length: cols }).map((_, c) => (
            <div key={c} className="flex-1">
              <Skeleton className="h-3" style={{ width: `${widths[(r + c * 3) % widths.length]}%` }} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export function StatTile({ label, value, sub, loading }: { label: string; value: React.ReactNode; sub?: React.ReactNode; loading?: boolean }) {
  return (
    <div className="bg-white-100 p-5">
      <p className="t-label">{label}</p>
      {loading ? <Skeleton className="mt-3 h-9 w-20" /> : <p className="tabular mt-2 text-2xl font-medium leading-9 tracking-[-0.04em] text-black-300">{value}</p>}
      {sub ? <p className="t-caption mt-1 text-black-700">{sub}</p> : null}
    </div>
  );
}

export function ErrorCard({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <div className="card flex items-center gap-3 p-4" role="alert">
      <AlertCircle size={16} strokeWidth={1.5} className="shrink-0 text-danger-500" />
      <p className="flex-1">{message ?? 'Something went wrong loading this.'}</p>
      {onRetry ? (
        <button onClick={onRetry} className="h-8 rounded-sm border border-white-800 px-3 hover:border-black-700">
          Retry
        </button>
      ) : null}
    </div>
  );
}

/** Dashed-outline illustration: a solid hexagon with dashed squares scattered round it. */
export function EmptyIllustration({ shape = 'hexagon' }: { shape?: 'hexagon' | 'diamond' }) {
  return (
    <svg width="160" height="96" viewBox="0 0 160 96" fill="none" aria-hidden>
      {[
        [14, 18, 20],
        [124, 8, 24],
        [132, 58, 18],
        [22, 62, 22],
        [58, 2, 14],
        [96, 76, 14],
      ].map(([x, y, s], i) => (
        <rect key={i} x={x} y={y} width={s} height={s} rx="6" stroke="var(--color-white-800)" strokeWidth="1.25" strokeDasharray="2 4" />
      ))}
      {shape === 'hexagon' ? (
        <path d="M80 16 107.7 32v32L80 80 52.3 64V32L80 16Z" stroke="var(--color-black-700)" strokeWidth="1.25" fill="var(--color-white-100)" strokeLinejoin="round" />
      ) : (
        <path d="M80 16 112 48 80 80 48 48 80 16Z" stroke="var(--color-black-700)" strokeWidth="1.25" fill="var(--color-white-100)" strokeLinejoin="round" />
      )}
    </svg>
  );
}

/**
 * Empty state: a small icon tile, one line of title, one line of help, one optional
 * action. Standard sizes (title 14px medium, help 13px) so it sits quietly inside tables
 * and cards. `shape` is kept for compatibility and picks the icon: diamond = no results.
 */
export function EmptyState({
  title,
  description,
  action,
  shape,
  icon: Icon,
  className,
}: {
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  shape?: 'hexagon' | 'diamond';
  icon?: LucideIcon;
  className?: string;
}) {
  const Glyph = Icon ?? (shape === 'diamond' ? SearchX : Inbox);
  return (
    <div className={cn('flex flex-col items-center px-4 py-12 text-center', className)}>
      <span className="flex h-9 w-9 items-center justify-center rounded-md border border-white-800 bg-white-100 text-white-900">
        <Glyph size={16} strokeWidth={1.6} />
      </span>
      <p className="mt-3 text-base font-medium text-black-400">{title}</p>
      {description ? <p className="mt-1 max-w-sm text-sm text-black-700">{description}</p> : null}
      {action ? <div className="mt-4 flex items-center gap-2 [&_a]:h-8 [&_button]:h-8">{action}</div> : null}
    </div>
  );
}

/** Radio card (PRD 12.4): icon tile, H4 title, description, optional radio at the right edge. */
export function OptionCard({
  icon: Icon,
  title,
  description,
  selected,
  onSelect,
  radio,
  disabled,
  badge,
}: {
  icon?: LucideIcon;
  title: string;
  description?: React.ReactNode;
  selected: boolean;
  onSelect: () => void;
  radio?: boolean;
  disabled?: boolean;
  badge?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        'flex w-full items-center gap-3 rounded-md border px-4 py-3 text-left transition-colors',
        selected ? 'border-black-0 bg-panel' : 'border-white-800 bg-white-100 hover:border-white-900',
        disabled && 'cursor-not-allowed opacity-60 hover:border-white-800',
      )}
    >
      {Icon ? (
        <span className={cn('flex h-12 w-12 shrink-0 items-center justify-center rounded-md ', selected ? 'bg-accent-50 text-accent-700' : 'bg-white-200')}>
          <Icon size={20} strokeWidth={1.5} />
        </span>
      ) : null}
      <span className="min-w-0 flex-1">
        <span className="t-h4 flex items-center gap-2">
          {title}
          {badge}
        </span>
        {description ? <span className="mt-0.5 block text-black-700">{description}</span> : null}
      </span>
      {radio ? (
        <span className={cn('flex h-4 w-4 shrink-0 items-center justify-center rounded-full border', selected ? 'border-accent-500 bg-white-100' : 'border-btnborder bg-white-100')}>
          {selected ? <span className="h-2 w-2 rounded-full bg-accent-500" /> : null}
        </span>
      ) : null}
    </button>
  );
}

export interface TabItem {
  id: string;
  label: string;
  icon?: LucideIcon;
  count?: number;
}

export function Tabs({ tabs, active, onChange, className }: { tabs: TabItem[]; active: string; onChange: (id: string) => void; className?: string }) {
  return (
    <div role="tablist" className={cn('flex gap-5 overflow-x-auto border-b border-white-800', className)}>
      {tabs.map(({ id, label, icon: Icon, count }) => {
        const on = id === active;
        return (
          <button
            key={id}
            role="tab"
            aria-selected={on}
            onClick={() => onChange(id)}
            className={cn(
              '-mb-px flex h-10 shrink-0 items-center gap-1.5 border-b-2 transition-colors',
              on ? 'border-black-0 text-black-400' : 'border-transparent text-black-700 hover:text-black-400',
            )}
          >
            {Icon ? <Icon size={16} strokeWidth={1.5} /> : null}
            {label}
            {count !== undefined ? <span className="tabular min-w-[20px] rounded-[3px] bg-white-300 px-1.5 text-center tabular-nums text-xs text-black-700">{count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

/** Network quality as a 3-bar indicator. */
export function SignalBars({ level }: { level: 0 | 1 | 2 | 3 }) {
  return (
    <span className="inline-flex items-end gap-0.5" role="img" aria-label={`Network quality ${level} of 3`}>
      {[1, 2, 3].map((i) => (
        <span
          key={i}
          style={{ height: 4 + i * 3 }}
          className={cn('w-1 rounded-[1px]', i <= level ? (level === 1 ? 'bg-danger-500' : level === 2 ? 'bg-warning-500' : 'bg-success-500') : 'bg-white-500')}
        />
      ))}
    </span>
  );
}
