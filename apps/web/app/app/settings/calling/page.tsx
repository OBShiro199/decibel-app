'use client';
import { useQueryClient } from '@tanstack/react-query';
import { Play, Square } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { describeError } from '@/components/app/number-flows';
import { Button } from '@/components/ui/button';
import { ErrorCard, OptionCard, Skeleton } from '@/components/ui/display';
import { Field, Select, Textarea } from '@/components/ui/form';
import { useToast } from '@/components/ui/overlay';
import { useApp } from '@/lib/app-context';
import { useNumbers } from '@/lib/hooks';
import { invoke, supabase } from '@/lib/supabase/client';
import type { RecordingPolicy } from '@/lib/types';
import { formatPhone } from '@/lib/utils';
import { AdminOnly, Notice, Section, SettingsPage } from '../_components';

const POLICIES: { value: RecordingPolicy; title: string; description: string }[] = [
  { value: 'always', title: 'Always', description: 'Every call is recorded. The notice plays to the person you call as soon as they answer.' },
  { value: 'rep_choice', title: "Rep's choice", description: 'Each rep switches recording on or off in the softphone. The notice plays whenever recording is on.' },
  { value: 'never', title: 'Never', description: 'Nothing is recorded and no notice plays.' },
];
const MAX_NOTICE = 300;

export default function CallingPage() {
  const { workspace, isAdmin, refreshWorkspace } = useApp();
  const qc = useQueryClient();
  const toast = useToast();
  const numbers = useNumbers();
  const [policy, setPolicy] = useState<RecordingPolicy>(workspace.recording_policy);
  const [notice, setNotice] = useState(workspace.recording_notice_text ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [callerBusy, setCallerBusy] = useState(false);
  const [callerError, setCallerError] = useState<string | null>(null);

  useEffect(() => () => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
  }, []);

  const dirty = policy !== workspace.recording_policy || notice.trim() !== (workspace.recording_notice_text ?? '');
  const noticeMissing = policy !== 'never' && !notice.trim();
  const active = (numbers.data ?? []).filter((n) => n.status === 'active');
  const defaultId = active.find((n) => n.is_default)?.id ?? '';

  function play() {
    if (!('speechSynthesis' in window)) return toast('Your browser cannot play a preview');
    if (speaking) {
      window.speechSynthesis.cancel();
      return setSpeaking(false);
    }
    const u = new SpeechSynthesisUtterance(notice.trim());
    u.lang = 'en-GB';
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
    setSpeaking(true);
  }

  async function save() {
    if (!isAdmin || noticeMissing) return;
    setSaving(true);
    setError(null);
    const { error: err } = await supabase().from('workspaces').update({ recording_policy: policy, recording_notice_text: notice.trim() }).eq('id', workspace.id);
    setSaving(false);
    if (err) return setError(err.message);
    await refreshWorkspace();
    toast('Saved');
  }

  async function setDefault(id: string) {
    if (!id || id === defaultId) return;
    setCallerBusy(true);
    setCallerError(null);
    try {
      await invoke('twilio-numbers', { workspace_id: workspace.id, action: 'set_default', id });
      await qc.invalidateQueries({ queryKey: ['numbers'] });
      toast('Default caller ID updated');
    } catch (e) {
      setCallerError(describeError(e));
    } finally {
      setCallerBusy(false);
    }
  }

  return (
    <SettingsPage title="Calling & recording" description="Decide when calls are recorded and what the person you call hears.">
      {!isAdmin ? <AdminOnly /> : null}

      <Section
        title="Recording policy"
        description="Applies to every outbound call in this workspace."
        footer={
          isAdmin ? (
            <Button variant="primary" loading={saving} disabled={!dirty || noticeMissing} onClick={save}>
              Save
            </Button>
          ) : undefined
        }
      >
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-5">
            <div role="radiogroup" aria-label="Recording policy" className="space-y-2">
              {POLICIES.map((p) => (
                <OptionCard key={p.value} title={p.title} description={p.description} selected={policy === p.value} onSelect={() => setPolicy(p.value)} radio disabled={!isAdmin} />
              ))}
            </div>
            <Field
              label="Recording notice"
              htmlFor="notice"
              hint={`${notice.length}/${MAX_NOTICE} characters. Read aloud to the person you call before recording starts.`}
              error={noticeMissing ? 'Enter the notice that plays when a call is recorded.' : undefined}
            >
              <Textarea id="notice" value={notice} maxLength={MAX_NOTICE} rows={3} disabled={!isAdmin || policy === 'never'} onChange={(e) => setNotice(e.target.value.slice(0, MAX_NOTICE))} />
            </Field>
            {error ? <Notice tone="danger">{error}</Notice> : null}
          </div>

          <div className="self-start rounded-lg border border-white-800 bg-white-100 p-6 text-black-400">
            <p className="t-small text-white-900">What the person you call hears</p>
            {policy === 'never' ? (
              <p className="t-body-lg mt-3">Nothing: calls are not recorded.</p>
            ) : (
              <>
                <p className="t-body-lg mt-3 break-words">“{notice.trim() || '…'}”</p>
                <button
                  type="button"
                  onClick={play}
                  disabled={!notice.trim()}
                  className="t-small mt-4 inline-flex h-8 items-center gap-2 rounded-sm border border-btnborder px-3 transition-colors hover:border-black-700 disabled:opacity-50"
                >
                  {speaking ? <Square size={14} strokeWidth={1.5} /> : <Play size={14} strokeWidth={1.5} />}
                  {speaking ? 'Stop' : 'Play preview'}
                </button>
                <p className="t-caption mt-4 text-white-900">
                  {policy === 'always' ? 'Plays on every call, when they answer.' : 'Plays only on calls where the rep has recording switched on.'} The preview uses your browser voice; the voice on real calls differs.
                </p>
              </>
            )}
          </div>
        </div>
      </Section>

      <Section title="Default caller ID" description="The number people see when a rep has no number of their own assigned.">
        {numbers.isError ? (
          <ErrorCard message="Could not load phone numbers." onRetry={() => numbers.refetch()} />
        ) : (
          <div className="card p-6">
            {numbers.isLoading ? (
              <Skeleton className="h-9 w-full max-w-sm" />
            ) : !active.length ? (
              <p className="text-black-700">
                No active number yet.{' '}
                <Link href="/app/settings/phone-numbers" className="link">
                  Get a number
                </Link>{' '}
                to place calls.
              </p>
            ) : (
              <Field label="Caller ID" htmlFor="caller_id" hint="Changes apply straight away." error={callerError ?? undefined} className="max-w-sm">
                <Select id="caller_id" value={defaultId} disabled={!isAdmin || callerBusy} onChange={(e) => setDefault(e.target.value)}>
                  {!defaultId ? <option value="">Choose a number</option> : null}
                  {active.map((n) => (
                    <option key={n.id} value={n.id}>
                      {formatPhone(n.e164)}
                      {n.friendly_name && n.friendly_name !== n.e164 ? ` (${n.friendly_name})` : ''}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
          </div>
        )}
      </Section>
    </SettingsPage>
  );
}
