import { cn } from '@/lib/utils';

/** The ear mark, cropped tight (public/brand/ear.png is 96px tall, 2x for a 48px mark). */
export const EAR_SRC = '/brand/ear.png';
const EAR_RATIO = 0.583; // width / height of the cropped ear

export function LogoMark({ size = 24, className }: { size?: number; className?: string }) {
  const width = Math.round(size * EAR_RATIO);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={EAR_SRC} alt="" aria-hidden width={width} height={size} className={cn('shrink-0 select-none', className)} style={{ width, height: size }} draggable={false} />
  );
}

/** Decibel logo: the ear, then the name. */
export function Logo({ className, size = 24 }: { className?: string; size?: number }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-black-0', className)}>
      <LogoMark size={size} />
      <span className="font-display text-lg font-semibold leading-6 tracking-[-0.36px]">Decibel</span>
    </span>
  );
}
