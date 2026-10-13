'use client';
import { EmptyState } from '@/components/ui/display';
import { Field } from '@/components/ui/form';
import { useToast } from '@/components/ui/overlay';
import { useApp } from '@/lib/app-context';
import { CopyField, Section, SettingsPage } from '../_components';

export default function DevelopersPage() {
  const { workspace } = useApp();
  const toast = useToast();
  const base = `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''}/functions/v1`;
  return (
    <SettingsPage title="Developers" description="Identifiers for support and integrations.">
      <Section title="API keys">
        <div className="card">
          <EmptyState shape="diamond" title="Coming in V2" description="A public API and API keys are planned for the next version. There is nothing to configure yet." />
        </div>
      </Section>
      <Section title="Identifiers">
        <div className="card space-y-5 p-6">
          <Field label="Workspace ID" hint="Quote this when you contact support.">
            <CopyField value={workspace.id} onCopied={() => toast('Workspace ID copied')} />
          </Field>
          <Field label="Webhook and Edge Function base URL" hint="Twilio and Stripe webhooks are served from this address.">
            <CopyField value={base} onCopied={() => toast('URL copied')} />
          </Field>
        </div>
      </Section>
    </SettingsPage>
  );
}
