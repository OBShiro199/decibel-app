'use client';
// Opens from the link in a reminder email (?u=<user id>&t=<signature>) and opts that person
// out of reminder emails straight away. Account emails (sign-in, replies) still arrive.
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { LogoMark } from '@/components/marketing/logo';

type State = 'working' | 'done' | 'invalid' | 'error';

export function Unsubscribe() {
  const [state, setState] = useState<State>('working');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const u = params.get('u');
    const t = params.get('t');
    if (!u || !t) return setState('invalid');
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/unsubscribe`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', apikey: key, authorization: `Bearer ${key}` },
      body: JSON.stringify({ u, t }),
    })
      .then(async (res) => setState(res.ok ? 'done' : (await res.json().catch(() => ({}))).error === 'invalid_link' ? 'invalid' : 'error'))
      .catch(() => setState('error'));
  }, []);

  const copy: Record<State, [string, string]> = {
    working: ['Unsubscribing', 'One moment.'],
    done: ['You are unsubscribed', 'We will not send you any more reminder emails. Emails about your account, like replies to your questions, still arrive.'],
    invalid: ['This link does not work', 'It may have been cut short by your email app. Open the link from the email again, or reply to the email and we will take you off the list.'],
    error: ['Something went wrong', 'Please try the link again in a minute, or reply to the email and we will take you off the list.'],
  };
  const [title, text] = copy[state];

  return (
    <div className="app-shell flex min-h-dvh items-center justify-center bg-white-100 px-4 text-black-400">
      <div className="w-full max-w-[400px]">
        <Link href="/" className="mb-8 inline-flex items-center gap-2">
          <LogoMark size={20} />
          <span className="font-medium">Decibel</span>
        </Link>
        <h1 className="t-h3">{title}</h1>
        <p className="mt-2 text-black-700">{text}</p>
      </div>
    </div>
  );
}
