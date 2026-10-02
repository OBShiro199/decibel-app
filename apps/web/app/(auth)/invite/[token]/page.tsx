'use client';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { track } from '@/lib/analytics';
import { invoke, supabase } from '@/lib/supabase/client';
import { Button, ButtonLink } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/display';

interface Invite {
  workspace_name: string;
  inviter_name: string;
  email: string;
  role: string;
  status: 'pending' | 'accepted' | 'revoked' | 'expired';
  expires_at: string;
}

export default function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [invite, setInvite] = useState<Invite | null | undefined>(undefined);
  const [me, setMe] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const db = supabase();
    void db.rpc('get_invitation', { p_token: token }).then(({ data }) => setInvite(((data as Invite[] | null) ?? [])[0] ?? null));
    void db.auth.getUser().then(({ data }) => setMe(data.user?.email ?? null));
  }, [token]);

  const join = async () => {
    setBusy(true);
    setError(null);
    const { data, error } = await supabase().rpc('accept_invitation', { p_token: token });
    if (error) {
      setError(
        /email_mismatch/.test(error.message)
          ? `This invite is for ${invite?.email}. Log in with that address to join.`
          : /invalid_invitation/.test(error.message)
            ? 'This invite is no longer valid.'
            : error.message,
      );
      setBusy(false);
      return;
    }
    track('invite_accepted', { role: invite?.role });
    const wsId = (data as { id?: string } | null)?.id;
    if (wsId) void invoke('billing', { workspace_id: wsId, action: 'sync_seats' }).catch(() => {});
    router.replace('/onboarding/test?invited=1');
    router.refresh();
  };

  const signOut = async () => {
    await supabase().auth.signOut();
    setMe(null);
  };

  if (invite === undefined || me === undefined) {
    return (
      <div className="card p-6">
        <Skeleton className="h-6 w-3/4" />
        <Skeleton className="mt-3 w-full" />
        <Skeleton className="mt-6 h-9 w-full" />
      </div>
    );
  }

  if (!invite || invite.status !== 'pending') {
    const reason = !invite ? 'This invite link is not valid.' : invite.status === 'expired' ? 'This invite has expired.' : invite.status === 'accepted' ? 'This invite has already been used.' : 'This invite was revoked.';
    return (
      <div className="card p-6 text-center">
        <h1 className="t-h3">{reason}</h1>
        <p className="mt-2 text-black-700">
          {invite ? `Ask ${invite.inviter_name} to send a new invite to ${invite.workspace_name}.` : 'Ask your teammate to send a new invite.'}
        </p>
        <ButtonLink href={invite?.status === 'accepted' ? '/app' : '/login'} className="mt-6">
          {invite?.status === 'accepted' ? 'Open Decibels' : 'Log in'}
        </ButtonLink>
      </div>
    );
  }

  const next = encodeURIComponent(`/invite/${token}`);
  const email = encodeURIComponent(invite.email);
  const matches = me?.toLowerCase() === invite.email.toLowerCase();

  return (
    <div className="card p-6">
      <h1 className="t-h3">
        {invite.inviter_name} invited you to {invite.workspace_name} on Decibels
      </h1>
      <p className="mt-2 text-black-700">
        You will join as {invite.role === 'admin' ? 'an admin' : 'a member'}. This invite is for <b className="text-black-400">{invite.email}</b>.
      </p>
      {error ? (
        <p className="mt-4 rounded-md border border-white-800 bg-danger-100 p-3 text-danger-700" role="alert">
          {error}
        </p>
      ) : null}
      {me ? (
        matches ? (
          <Button variant="primary" className="mt-6 w-full" loading={busy} onClick={join}>
            Join workspace
          </Button>
        ) : (
          <div className="mt-6">
            <p className="text-black-700">
              You are logged in as {me}. Log in with {invite.email} to accept.
            </p>
            <Button className="mt-3 w-full" onClick={signOut}>
              Log out
            </Button>
          </div>
        )
      ) : (
        <div className="mt-6 flex flex-col gap-2">
          <ButtonLink variant="primary" href={`/signup?next=${next}&email=${email}`}>
            Create account to join
          </ButtonLink>
          <ButtonLink href={`/login?next=${next}&email=${email}`}>I already have an account</ButtonLink>
        </div>
      )}
      <p className="t-caption mt-4 text-center text-black-700">
        <Link href="/" className="hover:underline">What is Decibels?</Link>
      </p>
    </div>
  );
}
