'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';

const TO = 'privacy@decibels.io';

/**
 * There is no suppression-list backend yet, so this form does not submit anywhere.
 * It opens the visitor's own mail client with a prefilled request.
 */
export function OptOutForm() {
  const [opened, setOpened] = useState(false);

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const get = (k: string) => String(data.get(k) ?? '').trim();
    const body = [
      'I would like to opt out of the Decibels database and object to my data being processed for direct marketing.',
      '',
      `Name: ${get('name')}`,
      `Email: ${get('email')}`,
      `Phone: ${get('phone')}`,
      '',
      get('message'),
    ].join('\n');
    window.location.href = `mailto:${TO}?subject=${encodeURIComponent('Opt-out request')}&body=${encodeURIComponent(body)}`;
    setOpened(true);
  };

  const label = 't-small block text-black-400';

  return (
    <form onSubmit={onSubmit} className="mt-8 rounded-lg border border-white-800 p-4 text-[14px] leading-5 tracking-[-0.14px] sm:p-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="oo-name" className={label}>
            Full name
          </label>
          <input id="oo-name" name="name" required autoComplete="name" className="control mt-1.5" />
        </div>
        <div>
          <label htmlFor="oo-email" className={label}>
            Email
          </label>
          <input id="oo-email" name="email" type="email" required autoComplete="email" className="control mt-1.5" />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="oo-phone" className={label}>
            Phone number to remove
          </label>
          <input id="oo-phone" name="phone" type="tel" autoComplete="tel" placeholder="+44" className="control mt-1.5" aria-describedby="oo-phone-help" />
          <span id="oo-phone-help" className="t-caption mt-1.5 block text-black-700">
            Include the number that was called so we can find the right record.
          </span>
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="oo-message" className={label}>
            Anything else we should know (optional)
          </label>
          <textarea id="oo-message" name="message" rows={4} className="control mt-1.5 h-auto py-2" />
        </div>
      </div>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <Button type="submit" variant="primary">
          Open email to send request
        </Button>
        <span id="oo-help" className="t-small text-black-700">
          This form does not send anything itself. It opens your email app with a message to {TO} for you to send.
        </span>
      </div>
      {opened ? (
        <div role="status" className="mt-4 rounded-md border border-white-800 bg-canvas px-3 py-2 text-black-400">
          Your email app should have opened with a prefilled message. Your request is only made once you send that email. If nothing opened, email {TO}{' '}
          directly.
        </div>
      ) : null}
    </form>
  );
}
