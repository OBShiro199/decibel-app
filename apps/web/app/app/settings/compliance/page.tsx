'use client';
import { useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Button, ButtonLink } from '@/components/ui/button';
import { Field, Textarea } from '@/components/ui/form';
import { useToast } from '@/components/ui/overlay';
import { useApp } from '@/lib/app-context';
import { dncTotalQuery } from '@/lib/dnc';
import { supabase } from '@/lib/supabase/client';
import { AdminOnly, Notice, Section, SettingsPage } from '../_components';

const SUBPROCESSORS: [string, string][] = [
  ['Supabase', 'Database, authentication and file storage (London)'],
  ['Twilio', 'Voice calls, phone numbers and call recording'],
  ['Stripe', 'Billing and payments'],
  ['Vercel', 'Application hosting'],
  ['Resend', 'Transactional email'],
  ['PostHog', 'Product analytics'],
];

export default function CompliancePage() {
  const { workspace, isAdmin, refreshWorkspace } = useApp();
  const toast = useToast();
  const dncTotal = useQuery(dncTotalQuery(workspace.id));
  const [art14, setArt14] = useState(workspace.art14_notice_text ?? '');
  const [savingArt14, setSavingArt14] = useState(false);
  const [art14Error, setArt14Error] = useState<string | null>(null);

  async function saveArt14() {
    setSavingArt14(true);
    setArt14Error(null);
    const { error: err } = await supabase().from('workspaces').update({ art14_notice_text: art14.trim() }).eq('id', workspace.id);
    setSavingArt14(false);
    if (err) return setArt14Error(err.message);
    await refreshWorkspace();
    toast('Saved');
  }

  return (
    <SettingsPage title="Compliance" description="Your DNC list, TPS screening and the documents you need for UK and EU outbound calling.">
      {!isAdmin ? <AdminOnly /> : null}

      <Section title="DNC list" description="Your own do-not-call numbers. They can never be dialled, and nobody with one of them can be added.">
        <div className="card flex flex-wrap items-center gap-4 p-6">
          <p className="min-w-0 flex-1 text-black-700">
            {dncTotal.data === undefined ? 'Loading…' : dncTotal.data ? `${dncTotal.data.toLocaleString('en-GB')} number${dncTotal.data === 1 ? '' : 's'} on the list.` : 'No numbers on the list yet.'} Upload a CSV or Excel file, paste numbers or add one at a time.
          </p>
          <ButtonLink href="/app/dnc">Open DNC list</ButtonLink>
        </div>
      </Section>

      <Section title="TPS and CTPS screening">
        <div className="card space-y-3 p-6 text-black-700">
          <p>Every number is screened before it is dialled. Numbers flagged as TPS or CTPS listed are blocked in code, so a rep cannot call them by mistake. This cannot be switched off.</p>
          <p>
            In this version, screening uses cached TPS flags stored with each record. Live TPS sync is not connected yet. When it is, every number will be re-checked at least every 28 days, as the regulations require.
          </p>
          <p>Until then, if you rely on your own TPS licence, upload listed numbers to your DNC list.</p>
        </div>
      </Section>

      <Section
        title="Article 14 notice"
        description="Under UK and EU GDPR you must tell people where you got their data within one month, or at first contact. This text is your notice."
        footer={
          isAdmin ? (
            <Button variant="primary" loading={savingArt14} disabled={art14.trim() === (workspace.art14_notice_text ?? '')} onClick={saveArt14}>
              Save
            </Button>
          ) : undefined
        }
      >
        <div className="card p-6">
          <Field label="Notice text" htmlFor="art14" error={art14Error ?? undefined} hint="Say who you are, why you are calling, where the data came from and how to opt out.">
            <Textarea id="art14" value={art14} onChange={(e) => setArt14(e.target.value)} rows={5} maxLength={2000} disabled={!isAdmin} />
          </Field>
        </div>
      </Section>

      <Section title="Documents">
        <div className="card divide-y divide-white-800">
          <div className="flex flex-wrap items-center gap-4 p-6">
            <div className="min-w-0 flex-1">
              <p>Legitimate interests assessment template</p>
              <p className="t-small mt-0.5 text-black-700">A starting point for the LIA you need before B2B cold calling. Complete it for your own business.</p>
            </div>
            <a href="/lia-template.txt" download className="inline-flex h-9 shrink-0 items-center gap-2 rounded-sm border border-white-800 bg-white-100 px-3 transition-colors hover:border-black-700">
              <Download size={16} strokeWidth={1.5} />
              Download
            </a>
          </div>
          <div className="flex flex-wrap items-center gap-4 p-6">
            <div className="min-w-0 flex-1">
              <p>Data processing agreement</p>
              <p className="t-small mt-0.5 text-black-700">The DPA between your company and Decibel.</p>
            </div>
            <ButtonLink href="/dpa">View DPA</ButtonLink>
          </div>
        </div>
      </Section>

      <Section title="Sub-processors" description="The third parties that process data on our behalf.">
        <div className="card overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Company</th>
                <th>Purpose</th>
              </tr>
            </thead>
            <tbody>
              {SUBPROCESSORS.map(([name, purpose]) => (
                <tr key={name}>
                  <td>{name}</td>
                  <td className="text-black-700">{purpose}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Germany and Austria">
        <Notice tone="warning">
          B2B cold calling in Germany and Austria generally needs prior consent, or at least presumed consent that is hard to rely on. Decibel does not block these calls, so take legal advice before dialling numbers there. See the{' '}
          <Link href="/compliance" className="underline">
            compliance guide
          </Link>
          .
        </Notice>
      </Section>

    </SettingsPage>
  );
}
