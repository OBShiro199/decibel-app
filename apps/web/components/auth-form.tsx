'use client';
import { MailCheck } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { track } from '@/lib/analytics';
import { supabase } from '@/lib/supabase/client';
import { isFreeMail } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, Input } from '@/components/ui/form';
import { TRIAL_CREDITS } from '@/lib/constants';
import { GoogleIcon } from '@/components/ui/google-icon';

function friendly(message: string): string {
  if (/provider is not enabled|Unsupported provider/i.test(message)) return 'Google sign-in is not enabled for this project yet. Use email instead.';
  if (/Invalid login credentials/i.test(message)) return 'That email and password do not match.';
  if (/Email not confirmed/i.test(message)) return 'Confirm your email first. Check your inbox for the link.';
  if (/already registered/i.test(message)) return 'An account with this email already exists. Log in instead.';
  if (/rate limit|security purposes/i.test(message)) return 'Too many attempts. Wait a minute and try again.';
  return message;
}

export function AuthForm({ mode }: { mode: 'login' | 'signup' }) {
  const router = useRouter();
  const params = useSearchParams();
  const nextParam = params.get('next');
  const next = nextParam && nextParam.startsWith('/') && !nextParam.startsWith('//') ? nextParam : mode === 'signup' ? '/onboarding' : '/app';
  const [name, setName] = useState('');
  const [email, setEmail] = useState(params.get('email') ?? '');
  const [password, setPassword] = useState('');
  const [terms, setTerms] = useState(false);
  const [magic, setMagic] = useState(false);
  const [freeMailOk, setFreeMailOk] = useState(false);
  const [busy, setBusy] = useState<'form' | 'google' | null>(null);
  const [error, setError] = useState<string | null>(params.get('error'));
  const [sent, setSent] = useState<'confirm' | 'magic' | 'reset' | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const callback = () => `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
  const freeMail = mode === 'signup' && email.includes('@') && isFreeMail(email);

  const google = async () => {
    setBusy('google');
    setError(null);
    const { error } = await supabase().auth.signInWithOAuth({ provider: 'google', options: { redirectTo: callback() } });
    if (error) {
      setError(friendly(error.message));
      setBusy(null);
    } else if (mode === 'signup') track('signup_completed', { method: 'google' });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const errs: Record<string, string> = {};
    if (mode === 'signup' && (name.trim().length < 2 || name.trim().length > 80)) errs.name = 'Enter your full name (2 to 80 characters).';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) errs.email = 'Enter a valid email address.';
    if (!magic && mode === 'signup' && (password.length < 10 || !/\d/.test(password))) errs.password = 'Use at least 10 characters including a number.';
    if (!magic && mode === 'login' && !password) errs.password = 'Enter your password.';
    if (mode === 'signup' && !terms) errs.terms = 'Please accept the terms and privacy notice.';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    if (freeMail && !freeMailOk) return;

    setBusy('form');
    const auth = supabase().auth;
    try {
      if (magic) {
        const { error } = await auth.signInWithOtp({
          email,
          options: { emailRedirectTo: callback(), shouldCreateUser: mode === 'signup', data: mode === 'signup' ? { full_name: name.trim() } : undefined },
        });
        if (error) throw error;
        if (mode === 'signup') track('signup_completed', { method: 'magic' });
        setSent('magic');
      } else if (mode === 'signup') {
        const { data, error } = await auth.signUp({ email, password, options: { emailRedirectTo: callback(), data: { full_name: name.trim() } } });
        if (error) throw error;
        // Supabase returns an empty identities array when the address is already registered
        if (data.user && data.user.identities?.length === 0) throw new Error('User already registered');
        track('signup_completed', { method: 'password' });
        if (data.session) {
          router.replace(next);
          router.refresh();
        } else setSent('confirm');
      } else {
        const { error } = await auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.replace(next);
        router.refresh();
      }
    } catch (err) {
      setError(friendly((err as Error).message));
    } finally {
      setBusy(null);
    }
  };

  const reset = async () => {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      setErrors({ email: 'Enter your email first, then choose Forgot password.' });
      return;
    }
    const { error } = await supabase().auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent('/app/settings/sessions')}`,
    });
    if (error) setError(friendly(error.message));
    else setSent('reset');
  };

  if (sent) {
    return (
      <div className="card p-6 text-center">
        <MailCheck size={20} strokeWidth={1.5} className="mx-auto text-accent-500" />
        <h1 className="t-h3 mt-3">Check your email</h1>
        <p className="mt-2 text-black-700">
          {sent === 'confirm'
            ? `We sent a confirmation link to ${email}. Open it to finish creating your account.`
            : sent === 'magic'
              ? `We sent a sign-in link to ${email}. It works once and expires shortly.`
              : `We sent a password reset link to ${email}.`}
        </p>
        <button className="link mt-4" onClick={() => setSent(null)}>
          Use a different email
        </button>
      </div>
    );
  }

  const suffix = nextParam ? `?next=${encodeURIComponent(nextParam)}` : '';

  return (
    <div className="card p-6">
      <h1 className="t-h3">{mode === 'signup' ? 'Start your free trial' : 'Log in to Decibel'}</h1>
      <p className="mt-1 text-black-700">{mode === 'signup' ? `14 days, ${TRIAL_CREDITS.toLocaleString('en-GB')} credits, 60 minutes. No card needed.` : 'Welcome back.'}</p>

      <Button className="mt-6 w-full" onClick={google} loading={busy === 'google'}>
        <GoogleIcon /> Continue with Google
      </Button>
      <div className="my-4 flex items-center gap-3 text-white-900">
        <span className="h-px flex-1 bg-white-800" />
        <span className="t-caption">or</span>
        <span className="h-px flex-1 bg-white-800" />
      </div>

      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        {mode === 'signup' ? (
          <Field label="Full name" htmlFor="name" error={errors.name}>
            <Input id="name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={!!errors.name} />
          </Field>
        ) : null}
        <Field label={mode === 'signup' ? 'Work email' : 'Email'} htmlFor="email" error={errors.email}>
          <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => { setEmail(e.target.value); setFreeMailOk(false); }} aria-invalid={!!errors.email} />
        </Field>
        {freeMail ? (
          <div className="rounded-md border border-white-800 bg-warning-100 p-3 text-warning-700">
            <p>Decibel works best with a work email: it helps us set up your workspace and verify your business for a phone number.</p>
            <Checkbox className="mt-2" checked={freeMailOk} onChange={setFreeMailOk} label="Continue with this email anyway" />
          </div>
        ) : null}
        {!magic ? (
          <Field
            label={
              <span className="flex justify-between">
                Password
                {mode === 'login' ? (
                  <button type="button" onClick={reset} className="link">
                    Forgot password?
                  </button>
                ) : null}
              </span>
            }
            htmlFor="password"
            error={errors.password}
            hint={mode === 'signup' ? 'At least 10 characters, including a number.' : undefined}
          >
            <Input id="password" type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} value={password} onChange={(e) => setPassword(e.target.value)} aria-invalid={!!errors.password} />
          </Field>
        ) : null}
        {mode === 'signup' ? (
          <div>
            <Checkbox
              checked={terms}
              onChange={setTerms}
              label={
                <span className="text-black-700">
                  I agree to the <Link href="/terms" className="link" target="_blank">Terms</Link> and <Link href="/privacy" className="link" target="_blank">Privacy notice</Link>
                </span>
              }
            />
            {errors.terms ? <p className="t-caption mt-1.5 text-danger-700" role="alert">{errors.terms}</p> : null}
          </div>
        ) : null}
        {error ? (
          <p className="rounded-md border border-white-800 bg-danger-100 p-3 text-danger-700" role="alert">
            {error}
          </p>
        ) : null}
        <Button type="submit" variant="primary" loading={busy === 'form'} disabled={freeMail && !freeMailOk}>
          {magic ? 'Email me a link' : mode === 'signup' ? 'Create account' : 'Log in'}
        </Button>
        <button type="button" className="link self-center" onClick={() => setMagic((m) => !m)}>
          {magic ? 'Use a password instead' : 'Email me a magic link instead'}
        </button>
      </form>

      <p className="mt-6 border-t border-white-800 pt-4 text-center text-black-700">
        {mode === 'signup' ? (
          <>
            Already have an account? <Link href={`/login${suffix}`} className="link">Log in</Link>
          </>
        ) : (
          <>
            New to Decibel? <Link href={`/signup${suffix}`} className="link">Start free trial</Link>
          </>
        )}
      </p>
    </div>
  );
}
