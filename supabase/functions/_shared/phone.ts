/** E.164 with a UK default: 07…, 0044…, 44…, +44…; null when it can't be a phone number. */
export function normalizePhone(p: string | null | undefined, cc = '44'): string | null {
  if (!p) return null;
  let s = p.replace(/[^0-9+]/g, '');
  if (!s) return null;
  if (s.startsWith('00')) s = '+' + s.slice(2);
  if (s.startsWith('0')) s = '+' + cc + s.slice(1);
  if (!s.startsWith('+')) s = '+' + s;
  return /^\+[1-9][0-9]{6,14}$/.test(s) ? s : null;
}
