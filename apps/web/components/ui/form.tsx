'use client';
import { Check, ChevronDown, X } from 'lucide-react';
import { forwardRef, useId, useState } from 'react';
import { cn } from '@/lib/utils';

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...props },
  ref,
) {
  return <input ref={ref} className={cn('control', className)} {...props} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    return <textarea ref={ref} className={cn('control h-auto min-h-[72px] resize-none py-2', className)} {...props} />;
  },
);

export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, children, ...props },
  ref,
) {
  return (
    <div className={cn('relative', className)}>
      <select ref={ref} className="control cursor-pointer appearance-none pr-8" {...props}>
        {children}
      </select>
      <ChevronDown size={16} strokeWidth={1.5} className="pointer-events-none absolute right-2.5 top-2.5 text-black-700" />
    </div>
  );
});

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('t-label mb-1.5 block', className)} {...props} />;
}

/** Form row: Small label above the control, Caption helper or error below. */
export function Field({
  label,
  hint,
  error,
  children,
  className,
  htmlFor,
}: {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  htmlFor?: string;
}) {
  return (
    <div className={className}>
      {label ? <Label htmlFor={htmlFor}>{label}</Label> : null}
      {children}
      {error ? (
        <p className="t-caption mt-1.5 text-danger-700" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="t-caption mt-1.5 text-black-700">{hint}</p>
      ) : null}
    </div>
  );
}

export function Checkbox({
  checked,
  onChange,
  label,
  className,
  disabled,
  indeterminate,
  'aria-label': ariaLabel,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: React.ReactNode;
  className?: string;
  disabled?: boolean;
  indeterminate?: boolean;
  'aria-label'?: string;
}) {
  const id = useId();
  return (
    <span className={cn('inline-flex items-start gap-2', className)}>
      <button
        id={id}
        type="button"
        role="checkbox"
        aria-checked={indeterminate ? 'mixed' : checked}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          onChange(!checked);
        }}
        className={cn(
          'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-[2px] border transition-colors',
          checked || indeterminate ? 'border-black-700 bg-white-100 text-black-400' : 'border-btnborder bg-white-100 hover:border-black-700',
          disabled && 'cursor-not-allowed opacity-50',
        )}
      >
        {indeterminate ? <span className="h-0.5 w-2 bg-black-400" /> : checked ? <Check size={12} strokeWidth={2.5} /> : null}
      </button>
      {label ? (
        <label htmlFor={id} className="cursor-pointer select-none">
          {label}
        </label>
      ) : null}
    </span>
  );
}

export function Switch({
  checked,
  onChange,
  disabled,
  'aria-label': ariaLabel,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  'aria-label'?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative h-5 w-9 shrink-0 rounded-full border transition-colors',
        checked ? 'border-accent-500 bg-accent-500' : 'border-btnborder bg-white-300',
        disabled && 'cursor-not-allowed opacity-50',
      )}
    >
      <span
        className={cn(
          'absolute top-0.5 h-3.5 w-3.5 rounded-full bg-white-100 transition-all',
          checked ? 'left-[18px]' : 'left-0.5',
        )}
      />
    </button>
  );
}

/** Chips input for job titles, tags and emails: free text + Enter/comma, with optional suggestions. */
export function ChipsInput({
  value,
  onChange,
  placeholder,
  suggestions = [],
  validate,
  id,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  suggestions?: string[];
  validate?: (v: string) => boolean;
  id?: string;
}) {
  const [draft, setDraft] = useState('');
  const add = (raw: string) => {
    const items = raw
      .split(/[,\n;]/)
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((s) => (validate ? validate(s) : true))
      .filter((s) => !value.some((v) => v.toLowerCase() === s.toLowerCase()));
    if (items.length) onChange([...value, ...items]);
    setDraft('');
  };
  const remaining = suggestions.filter((s) => !value.some((v) => v.toLowerCase() === s.toLowerCase()));
  return (
    <div>
      <div className="control field-focus flex h-auto min-h-9 flex-wrap items-center gap-1.5 py-1.5">
        {value.map((v) => (
          <span key={v} className="t-small inline-flex h-6 items-center gap-1 rounded-[3px] border border-white-800 bg-white-200 pl-2 pr-1">
            {v}
            <button
              type="button"
              aria-label={`Remove ${v}`}
              onClick={() => onChange(value.filter((x) => x !== v))}
              className="flex h-4 w-4 items-center justify-center rounded-full text-black-700 hover:bg-white-400"
            >
              <X size={12} strokeWidth={1.5} />
            </button>
          </span>
        ))}
        <input
          id={id}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault();
              add(draft);
            } else if (e.key === 'Backspace' && !draft && value.length) {
              onChange(value.slice(0, -1));
            }
          }}
          onBlur={() => draft && add(draft)}
          onPaste={(e) => {
            const text = e.clipboardData.getData('text');
            if (/[,\n;]/.test(text)) {
              e.preventDefault();
              add(text);
            }
          }}
          placeholder={value.length ? '' : placeholder}
          className="min-w-[120px] flex-1 bg-transparent outline-none"
        />
      </div>
      {remaining.length ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {remaining.slice(0, 8).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onChange([...value, s])}
              className="t-small h-6 rounded-[3px] border border-dashed border-white-800 px-2 text-black-700 hover:border-black-700"
            >
              + {s}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Multi-select rendered as toggleable pills. */
export function PillSelect<T extends string>({
  options,
  value,
  onChange,
  single,
}: {
  options: { value: T; label: string }[];
  value: T[];
  onChange: (next: T[]) => void;
  single?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = value.includes(o.value);
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(single ? [o.value] : on ? value.filter((v) => v !== o.value) : [...value, o.value])}
            className={cn(
              'h-8 rounded-sm border px-3 transition-colors',
              on ? 'border-black-400 bg-white-300 text-black-400' : 'border-btnborder bg-white-100 hover:border-white-900',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
