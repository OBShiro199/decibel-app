'use client';
import Link from 'next/link';
import { forwardRef } from 'react';
import { useDeferredLoading } from '@/lib/use-deferred-loading';
import { cn } from '@/lib/utils';

type Variant = 'primary' | 'outline' | 'ghost' | 'danger';
type Size = 'default' | 'compact' | 'lg' | 'icon' | 'icon-compact';

const base =
  'inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap t-body font-medium transition-[color,background-color,border-color,transform] duration-100 disabled:pointer-events-none aria-disabled:pointer-events-none';

const variants: Record<Variant, string> = {
  primary:
    'bg-black-0 text-white-100 hover:bg-black-200 active:bg-black-200 disabled:bg-white-400 disabled:text-white-900',
  outline:
    'border border-btnborder bg-white-100 text-black-400 hover:border-white-900 active:bg-white-300 disabled:border-white-500 disabled:text-white-900',
  ghost: 'bg-transparent text-black-400 hover:bg-white-300 active:bg-white-400 disabled:text-white-900',
  danger: 'bg-danger-500 text-white-100 hover:bg-danger-600 active:bg-danger-700 disabled:bg-white-500 disabled:text-white-900',
};

const sizes: Record<Size, string> = {
  default: 'h-9 px-3',
  compact: 'h-8 px-3',
  lg: 'h-[46px] px-6 text-base',
  icon: 'h-9 w-9',
  'icon-compact': 'h-8 w-8',
};

export function buttonClass(variant: Variant = 'outline', size: Size = 'default', className?: string) {
  return cn(base, variants[variant], sizes[size], className);
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'outline', size = 'default', loading, className, children, disabled, type = 'button', ...props },
  ref,
) {
  // the label stays in place (hidden) under the spinner, so the button never changes width;
  // the spinner only appears if the action takes longer than 200ms
  const spinning = useDeferredLoading(!!loading);
  return (
    <button ref={ref} type={type} disabled={disabled || loading} aria-busy={loading || undefined} className={buttonClass(variant, size, cn('relative active:scale-[0.98]', className))} {...props}>
      <span className={cn('inline-flex items-center justify-center gap-2', spinning && 'invisible')}>{children}</span>
      {spinning ? (
        <span className="absolute inset-0 flex items-center justify-center" aria-hidden>
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
        </span>
      ) : null}
    </button>
  );
});

export function ButtonLink({
  variant = 'outline',
  size = 'default',
  className,
  href,
  children,
  ...props
}: { variant?: Variant; size?: Size; href: string } & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href'>) {
  const external = /^https?:|^mailto:/.test(href);
  if (external) {
    return (
      <a href={href} className={buttonClass(variant, size, className)} {...props}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={buttonClass(variant, size, className)} {...props}>
      {children}
    </Link>
  );
}
