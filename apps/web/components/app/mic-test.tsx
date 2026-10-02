'use client';
// Mic permission, device pickers, live level meter and a local echo test.
// Used in onboarding step 5 and Settings → Audio devices.
import { Mic, Volume2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getAudioPrefs, setInputDevice, setOutputDevice } from '@/lib/twilio/device';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/display';
import { Field, Select } from '@/components/ui/form';

type Permission = 'unknown' | 'granted' | 'denied';

export function MicTest({ onReady }: { onReady?: (ok: boolean) => void }) {
  const [permission, setPermission] = useState<Permission>('unknown');
  const [inputs, setInputs] = useState<MediaDeviceInfo[]>([]);
  const [outputs, setOutputs] = useState<MediaDeviceInfo[]>([]);
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [level, setLevel] = useState(0);
  const [echo, setEcho] = useState<'idle' | 'recording' | 'playing'>('idle');
  const stream = useRef<MediaStream | null>(null);
  const raf = useRef<number | null>(null);
  const ctx = useRef<AudioContext | null>(null);

  const stop = useCallback(() => {
    if (raf.current) cancelAnimationFrame(raf.current);
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    void ctx.current?.close().catch(() => {});
    ctx.current = null;
  }, []);

  const start = useCallback(
    async (deviceId?: string) => {
      stop();
      try {
        const s = await navigator.mediaDevices.getUserMedia({ audio: deviceId ? { deviceId: { exact: deviceId } } : true });
        stream.current = s;
        setPermission('granted');
        onReady?.(true);
        const devices = await navigator.mediaDevices.enumerateDevices();
        setInputs(devices.filter((d) => d.kind === 'audioinput'));
        setOutputs(devices.filter((d) => d.kind === 'audiooutput'));
        const active = s.getAudioTracks()[0]?.getSettings().deviceId ?? '';
        setInput(deviceId ?? active);

        const audio = new AudioContext();
        ctx.current = audio;
        const analyser = audio.createAnalyser();
        analyser.fftSize = 512;
        audio.createMediaStreamSource(s).connect(analyser);
        const buf = new Uint8Array(analyser.fftSize);
        const tick = () => {
          analyser.getByteTimeDomainData(buf);
          let peak = 0;
          for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i] - 128));
          setLevel(Math.min(1, peak / 64));
          raf.current = requestAnimationFrame(tick);
        };
        tick();
      } catch {
        setPermission('denied');
        onReady?.(false);
      }
    },
    [onReady, stop],
  );

  useEffect(() => {
    const prefs = getAudioPrefs();
    if (prefs.output) setOutput(prefs.output);
    return stop;
  }, [stop]);

  const runEcho = () => {
    const s = stream.current;
    if (!s || echo !== 'idle') return;
    const recorder = new MediaRecorder(s);
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => chunks.push(e.data);
    recorder.onstop = async () => {
      setEcho('playing');
      const el = new Audio(URL.createObjectURL(new Blob(chunks, { type: recorder.mimeType })));
      const sinkable = el as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> };
      if (output && sinkable.setSinkId) await sinkable.setSinkId(output).catch(() => {});
      el.onended = () => setEcho('idle');
      el.play().catch(() => setEcho('idle'));
    };
    setEcho('recording');
    recorder.start();
    setTimeout(() => recorder.stop(), 3000);
  };

  if (permission !== 'granted') {
    return (
      <div className="card flex flex-col items-start gap-3 p-4">
        <div className="flex items-center gap-2">
          <Mic size={16} strokeWidth={1.5} />
          <p className="t-h4">Microphone access</p>
          {permission === 'denied' ? <Badge tone="danger">Blocked</Badge> : null}
        </div>
        <p className="text-black-700">
          {permission === 'denied'
            ? 'Your browser blocked the microphone. Click the padlock in the address bar, allow the microphone, then try again.'
            : 'Decibels needs your microphone to place calls from the browser. Nothing is recorded during this test.'}
        </p>
        <Button variant="primary" onClick={() => start()}>
          {permission === 'denied' ? 'Try again' : 'Allow microphone'}
        </Button>
      </div>
    );
  }

  return (
    <div className="card flex flex-col gap-4 p-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Microphone" htmlFor="mic-input">
          <Select
            id="mic-input"
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              void setInputDevice(e.target.value);
              void start(e.target.value);
            }}
          >
            {inputs.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label || 'Microphone'}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Speaker" htmlFor="mic-output" hint={outputs.length ? undefined : 'This browser uses the system default speaker.'}>
          <Select
            id="mic-output"
            value={output}
            disabled={!outputs.length}
            onChange={(e) => {
              setOutput(e.target.value);
              void setOutputDevice(e.target.value);
            }}
          >
            {outputs.length ? (
              outputs.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || 'Speaker'}
                </option>
              ))
            ) : (
              <option value="">System default</option>
            )}
          </Select>
        </Field>
      </div>
      <div>
        <p className="t-small mb-1.5 text-black-700">Input level: say something</p>
        <div className="h-2 overflow-hidden rounded-full bg-white-300" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(level * 100)} aria-label="Microphone level">
          <div className="h-full rounded-full bg-success-500 transition-[width] duration-75" style={{ width: `${Math.round(level * 100)}%` }} />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Button onClick={runEcho} disabled={echo !== 'idle'}>
          <Volume2 size={16} strokeWidth={1.5} />
          {echo === 'recording' ? 'Recording 3 seconds…' : echo === 'playing' ? 'Playing back…' : 'Echo test'}
        </Button>
        <span className="t-caption text-black-700">Records 3 seconds locally and plays it back. Nothing leaves your browser.</span>
      </div>
    </div>
  );
}
