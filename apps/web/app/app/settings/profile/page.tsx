'use client';
import { useQueryClient } from '@tanstack/react-query';
import { useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Avatar, Badge } from '@/components/ui/display';
import { Field, Input, Select } from '@/components/ui/form';
import { useToast } from '@/components/ui/overlay';
import { useApp } from '@/lib/app-context';
import { supabase } from '@/lib/supabase/client';
import { normalizePhone } from '@/lib/utils';
import { errorMessage, Notice, Section, SettingsPage } from '../_components';
import { countryFromInternational, DEFAULT_DIAL_COUNTRY, toE164, type DialCountry } from '@/lib/phone';
import { PhoneInput } from '@/components/ui/phone-input';

const FALLBACK_ZONES = ['Europe/London', 'Europe/Dublin', 'Europe/Berlin', 'Europe/Vienna', 'Europe/Zurich', 'Europe/Amsterdam', 'Europe/Brussels', 'Europe/Paris', 'Europe/Stockholm', 'Europe/Oslo', 'Europe/Copenhagen', 'Europe/Helsinki', 'Europe/Madrid', 'Europe/Rome', 'Europe/Lisbon', 'UTC'];

function timeZones(current: string): string[] {
  let zones = FALLBACK_ZONES;
  try {
    const fn = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf;
    if (fn) zones = fn('timeZone');
  } catch {
    /* older browsers */
  }
  return zones.includes(current) || !current ? zones : [current, ...zones];
}

export default function ProfilePage() {
  const { user, profile } = useApp();
  const qc = useQueryClient();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [fullName, setFullName] = useState(profile.full_name ?? '');
  const [mobile, setMobile] = useState(profile.mobile_e164 ?? '');
  const [mobileCountry, setMobileCountry] = useState<DialCountry>(() => countryFromInternational(profile.mobile_e164 ?? '') ?? DEFAULT_DIAL_COUNTRY);
  const [timezone, setTimezone] = useState(profile.timezone || 'Europe/London');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const zones = useMemo(() => timeZones(timezone), [timezone]);

  const mobileE164 = mobile.trim() ? toE164(mobile, mobileCountry) : null;
  const mobileInvalid = Boolean(mobile.trim()) && !mobileE164;
  const dirty = fullName.trim() !== (profile.full_name ?? '') || (mobileE164 ?? '') !== (profile.mobile_e164 ?? '') || timezone !== profile.timezone;

  const refresh = () => qc.invalidateQueries({ queryKey: ['profile'] });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!fullName.trim() || mobileInvalid) return;
    setSaving(true);
    setError(null);
    const { error: err } = await supabase().from('profiles').update({ full_name: fullName.trim(), mobile_e164: mobileE164, timezone }).eq('id', user.id);
    setSaving(false);
    if (err) return setError(err.message);
    if (mobileE164) setMobile(mobileE164);
    await refresh();
    toast('Saved');
  }

  async function uploadAvatar(file: File) {
    setError(null);
    if (!file.type.startsWith('image/')) return setError('Choose an image file (PNG, JPG or WebP).');
    if (file.size > 2 * 1024 * 1024) return setError('That image is larger than 2 MB.');
    setUploading(true);
    try {
      const ext = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
      const path = `${user.id}/avatar-${Date.now()}.${ext}`;
      const up = await supabase().storage.from('avatars').upload(path, file, { contentType: file.type, upsert: true });
      if (up.error) throw up.error;
      const url = supabase().storage.from('avatars').getPublicUrl(path).data.publicUrl;
      const { error: err } = await supabase().from('profiles').update({ avatar_url: url }).eq('id', user.id);
      if (err) throw err;
      await refresh();
      toast('Photo updated');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function removeAvatar() {
    setUploading(true);
    const { error: err } = await supabase().from('profiles').update({ avatar_url: null }).eq('id', user.id);
    setUploading(false);
    if (err) return setError(err.message);
    await refresh();
    toast('Photo removed');
  }

  async function resend() {
    setResending(true);
    const { error: err } = await supabase().auth.resend({ type: 'signup', email: user.email });
    setResending(false);
    toast(err ? `Could not send: ${err.message}` : 'Verification email sent');
  }

  return (
    <SettingsPage title="Profile" description="Your name and photo are visible to everyone in your workspaces.">
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <Section title="Photo">
        <div className="card flex flex-wrap items-center gap-4 p-6">
          <Avatar name={profile.full_name || user.email} src={profile.avatar_url} size={64} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap gap-2">
              <Button loading={uploading} onClick={() => fileRef.current?.click()}>
                Upload photo
              </Button>
              {profile.avatar_url ? (
                <Button variant="ghost" disabled={uploading} onClick={removeAvatar}>
                  Remove
                </Button>
              ) : null}
            </div>
            <p className="t-caption mt-2 text-black-700">PNG, JPG or WebP, up to 2 MB.</p>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void uploadAvatar(f);
            }}
          />
        </div>
      </Section>

      <Section title="Details">
        <form onSubmit={save} className="card space-y-5 p-6">
          <Field label="Full name" htmlFor="full_name" error={!fullName.trim() ? 'Enter your name.' : undefined}>
            <Input id="full_name" value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={120} autoComplete="name" />
          </Field>
          <Field
            label={
              <span className="flex items-center gap-2">
                Email
                <Badge tone={user.emailConfirmed ? 'success' : 'warning'}>{user.emailConfirmed ? 'Verified' : 'Not verified'}</Badge>
              </span>
            }
            htmlFor="email"
            hint={user.emailConfirmed ? 'Your email is your login and cannot be changed here.' : 'Verify your email to buy a phone number.'}
          >
            <div className="flex flex-wrap gap-2">
              <Input id="email" value={user.email} readOnly disabled className="min-w-0 flex-1" />
              {!user.emailConfirmed ? (
                <Button loading={resending} onClick={resend}>
                  Resend verification email
                </Button>
              ) : null}
            </div>
          </Field>
          <Field
            label="Mobile number"
            htmlFor="mobile"
            hint="Used for test calls so you can hear how your calls sound."
            error={mobileInvalid ? 'Enter a valid number, for example 07700 900123 or +44 7700 900123.' : undefined}
          >
            <PhoneInput id="mobile" value={mobile} onChange={setMobile} country={mobileCountry} onCountryChange={setMobileCountry} aria-invalid={mobileInvalid} autoComplete="tel" />
          </Field>
          <Field label="Timezone" htmlFor="timezone" hint="Used for task due times and call-back reminders.">
            <Select id="timezone" value={timezone} onChange={(e) => setTimezone(e.target.value)}>
              {zones.map((z) => (
                <option key={z} value={z}>
                  {z.replace(/_/g, ' ')}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex justify-end">
            <Button type="submit" variant="primary" loading={saving} disabled={!dirty || !fullName.trim() || mobileInvalid}>
              Save
            </Button>
          </div>
        </form>
      </Section>
    </SettingsPage>
  );
}
