'use client';
import { MicTest } from '@/components/app/mic-test';
import { Section, SettingsPage } from '../_components';

export default function AudioPage() {
  return (
    <SettingsPage title="Audio devices" description="Check your microphone before you start dialling.">
      <Section title="Microphone test">
        <div className="card p-6">
          <MicTest />
        </div>
      </Section>
      <Section title="Supported browsers">
        <div className="card p-6 text-black-700">
          <ul className="list-disc space-y-1 pl-5">
            <li>Chrome, Edge and Safari 15 or later are fully supported.</li>
            <li>Firefox works on a best-effort basis.</li>
            <li>Calls need a secure connection (HTTPS) and permission to use your microphone.</li>
            <li>A wired or USB headset gives the clearest audio. Bluetooth headsets can add delay.</li>
          </ul>
        </div>
      </Section>
    </SettingsPage>
  );
}
