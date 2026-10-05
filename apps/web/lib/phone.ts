// Phone entry: the countries Decibel calls, their dialling codes, and a forgiving reader
// that turns what people actually type into E.164.
export interface DialCountry {
  code: string; // ISO 3166-1 alpha-2, matches the flag
  name: string;
  dial: string; // without the plus
  /** digits in a national number after the dial code, for telling "44..." apart from a local number */
  nationalLength: number;
}

// UK first (the default), then the EU and nearby markets Decibel supports, then the US.
export const DIAL_COUNTRIES: DialCountry[] = [
  { code: 'GB', name: 'United Kingdom', dial: '44', nationalLength: 10 },
  { code: 'IE', name: 'Ireland', dial: '353', nationalLength: 9 },
  { code: 'FR', name: 'France', dial: '33', nationalLength: 9 },
  { code: 'DE', name: 'Germany', dial: '49', nationalLength: 10 },
  { code: 'ES', name: 'Spain', dial: '34', nationalLength: 9 },
  { code: 'IT', name: 'Italy', dial: '39', nationalLength: 10 },
  { code: 'NL', name: 'Netherlands', dial: '31', nationalLength: 9 },
  { code: 'BE', name: 'Belgium', dial: '32', nationalLength: 9 },
  { code: 'LU', name: 'Luxembourg', dial: '352', nationalLength: 9 },
  { code: 'PT', name: 'Portugal', dial: '351', nationalLength: 9 },
  { code: 'AT', name: 'Austria', dial: '43', nationalLength: 10 },
  { code: 'CH', name: 'Switzerland', dial: '41', nationalLength: 9 },
  { code: 'DK', name: 'Denmark', dial: '45', nationalLength: 8 },
  { code: 'SE', name: 'Sweden', dial: '46', nationalLength: 9 },
  { code: 'NO', name: 'Norway', dial: '47', nationalLength: 8 },
  { code: 'FI', name: 'Finland', dial: '358', nationalLength: 9 },
  { code: 'PL', name: 'Poland', dial: '48', nationalLength: 9 },
  { code: 'US', name: 'United States', dial: '1', nationalLength: 10 },
];
export const DEFAULT_DIAL_COUNTRY = DIAL_COUNTRIES[0];

/** The country whose dialling code starts an international number (+353..., 00353...). */
export function countryFromInternational(input: string): DialCountry | null {
  const s = input.replace(/[^\d+]/g, '');
  const digits = s.startsWith('+') ? s.slice(1) : s.startsWith('00') ? s.slice(2) : null;
  if (!digits) return null;
  // longest code first, so +353 is Ireland rather than a guess at +35
  const byLength = [...DIAL_COUNTRIES].sort((a, b) => b.dial.length - a.dial.length);
  return byLength.find((c) => digits.startsWith(c.dial)) ?? null;
}

/**
 * Reads a typed number in the context of the selected country and returns E.164, or null.
 *   +44 7700 900123 / 0044 7700 900123  -> international as typed
 *   07700 900123                         -> national with trunk 0: +44 7700 900123
 *   44 7700 900123                       -> the country code without a plus: +44 7700 900123
 *   7700 900123                          -> national without the 0: +44 7700 900123
 */
export function toE164(input: string, country: DialCountry = DEFAULT_DIAL_COUNTRY): string | null {
  let s = input.replace(/[^\d+]/g, '');
  if (!s) return null;
  if (s.startsWith('00')) s = '+' + s.slice(2);
  if (!s.startsWith('+')) {
    if (s.startsWith('0')) s = '+' + country.dial + s.slice(1);
    else if (s.startsWith(country.dial) && s.length - country.dial.length >= country.nationalLength - 1) s = '+' + s;
    else s = '+' + country.dial + s;
  }
  return /^\+[1-9][0-9]{6,14}$/.test(s) ? s : null;
}
