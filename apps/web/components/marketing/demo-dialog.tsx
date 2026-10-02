'use client';
import { Play } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/overlay';
import { trackMarketing } from './analytics';

const raw = process.env.NEXT_PUBLIC_DEMO_VIDEO_URL;
const videoUrl = raw && /^https:\/\//.test(raw) ? raw : null;

export function DemoButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        size="lg"
        variant="outline"
        aria-haspopup="dialog"
        onClick={() => {
          setOpen(true);
          trackMarketing('demo_open');
        }}
      >
        <Play size={16} strokeWidth={1.5} />
        Watch a 2-min demo
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Decibel in two minutes" width={800}>
        {videoUrl ? (
          <div className="aspect-video overflow-hidden rounded-md border border-white-800 bg-canvas">
            <iframe
              src={videoUrl}
              title="Decibel product demo"
              className="h-full w-full"
              loading="lazy"
              allow="autoplay; fullscreen; picture-in-picture"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
            />
          </div>
        ) : (
          <div className="flex aspect-video flex-col items-center justify-center rounded-md border border-dashed border-white-800 bg-canvas px-6 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full border border-white-800 bg-white-100 text-black-700">
              <Play size={20} strokeWidth={1.5} />
            </span>
            <p className="t-h4 mt-4 text-black-0">Demo video coming soon</p>
            <p className="mt-1 max-w-sm text-black-700">We are recording the walkthrough. In the meantime the free trial is the quickest way to see Decibel working.</p>
          </div>
        )}
      </Dialog>
    </>
  );
}
