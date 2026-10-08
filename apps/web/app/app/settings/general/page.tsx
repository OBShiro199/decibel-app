'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { CompanyLogo } from '@/components/ui/display';
import { Field, Input, Select } from '@/components/ui/form';
import { Dialog, useToast } from '@/components/ui/overlay';
import { useApp } from '@/lib/app-context';
import { supabase } from '@/lib/supabase/client';
import { AdminOnly, Notice, Section, SettingsPage } from '../_components';
import { HOME } from '@/lib/constants';

const SLUG = /^[a-z0-9]([a-z0-9-]{1,38}[a-z0-9])?$/;
const TEAM_SIZES = ['1', '2–5', '6–20', '21–50', '51+'];

export default function GeneralPage() {
  const { user, workspace, isAdmin, isOwner, refreshWorkspace } = useApp();
  const toast = useToast();
  const [name, setName] = useState(workspace.name);
  const [slug, setSlug] = useState(workspace.slug);
  const [website, setWebsite] = useState(workspace.website ?? '');
  const [teamSize, setTeamSize] = useState(workspace.team_size ?? '');
  const [logoUrl, setLogoUrl] = useState(workspace.logo_url ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [slugError, setSlugError] = useState<string | null>(null);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmName, setConfirmName] = useState('');
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [dangerBusy, setDangerBusy] = useState(false);
  const [dangerError, setDangerError] = useState<string | null>(null);

  const slugValid = SLUG.test(slug);
  const logoValid = !logoUrl.trim() || /^https:\/\//i.test(logoUrl.trim());
  const dirty =
    name.trim() !== workspace.name || slug !== workspace.slug || website.trim() !== (workspace.website ?? '') || teamSize !== (workspace.team_size ?? '') || logoUrl.trim() !== (workspace.logo_url ?? '');
  // Keep any legacy value selectable.
  const sizes = teamSize && !TEAM_SIZES.includes(teamSize) ? [teamSize, ...TEAM_SIZES] : TEAM_SIZES;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!isAdmin || !name.trim() || !slugValid || !logoValid) return;
    setSaving(true);
    setError(null);
    setSlugError(null);
    const { error: err } = await supabase()
      .from('workspaces')
      .update({ name: name.trim(), slug, website: website.trim() || null, team_size: teamSize || null, logo_url: logoUrl.trim() || null })
      .eq('id', workspace.id);
    setSaving(false);
    if (err) {
      if (err.code === '23505') setSlugError('That URL is already taken. Try another.');
      else setError(err.message);
      return;
    }
    await refreshWorkspace();
    toast('Saved');
  }

  async function deleteWorkspace() {
    setDangerBusy(true);
    setDangerError(null);
    const { error: err } = await supabase().from('workspaces').delete().eq('id', workspace.id);
    if (err) {
      setDangerBusy(false);
      return setDangerError(err.message);
    }
    window.location.assign(HOME);
  }

  async function leaveWorkspace() {
    setDangerBusy(true);
    setDangerError(null);
    const { error: err } = await supabase().from('workspace_members').delete().eq('workspace_id', workspace.id).eq('user_id', user.id);
    if (err) {
      setDangerBusy(false);
      return setDangerError(err.message);
    }
    window.location.assign(HOME);
  }

  return (
    <SettingsPage title="General" description="Your workspace name, URL and branding.">
      <Section title="Workspace">
        <form onSubmit={save} className="card space-y-5 p-6">
          {!isAdmin ? <AdminOnly /> : null}
          <Field label="Workspace name" htmlFor="ws_name" error={!name.trim() ? 'Enter a name.' : undefined}>
            <Input id="ws_name" value={name} onChange={(e) => setName(e.target.value)} disabled={!isAdmin} maxLength={80} />
          </Field>
          <Field
            label="Workspace URL"
            htmlFor="ws_slug"
            hint="3 to 40 characters: lowercase letters, numbers and hyphens."
            error={slugError ?? (!slugValid ? 'Use 3 to 40 lowercase letters, numbers or hyphens, starting and ending with a letter or number.' : undefined)}
          >
            <Input
              id="ws_slug"
              value={slug}
              onChange={(e) => {
                setSlug(e.target.value.toLowerCase().replace(/\s+/g, '-'));
                setSlugError(null);
              }}
              disabled={!isAdmin}
              maxLength={40}
              aria-invalid={!slugValid || Boolean(slugError)}
              className="t-mono"
            />
          </Field>
          <Field label="Website" htmlFor="ws_site">
            <Input id="ws_site" value={website} onChange={(e) => setWebsite(e.target.value)} disabled={!isAdmin} placeholder="example.co.uk" maxLength={200} />
          </Field>
          <Field label="Team size" htmlFor="ws_size">
            <Select id="ws_size" value={teamSize} onChange={(e) => setTeamSize(e.target.value)} disabled={!isAdmin}>
              <option value="">Not set</option>
              {sizes.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Logo URL" htmlFor="ws_logo" hint="A square image works best." error={!logoValid ? 'Enter a link that starts with https://' : undefined}>
            <div className="flex items-center gap-3">
              <CompanyLogo name={name} src={logoValid ? logoUrl.trim() || null : null} size={36} />
              <Input id="ws_logo" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} disabled={!isAdmin} placeholder="https://example.co.uk/logo.png" aria-invalid={!logoValid} className="min-w-0 flex-1" />
            </div>
          </Field>
          {error ? <Notice tone="danger">{error}</Notice> : null}
          {isAdmin ? (
            <div className="flex justify-end">
              <Button type="submit" variant="primary" loading={saving} disabled={!dirty || !name.trim() || !slugValid || !logoValid}>
                Save
              </Button>
            </div>
          ) : null}
        </form>
      </Section>

      <Section title="Danger zone">
        <div className="card divide-y divide-white-800">
          {!isOwner ? (
            <div className="flex flex-wrap items-center gap-4 p-6">
              <div className="min-w-0 flex-1">
                <p>Leave workspace</p>
                <p className="t-small mt-0.5 text-black-700">You will lose access to {workspace.name} straight away. An admin can invite you back.</p>
              </div>
              <Button onClick={() => { setDangerError(null); setLeaveOpen(true); }}>Leave workspace</Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-4 p-6">
              <div className="min-w-0 flex-1">
                <p>Delete workspace</p>
                <p className="t-small mt-0.5 text-black-700">Permanently deletes people, lists, calls and recordings for everyone. This cannot be undone.</p>
              </div>
              <Button variant="danger" onClick={() => { setDangerError(null); setConfirmName(''); setDeleteOpen(true); }}>
                Delete workspace
              </Button>
            </div>
          )}
        </div>
      </Section>

      <Dialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Delete workspace"
        description="This permanently deletes the workspace and all of its data for every member. Cancel any paid subscription in Billing first."
        footer={
          <>
            <Button onClick={() => setDeleteOpen(false)}>Cancel</Button>
            <Button variant="danger" loading={dangerBusy} disabled={confirmName.trim() !== workspace.name} onClick={deleteWorkspace}>
              Delete workspace
            </Button>
          </>
        }
      >
        <Field label={<>Type <span className="text-black-400">{workspace.name}</span> to confirm</>} htmlFor="confirm_delete">
          <Input id="confirm_delete" value={confirmName} onChange={(e) => setConfirmName(e.target.value)} autoComplete="off" />
        </Field>
        {dangerError ? <Notice tone="danger" className="mt-4">{dangerError}</Notice> : null}
      </Dialog>

      <Dialog
        open={leaveOpen}
        onClose={() => setLeaveOpen(false)}
        title="Leave workspace"
        description={`You will lose access to ${workspace.name} straight away.`}
        footer={
          <>
            <Button onClick={() => setLeaveOpen(false)}>Cancel</Button>
            <Button variant="danger" loading={dangerBusy} onClick={leaveWorkspace}>
              Leave workspace
            </Button>
          </>
        }
      >
        {dangerError ? <Notice tone="danger">{dangerError}</Notice> : null}
      </Dialog>
    </SettingsPage>
  );
}
