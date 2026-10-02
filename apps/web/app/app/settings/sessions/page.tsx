'use client';
import { useQuery } from '@tanstack/react-query';
import { MonitorSmartphone } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge, ErrorCard, Skeleton } from '@/components/ui/display';
import { Field, Input } from '@/components/ui/form';
import { useToast } from '@/components/ui/overlay';
import { useApp } from '@/lib/app-context';
import { supabase } from '@/lib/supabase/client';
import { formatDate } from '@/lib/utils';
import { errorMessage, Notice, Section, SettingsPage } from '../_components';

function describeBrowser(ua: string): string {
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  const os = /Windows/.test(ua) ? 'Windows' : /iPhone|iPad/.test(ua) ? 'iOS' : /Mac OS X/.test(ua) ? 'macOS' : /Android/.test(ua) ? 'Android' : /Linux/.test(ua) ? 'Linux' : '';
  return os ? `${browser} on ${os}` : browser;
}

export default function SessionsPage() {
  const { user } = useApp();
  const toast = useToast();
  const [browser, setBrowser] = useState('');
  const [busy, setBusy] = useState<'this' | 'others' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [pwBusy, setPwBusy] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);

  useEffect(() => setBrowser(describeBrowser(navigator.userAgent)), []);

  const session = useQuery({
    queryKey: ['auth-user', user.id],
    queryFn: async () => {
      const { data, error: err } = await supabase().auth.getUser();
      if (err) throw err;
      return data.user;
    },
  });

  async function signOutHere() {
    setBusy('this');
    setError(null);
    const { error: err } = await supabase().auth.signOut();
    if (err) {
      setBusy(null);
      return setError(err.message);
    }
    window.location.assign('/login');
  }

  async function signOutOthers() {
    setBusy('others');
    setError(null);
    const { error: err } = await supabase().auth.signOut({ scope: 'others' });
    setBusy(null);
    if (err) return setError(err.message);
    toast('Logged out of all other devices');
  }

  const longEnough = password.length >= 10;
  const hasNumber = /\d/.test(password);
  const matches = password === confirm;

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    if (!longEnough || !hasNumber || !matches) return;
    setPwBusy(true);
    setPwError(null);
    try {
      const { error: err } = await supabase().auth.updateUser({ password });
      if (err) throw err;
      setPassword('');
      setConfirm('');
      toast('Password changed');
    } catch (err) {
      setPwError(errorMessage(err));
    } finally {
      setPwBusy(false);
    }
  }

  return (
    <SettingsPage title="Sessions" description="Where you are logged in, and your password.">
      <Section title="This device">
        {session.isError ? (
          <ErrorCard message="Could not load your session." onRetry={() => session.refetch()} />
        ) : (
          <div className="card p-6">
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-white-200 text-black-700">
                <MonitorSmartphone size={20} strokeWidth={1.5} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2">
                  {browser || <Skeleton className="w-32" />}
                  <Badge tone="success">Current session</Badge>
                </p>
                {session.isLoading ? (
                  <Skeleton className="mt-1.5 w-48" />
                ) : (
                  <p className="t-small mt-0.5 text-black-700">
                    {user.email} · Last sign-in {session.data?.last_sign_in_at ? formatDate(session.data.last_sign_in_at, true) : 'unknown'}
                  </p>
                )}
              </div>
            </div>
            {error ? <Notice tone="danger" className="mt-4">{error}</Notice> : null}
            <div className="mt-5 flex flex-wrap gap-2">
              <Button loading={busy === 'this'} disabled={busy !== null} onClick={signOutHere}>
                Log out of this device
              </Button>
              <Button loading={busy === 'others'} disabled={busy !== null} onClick={signOutOthers}>
                Log out of all other devices
              </Button>
            </div>
          </div>
        )}
      </Section>

      <Section title="Change password" description="At least 10 characters, including one number.">
        <form onSubmit={changePassword} className="card space-y-5 p-6" id="password">
          <Field
            label="New password"
            htmlFor="new_password"
            error={password && !longEnough ? 'Use at least 10 characters.' : password && !hasNumber ? 'Include at least one number.' : undefined}
          >
            <Input id="new_password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
          </Field>
          <Field label="Confirm new password" htmlFor="confirm_password" error={confirm && !matches ? 'The passwords do not match.' : undefined}>
            <Input id="confirm_password" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
          </Field>
          {pwError ? <Notice tone="danger">{pwError}</Notice> : null}
          <div className="flex justify-end">
            <Button type="submit" variant="primary" loading={pwBusy} disabled={!longEnough || !hasNumber || !matches}>
              Change password
            </Button>
          </div>
        </form>
      </Section>
    </SettingsPage>
  );
}
