'use client';
// Daygent-system building blocks for the landing page: scroll reveals, the
// procedural ASCII / ordered-dither canvas, marquee, live pill, console chrome,
// the light "engine" and the single pricing card.
import { useEffect, useRef, useState } from 'react';
import { ANNUAL_DISCOUNT, PLANS } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { CtaLink, trackMarketing } from './analytics';

// ------------------------------------------------------------------ reveal --
export function Reveal({ children, delay = 0, className, eager }: { children: React.ReactNode; delay?: number; className?: string; eager?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || eager) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold: 0.12 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [eager]);
  // eager = above the fold: a pure CSS animation, visible even before hydration
  if (eager) {
    return (
      <div className={cn('hero-in', className)} style={{ animationDelay: `${delay}ms` }}>
        {children}
      </div>
    );
  }
  return (
    <div ref={ref} data-in={shown} className={cn('reveal', className)} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

// ------------------------------------------------------------- ascii canvas --
const RAMP = ' .·:;+=oxX#%@';
const BAYER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];
const hash = (x: number, y: number) => {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

export type Scene = 'signal' | 'radar' | 'bars' | 'engine';

/** Intensity 0..1 for a cell. u,v are centred coords (v scaled so cells read square). */
function field(scene: Scene, u: number, v: number, t: number, col: number, row: number, cols: number, rows: number, p: number): number {
  if (scene === 'signal') {
    // a call going out: rings from the source, plus a carrier waveform through the middle
    const d = Math.hypot(u + 0.55, v);
    const rings = (0.5 + 0.5 * Math.sin(d * 14 - t * 2.4)) * Math.max(0, 1 - d * 0.62);
    const wave = Math.sin(u * 9 + t * 1.6) * 0.16 * (0.6 + 0.4 * Math.sin(u * 2.3 - t * 0.7));
    const band = Math.max(0, 1 - Math.abs(v - wave) * 9) * Math.max(0, Math.min(1, (u + 0.5) * 1.6));
    return Math.min(1, rings * 0.8 + band * 0.75);
  }
  if (scene === 'radar') {
    // TPS screening: a sweep over scattered numbers, most clear, a few blocked
    const d = Math.hypot(u, v);
    if (d > 0.92) return 0;
    const a = Math.atan2(v, u);
    const sweep = (((a - t * 1.1) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const trail = Math.pow(1 - sweep / (Math.PI * 2), 5);
    const ring = Math.max(0, 1 - Math.abs((d * 3) % 1 - 0.5) * 16) * 0.22;
    const blip = hash(Math.floor(col / 3), Math.floor(row / 2)) > 0.93 ? 0.9 * trail + 0.15 : 0;
    return Math.min(1, trail * 0.55 + ring + blip);
  }
  if (scene === 'bars') {
    // live audio level: equaliser columns
    const band = Math.floor(col / 2);
    const h = 0.18 + 0.72 * Math.abs(Math.sin(band * 0.9 + t * 2.1) * Math.sin(band * 0.37 - t * 1.3));
    const y = 1 - row / rows;
    return col % 2 === 0 && y < h ? 0.35 + 0.65 * (y / h) : 0;
  }
  // engine: scroll progress p morphs noise (a raw list) -> rings (the call) -> ordered columns (the pipeline)
  const noise = hash(col, row + Math.floor(t * 2)) > 0.9 ? 0.55 + 0.45 * hash(row, col) : 0;
  const d = Math.hypot(u, v);
  const rings = (0.5 + 0.5 * Math.sin(d * 16 - t * 2.6)) * Math.max(0, 1 - d * 0.9);
  const stage = Math.floor((col / cols) * 5);
  const fill = [0.9, 0.7, 0.52, 0.36, 0.22][stage] ?? 0.2;
  const y = 1 - row / rows;
  // dotted (every other cell) so the pipeline columns read light on white, not as solid blocks
  const colsField = (row + col) % 2 === 0 && col % Math.max(2, Math.floor(cols / 5)) > 1 && y < fill + 0.03 * Math.sin(t + stage) ? 0.3 + 0.5 * (y / fill) : 0;
  const a = Math.max(0, 1 - p * 3);
  const b = Math.max(0, 1 - Math.abs(p - 0.5) * 3.2);
  const c = Math.max(0, (p - 0.62) * 2.7);
  return Math.min(1, noise * a + rings * b + colsField * c);
}

export function AsciiCanvas({
  scene,
  className,
  color = '#2c2c2a',
  progress,
  cell = 13,
  intensity = 1,
}: {
  scene: Scene;
  className?: string;
  color?: string;
  /** 0..1, read every frame; used by the engine scene */
  progress?: React.RefObject<number>;
  cell?: number;
  /** Scales the scene's density; below 1 draws lighter, sparser characters. */
  intensity?: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const mono = getComputedStyle(document.documentElement).getPropertyValue('--font-sans') || 'sans-serif';
    let raf = 0;
    let visible = true;
    let w = 0;
    let h = 0;
    const cw = cell * 0.62;
    const ch = cell * 1.18;

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const draw = (ms: number) => {
      const t = ms / 1000;
      const cols = Math.ceil(w / cw);
      const rows = Math.ceil(h / ch);
      const aspect = w / Math.max(1, h);
      ctx.clearRect(0, 0, w, h);
      ctx.font = `500 ${cell}px ${mono}, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle = color;
      const p = progress?.current ?? 0;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const u = ((c + 0.5) / cols - 0.5) * 2 * Math.min(1.6, aspect);
          const v = ((r + 0.5) / rows - 0.5) * 2;
          const i = field(scene, u, v, t, c, r, cols, rows, p) * intensity;
          if (i <= 0.04) continue;
          // ordered (Bayer) dither picks between neighbouring ramp characters
          const level = i * (RAMP.length - 1) + (BAYER[r & 3][c & 3] / 16 - 0.5);
          const chr = RAMP[Math.max(0, Math.min(RAMP.length - 1, Math.round(level)))];
          if (chr !== ' ') ctx.fillText(chr, c * cw + cw / 2, r * ch);
        }
      }
    };
    const loop = (ms: number) => {
      if (visible) draw(ms);
      raf = requestAnimationFrame(loop);
    };
    resize();
    const ro = new ResizeObserver(() => {
      resize();
      if (reduced) draw(4000);
    });
    ro.observe(canvas);
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
    io.observe(canvas);
    if (reduced) draw(4000);
    else raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
    };
  }, [scene, color, progress, cell, intensity]);
  return <canvas ref={ref} aria-hidden className={cn('block h-full w-full', className)} />;
}

// -------------------------------------------------------------- small parts --
export function LivePill({ children }: { children: React.ReactNode }) {
  return (
    <span className="relative inline-flex overflow-hidden rounded-sm p-px">
      <span className="spin-ring absolute inset-[-150%]" style={{ background: 'conic-gradient(from 0deg, #e7e7e3 0deg, #e7e7e3 250deg, #1d9d5b 320deg, #e7e7e3 360deg)' }} aria-hidden />
      <span className="relative inline-flex h-8 items-center gap-2 rounded-sm bg-white-100 px-3 tabular-nums text-xs tracking-[0.06em] text-black-700">
        <span className="pulse-dot bg-[#1d9d5b]" />
        {children}
      </span>
    </span>
  );
}

export function Status({ color = '#1d9d5b', children }: { color?: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 tabular-nums text-xs tracking-[0.06em] text-black-700">
      <span className="pulse-dot" style={{ background: color, width: 6, height: 6 }} />
      {children}
    </span>
  );
}

export function Console({ file, right, children, className }: { file: string; right?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('overflow-hidden rounded-card border border-white-800 bg-white-100', className)}>
      <div className="flex h-10 items-center gap-2 border-b border-rule bg-panel px-4">
        {[0, 1, 2].map((i) => (
          <span key={i} className="h-[11px] w-[11px] rounded-full bg-[#e2e2dd]" />
        ))}
        <span className="ml-2 tabular-nums text-xs text-white-900">{file}</span>
        <span className="ml-auto">{right}</span>
      </div>
      {children}
    </div>
  );
}

export function Marquee({ rows }: { rows: string[][] }) {
  return (
    <div className="marquee-mask overflow-hidden py-6" aria-hidden>
      {rows.map((words, r) => (
        <div key={r} className="marquee-track" style={{ animationDirection: r % 2 ? 'reverse' : 'normal', animationDuration: `${38 + r * 9}s` }}>
          {[0, 1].map((dup) => (
            <div key={dup} className="flex shrink-0 items-center">
              {words.map((w, i) => (
                <span key={`${dup}-${i}`} className="flex items-center">
                  <span className={cn('whitespace-nowrap px-4 font-medium leading-[1.3] tracking-[-0.045em]', (i + r) % 2 ? 'text-[#d9d9d4]' : 'text-black-400')} style={{ fontSize: 'clamp(24px,2.6vw,34px)' }}>
                    {w}
                  </span>
                  <span className="tabular-nums text-sm tracking-[0.06em] text-faint">{'///'}</span>
                </span>
              ))}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ------------------------------------------------------------- hero console --
const QUEUE = [
  ['Oliver Hartley', 'Brightmoor Software', '+44 7700 900101'],
  ['Priya Raman', 'Harrow & Finch', '+44 7700 900102'],
  ['James Whitfield', 'Northgate Logistics', '+44 7700 900103'],
  ['Sarah Okafor', 'Pennine Precision', '+44 7700 900104'],
  ['Tom Bradshaw', 'Cobalt Digital', '+44 7700 900105'],
  ['Fiona MacLeod', 'Thistle Financial', '+44 7700 900106'],
];
const STATES = ['Queued', 'Dialling', 'Ringing', 'In call', 'Meeting booked'];

export function HeroConsole() {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const t = setInterval(() => setTick((n) => n + 1), 1400);
    return () => clearInterval(t);
  }, []);
  const active = Math.floor(tick / 5) % 5; // Fiona (index 5) is never dialled: TPS listed
  const phase = tick % 5;
  return (
    <Console file="today.queue" right={<Status>{STATES[Math.max(1, phase)]}</Status>}>
      <div className="grid md:grid-cols-[1.1fr_1fr]">
        <div className="relative h-[250px] border-b border-rule md:h-[330px] md:border-b-0 md:border-r">
          <AsciiCanvas scene="signal" />
          <span className="absolute left-3 top-3 tabular-nums text-xs tracking-[0.06em] text-faint">[ Outbound ]</span>
          <span className="absolute bottom-3 right-3 tabular-nums text-xs tracking-[0.06em] text-faint">[ 48 kHz Opus ]</span>
        </div>
        <ul className="tabular-nums text-xs">
          {QUEUE.map(([name, company, number], i) => {
            const blocked = i === 5;
            const done = !blocked && i < active;
            const live = i === active;
            const label = blocked ? 'TPS blocked' : done ? 'Logged' : live ? STATES[phase] : 'Queued';
            return (
              <li key={name} className={cn('flex h-[55px] items-center gap-3 border-b border-rule px-4 last:border-b-0', live && 'bg-panel')}>
                <span className="w-5 text-faint">{String(i + 1).padStart(2, '0')}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-sans text-sm font-medium text-black-400">{name}</span>
                  <span className="block truncate text-xs text-white-900">{company} · {number}</span>
                </span>
                <span
                  className={cn('w-[124px] shrink-0 text-right text-xs tracking-[0.06em]', blocked ? 'text-danger-500' : live ? 'text-accent-500' : done ? 'text-success-500' : 'text-faint')}
                >
                  {live ? <span className="pulse-dot mr-1.5 bg-accent-500 align-middle" style={{ width: 6, height: 6 }} /> : null}
                  {label}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </Console>
  );
}

// ------------------------------------------------------------ demo panels ---
const REVEAL_ROWS = [
  ['Aisling Doherty', 'CEO', '+447700900117'],
  ['Rahul Mehta', 'CTO', '+447700900109'],
  ['Charlotte Nkemelu', 'Commercial Director', '+447700900108'],
  ['Andrew Patel', 'VP Operations', '+447700900114'],
  ['Emily Chen', 'Head of Partnerships', '+447700900111'],
  ['Michael Fenwick', 'Managing Partner', '+447700900112'],
];

export function RevealPanel() {
  const [n, setN] = useState(2);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const t = setInterval(() => setN((v) => (v >= REVEAL_ROWS.length ? 0 : v + 1)), 1300);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="h-[258px] overflow-hidden bg-white-100 p-5 tabular-nums text-xs leading-[26px] text-black-700">
      <p className="text-faint">Search: C-level and directors · has mobile · TPS clear</p>
      {REVEAL_ROWS.map(([name, title, mobile], i) => (
        <p key={name} className="flex gap-3 whitespace-nowrap">
          <span className="w-[124px] shrink-0 truncate text-black-500">{name}</span>
          <span className="w-[118px] shrink-0 truncate max-sm:hidden">{title}</span>
          <span className={i < n ? 'text-black-400' : 'text-faint'}>{i < n ? mobile : `${mobile.slice(0, 4)} ••••••${mobile.slice(-3)}`}</span>
          {i < n ? <span className="text-success-500" title="1 credit">✓</span> : null}
        </p>
      ))}
      <p className="text-faint">
        Credits left: <span className="text-black-400">{50 - n}</span>
      </p>
    </div>
  );
}

const STAGES: [string, number][] = [
  ['New', 42],
  ['Attempted', 31],
  ['Connected', 17],
  ['Meeting booked', 9],
  ['Qualified', 5],
  ['Won', 2],
];
export function PipelinePanel() {
  return (
    <div className="h-[258px] overflow-hidden bg-white-100 p-5 tabular-nums text-xs leading-[30px] text-black-700">
      {STAGES.map(([name, count]) => (
        <p key={name} className="flex items-center gap-3 whitespace-nowrap">
          <span className="w-[120px] text-black-500">{name}</span>
          <span className="flex-1 overflow-hidden text-faint">
            <span className="text-black-400">{'█'.repeat(Math.round(count / 2))}</span>
            {'░'.repeat(24 - Math.round(count / 2))}
          </span>
          <span className="w-6 text-right text-black-400">{count}</span>
        </p>
      ))}
      <p className="text-faint">Outcomes move the stage automatically</p>
    </div>
  );
}

// ------------------------------------------------------------------ engine --
const PHASES = [
  ['01', 'A raw list.', 'Filter over a million verified mobiles by title, seniority, size and country. Reveal only the ones you will call.'],
  ['02', 'One click, one call.', 'The dialler screens TPS and your do-not-call list, then rings their mobile from your browser.'],
  ['03', 'An ordered pipeline.', 'Pick an outcome. The record, the recording and the stage update before the next call connects.'],
];

/**
 * The engine, light version: a normal section (no scroll-jacking, no dark band).
 * Three phases on the left; a bordered ASCII panel on the right morphs from a raw
 * list to a call to an ordered pipeline as the phases cycle. Fixed height, so the
 * changing captions never move the page.
 */
export function Engine() {
  const progress = useRef(0);
  const [phase, setPhase] = useState(0);
  const [held, setHeld] = useState(false);
  useEffect(() => {
    if (held || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const t = setInterval(() => setPhase((p) => (p + 1) % PHASES.length), 4500);
    return () => clearInterval(t);
  }, [held]);
  // ease the scene towards the active phase (0, 0.5, 1)
  useEffect(() => {
    const target = phase / (PHASES.length - 1);
    let raf = 0;
    const step = () => {
      progress.current += (target - progress.current) * 0.06;
      if (Math.abs(target - progress.current) > 0.002) raf = requestAnimationFrame(step);
      else progress.current = target;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [phase]);

  return (
    <section className="rail" aria-label="How a call moves through Decibel">
      <div className="grid md:grid-cols-[1fr_1.1fr]">
        <div className="flex flex-col justify-center border-b border-white-800 px-5 py-10 md:border-b-0 md:border-r md:px-10">
          <p className="eyebrow">[ The engine ]</p>
          <ol className="mt-6 flex flex-col">
            {PHASES.map(([n, title, body], i) => (
              <li key={n}>
                <button
                  onClick={() => {
                    setPhase(i);
                    setHeld(true);
                  }}
                  className={cn('group block w-full border-t border-white-800 py-5 text-left transition-colors', i === phase ? '' : 'opacity-50 hover:opacity-80')}
                  aria-current={i === phase ? 'step' : undefined}
                >
                  <span className="flex items-baseline gap-4">
                    <span className="w-8 text-xs tabular-nums text-white-900">{n}</span>
                    <span className="text-lg font-medium tracking-[-0.03em] text-black-400">{title}</span>
                  </span>
                  {/* progress towards the next phase; a fixed 2px track, so nothing moves */}
                  <span className="mt-3 block h-[2px] overflow-hidden bg-white-800 ml-12" aria-hidden>
                    {i === phase ? (
                      <span key={held ? 'held' : phase} className={cn('block h-full origin-left bg-black-400', held ? 'scale-x-100' : 'engine-progress')} />
                    ) : null}
                  </span>
                  {/* every description keeps its space, so switching phase never changes height */}
                  <span className={cn('mt-1.5 block pl-12 text-base leading-[24px] text-black-700 transition-opacity duration-300', i === phase ? 'opacity-100' : 'opacity-0')}>{body}</span>
                </button>
              </li>
            ))}
          </ol>
        </div>
        <div className="relative h-[340px] overflow-hidden bg-white-100 md:h-auto md:min-h-[440px]">
          <div className="absolute inset-0">
            <AsciiCanvas scene="engine" color="#c4c4bf" progress={progress} cell={12} intensity={0.55} />
          </div>
          <span className="absolute left-4 top-4 text-xs text-faint">[ {String(phase + 1).padStart(2, '0')} / 03 ]</span>
        </div>
      </div>
    </section>
  );
}

// ----------------------------------------------------------------- pricing --
const INCLUDED: Record<'starter' | 'growth', string[]> = {
  starter: ['500 mobile reveals per seat, every month', 'Browser dialler with a UK number per seat', 'Every call recorded, kept 90 days', 'TPS and CTPS screening on every dial', 'Lists, pipeline, CSV import'],
  growth: ['2,000 mobile reveals per seat, every month', 'Browser dialler with a UK number per seat', 'Every call recorded, kept 1 year', 'TPS and CTPS screening on every dial', 'Lists, pipeline, CSV import', 'Per-rep dashboard and call review'],
};

export function PricingCard() {
  const [plan, setPlan] = useState<'starter' | 'growth'>('growth');
  const [annual, setAnnual] = useState(false);
  const base = PLANS[plan].monthly;
  const price = annual ? base * (1 - ANNUAL_DISCOUNT) : base;
  const seg = (on: boolean) => cn('h-8 px-3 tabular-nums text-xs tracking-[0.06em] transition-colors', on ? 'bg-white-300 text-black-400' : 'text-black-700 hover:bg-white-300');
  return (
    <div className="overflow-hidden rounded-card border border-white-800 bg-white-100">
      <div className="grid md:grid-cols-2">
        <div className="border-b border-rule p-7 md:border-b-0 md:border-r md:p-9">
          <div className="flex flex-wrap gap-2">
            <div className="flex border border-btnborder" role="radiogroup" aria-label="Plan">
              {(['starter', 'growth'] as const).map((p) => (
                <button key={p} role="radio" aria-checked={plan === p} className={seg(plan === p)} onClick={() => setPlan(p)}>
                  {PLANS[p].name}
                </button>
              ))}
            </div>
            <div className="flex border border-btnborder" role="radiogroup" aria-label="Billing interval">
              {[false, true].map((a) => (
                <button
                  key={String(a)}
                  role="radio"
                  aria-checked={annual === a}
                  className={seg(annual === a)}
                  onClick={() => {
                    setAnnual(a);
                    trackMarketing('pricing_toggle', { interval: a ? 'annual' : 'monthly' });
                  }}
                >
                  {a ? 'Annual −20%' : 'Monthly'}
                </button>
              ))}
            </div>
          </div>
          <p className="mt-8 flex items-end gap-2">
            <span className="tabular text-3xl font-medium leading-[0.95] tracking-[-0.05em] text-black-300">£{Number.isInteger(price) ? price : price.toFixed(2)}</span>
            <span className="pb-1.5 tabular-nums text-xs tracking-[0.06em] text-white-900">Per seat per month</span>
          </p>
          <p className="mt-3 text-base leading-[23px] text-black-700">
            {annual ? `Billed £${(price * 12).toFixed(0)} per seat each year.` : 'Billed monthly.'} Call minutes at cost plus 20%. Prices exclude VAT.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <CtaLink location={`pricing_${plan}`} href="/signup" variant="primary" size="lg">
              Start free trial
            </CtaLink>
            <CtaLink location="pricing_scale" href="mailto:sales@decibel.io" size="lg">
              Talk to us
            </CtaLink>
          </div>
          <p className="mt-5 tabular-nums text-xs tracking-[0.06em] text-white-900">14 days · 1 seat · 50 credits · 60 minutes · no card</p>
        </div>
        <ul className="p-7 md:p-9">
          {INCLUDED[plan].map((item) => (
            <li key={item} className="flex gap-3 border-b border-rule py-3.5 text-base text-black-500 last:border-b-0">
              <span className="tabular-nums text-success-500">✓</span>
              {item}
            </li>
          ))}
          <li className="pt-4 tabular-nums text-xs tracking-[0.06em] text-white-900">30+ seats: Scale plan, priced with our team</li>
        </ul>
      </div>
    </div>
  );
}
