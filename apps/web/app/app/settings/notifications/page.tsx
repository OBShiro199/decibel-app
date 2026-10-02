'use client';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Switch } from '@/components/ui/form';
import { useToast } from '@/components/ui/overlay';
import { useApp } from '@/lib/app-context';
import { supabase } from '@/lib/supabase/client';
import { Notice, Section, SettingsPage } from '../_components';

const PREFS: { key: string; title: string; description: string }[] = [
  { key: 'missed_inbound', title: 'Missed inbound calls', description: 'When someone calls one of your numbers back and you miss it.' },
  { key: 'task_due', title: 'Tasks due', description: 'When a task or call-back assigned to you is due.' },
  { key: 'number_status', title: 'Phone number status', description: 'When a number you requested is approved or rejected.' },
  { key: 'weekly_summary', title: 'Weekly summary', description: 'Calls, connects and meetings booked, every Monday morning.' },
  { key: 'trial_reminders', title: 'Trial reminders', description: 'A heads-up before your trial ends.' },
];

export default function NotificationsPage() {
  const { user, profile } = useApp();
  const qc = useQueryClient();
  const toast = useToast();
  const [prefs, setPrefs] = useState<Record<string, boolean>>(profile.notification_prefs ?? {});
  const [error, setError] = useState<string | null>(null);

  async function toggle(key: string, on: boolean) {
    const previous = prefs;
    const next = { ...prefs, [key]: on };
    setPrefs(next);
    setError(null);
    const { error: err } = await supabase().from('profiles').update({ notification_prefs: next }).eq('id', user.id);
    if (err) {
      setPrefs(previous);
      setError(err.message);
      return;
    }
    void qc.invalidateQueries({ queryKey: ['profile'] });
    toast('Saved');
  }

  return (
    <SettingsPage title="Notifications" description="Choose which emails Decibel sends you. These apply to you only.">
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <Section title="Email notifications">
        <ul className="card divide-y divide-white-800">
          {PREFS.map((p) => (
            <li key={p.key} className="flex items-center gap-4 px-6 py-4">
              <div className="min-w-0 flex-1">
                <p>{p.title}</p>
                <p className="t-small mt-0.5 text-black-700">{p.description}</p>
              </div>
              {/* Unset keys default to on */}
              <Switch checked={prefs[p.key] !== false} onChange={(v) => toggle(p.key, v)} aria-label={p.title} />
            </li>
          ))}
        </ul>
      </Section>
    </SettingsPage>
  );
}
