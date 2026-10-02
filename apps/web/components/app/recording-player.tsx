'use client';
// Plays a recording from the private `recordings` bucket through a 1-hour signed
// URL (never a Twilio URL). The waveform is a placeholder until V2 transcription.
import { Pause, Play } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { track } from '@/lib/analytics';
import { supabase } from '@/lib/supabase/client';
import { cn, formatDuration } from '@/lib/utils';

function bars(seed: string, n: number): number[] {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return Array.from({ length: n }, () => {
    h = (h * 1664525 + 1013904223) >>> 0;
    return 0.25 + (h / 0xffffffff) * 0.75;
  });
}

export function RecordingPlayer({ path, duration, compact }: { path: string; duration: number; compact?: boolean }) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const shape = useMemo(() => bars(path, compact ? 40 : 72), [path, compact]);

  useEffect(
    () => () => {
      audio.current?.pause();
      audio.current = null;
    },
    [],
  );

  const toggle = async () => {
    if (audio.current) {
      if (playing) audio.current.pause();
      else void audio.current.play();
      return;
    }
    setLoading(true);
    const { data, error } = await supabase().storage.from('recordings').createSignedUrl(path, 3600);
    setLoading(false);
    if (error || !data?.signedUrl) {
      setError('Recording unavailable');
      return;
    }
    const el = new Audio(data.signedUrl);
    audio.current = el;
    el.ontimeupdate = () => setPosition(el.currentTime);
    el.onplay = () => setPlaying(true);
    el.onpause = () => setPlaying(false);
    el.onended = () => {
      setPlaying(false);
      setPosition(0);
    };
    el.onerror = () => setError('Recording unavailable');
    track('recording_played');
    void el.play();
  };

  const total = duration || audio.current?.duration || 0;
  const progress = total ? Math.min(1, position / total) : 0;

  return (
    <div className={cn('flex items-center gap-3 rounded-md border border-white-800 bg-white-200', compact ? 'h-8 px-1.5' : 'h-14 px-3')}>
      <button
        onClick={toggle}
        disabled={loading || !!error}
        aria-label={playing ? 'Pause recording' : 'Play recording'}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-black-400 text-white-100 hover:bg-black-300 disabled:bg-white-500"
      >
        {playing ? <Pause size={12} fill="currentColor" strokeWidth={0} /> : <Play size={12} fill="currentColor" strokeWidth={0} />}
      </button>
      <button
        className="flex h-6 min-w-0 flex-1 items-center gap-px"
        aria-label="Seek"
        onClick={(e) => {
          if (!audio.current || !total) return;
          const rect = e.currentTarget.getBoundingClientRect();
          audio.current.currentTime = ((e.clientX - rect.left) / rect.width) * total;
        }}
      >
        {shape.map((h, i) => (
          <span key={i} className={cn('flex-1 rounded-full', i / shape.length < progress ? 'bg-accent-500' : 'bg-white-900')} style={{ height: `${Math.round(h * 100)}%` }} />
        ))}
      </button>
      <span className={cn('t-caption tabular shrink-0 truncate text-right text-black-700', compact ? 'w-[72px]' : 'w-[96px]')}>{error ? 'Unavailable' : `${formatDuration(position)} / ${formatDuration(total)}`}</span>
    </div>
  );
}
