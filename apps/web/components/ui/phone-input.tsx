'use client';
// Phone field with a country dropdown. Defaults to the UK (+44); typing an international
// number (+353..., 00353...) switches the flag to match. Pair with toE164() from lib/phone.
import { ChevronDown } from 'lucide-react';
import * as Flags from 'country-flag-icons/react/3x2';
import { forwardRef } from 'react';
import { countryFromInternational, DIAL_COUNTRIES, type DialCountry } from '@/lib/phone';
import { cn } from '@/lib/utils';
import { MenuItem, Popover } from '@/components/ui/overlay';

export function Flag({ code, className }: { code: string; className?: string }) {
  const F = (Flags as Record<string, React.ComponentType<{ title?: string; className?: string }>>)[code];
  return F ? <F title="" className={cn('h-3.5 w-[21px] shrink-0 overflow-hidden rounded-[2px] shadow-[0_0_0_1px_rgba(8,9,10,0.08)]', className)} /> : null;
}

/** Just the dropdown button, for fields that manage their own input. */
export function CountryPicker({ country, onChange }: { country: DialCountry; onChange: (c: DialCountry) => void }) {
  return (
    <Popover
      className="max-h-[320px] w-64 overflow-y-auto"
      trigger={({ toggle }) => (
        <button
          type="button"
          onClick={toggle}
          aria-label={`Country code: ${country.name} +${country.dial}`}
          className="flex h-full shrink-0 items-center gap-1.5 rounded-l-sm pl-2.5 pr-2 tabular-nums text-black-500 hover:bg-white-200"
        >
          <Flag code={country.code} />
          <span>+{country.dial}</span>
          <ChevronDown size={12} strokeWidth={1.5} className="text-white-900" />
        </button>
      )}
    >
      {(close) =>
        DIAL_COUNTRIES.map((c) => (
          <MenuItem
            key={c.code}
            onClick={() => {
              onChange(c);
              close();
            }}
          >
            <Flag code={c.code} />
            <span className="min-w-0 flex-1 truncate">{c.name}</span>
            <span className="tabular-nums text-white-900">+{c.dial}</span>
          </MenuItem>
        ))
      }
    </Popover>
  );
}

interface PhoneInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  value: string;
  onChange: (value: string) => void;
  country: DialCountry;
  onCountryChange: (c: DialCountry) => void;
}

/** A text field with the country picker on its left. The raw text is kept as typed. */
export const PhoneInput = forwardRef<HTMLInputElement, PhoneInputProps>(function PhoneInput({ value, onChange, country, onCountryChange, className, placeholder, ...rest }, ref) {
  return (
    <div className={cn('control field-focus flex h-10 items-stretch overflow-visible p-0', className)}>
      <CountryPicker country={country} onChange={onCountryChange} />
      <span aria-hidden className="my-2 w-px bg-white-800" />
      <input
        ref={ref}
        {...rest}
        value={value}
        onChange={(e) => {
          const v = e.target.value;
          const detected = countryFromInternational(v);
          if (detected && detected.code !== country.code) onCountryChange(detected);
          onChange(v);
        }}
        placeholder={placeholder ?? `${country.code === 'GB' ? '7700 900123' : 'Phone number'}`}
        inputMode={rest.inputMode ?? 'tel'}
        className="min-w-0 flex-1 bg-transparent px-2.5 tabular-nums text-black-400 outline-none placeholder:text-white-900"
      />
    </div>
  );
});
