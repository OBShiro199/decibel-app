'use client';
import { Monitor, Moon, Sun } from 'lucide-react';
import { Badge, OptionCard } from '@/components/ui/display';
import { Section, SettingsPage } from '../_components';

export default function AppearancePage() {
  return (
    <SettingsPage title="Appearance" description="Choose how Decibels looks on this device.">
      <Section title="Theme" description="Decibels is light only for now. Dark and system themes will follow.">
        <div role="radiogroup" aria-label="Theme" className="grid gap-3 sm:grid-cols-3">
          <OptionCard icon={Sun} title="Light" description="The default." selected onSelect={() => {}} radio />
          <OptionCard icon={Moon} title="Dark" description="Not available yet." selected={false} onSelect={() => {}} radio disabled badge={<Badge>Later</Badge>} />
          <OptionCard icon={Monitor} title="System" description="Not available yet." selected={false} onSelect={() => {}} radio disabled badge={<Badge>Later</Badge>} />
        </div>
      </Section>
    </SettingsPage>
  );
}
