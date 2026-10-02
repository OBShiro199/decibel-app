'use client';
// Decibel is desktop only for now: the dialler runs in the browser beside the
// record and needs a laptop or desktop with a headset. On phones and tablets the
// sign-up form is swapped for this note. The swap is pure CSS (see .desktop-gate
// in globals.css), so there's no flash of the wrong view on load.
import { Check, Copy, Monitor } from 'lucide-react';
import { useState } from 'react';
import { Button, ButtonLink } from '@/components/ui/button';

export function DesktopOnly({ children }: { children: React.ReactNode }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked: the URL is still visible in the address bar */
    }
  };
  return (
    <>
      <div className="desktop-gate card p-6 text-center">
        <Monitor size={20} strokeWidth={1.5} className="mx-auto text-black-700" />
        <h1 className="t-h3 mt-3">Sign up on your computer</h1>
        <p className="mt-2 text-black-700">
          Decibel runs on desktop only. The dialler works in Chrome beside your records, so you will need a laptop or desktop and a headset. Open
          this page on your computer to start your free trial.
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <Button variant="primary" onClick={copy}>
            {copied ? <Check size={15} strokeWidth={1.5} /> : <Copy size={15} strokeWidth={1.5} />}
            {copied ? 'Link copied' : 'Copy link for later'}
          </Button>
          <ButtonLink href="/" variant="ghost">
            Back to the homepage
          </ButtonLink>
        </div>
      </div>
      <div className="desktop-content">{children}</div>
    </>
  );
}
