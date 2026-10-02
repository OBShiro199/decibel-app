// Customer logos scrolling under the hero: greyscale, slow, masked at both edges,
// paused on hover. Brands without a logo file render as a clean text wordmark.
import { BRANDS, type Brand } from './social-proof';

// Every logo gets the same visual weight: equal area, capped height, so a wide
// wordmark and a square icon read as the same size.
const AREA = 2000;
const MAX_H = 24;
export function logoBox(b: Brand): { width: number; height: number } {
  const ratio = (b.w ?? 4) / (b.h ?? 1);
  const height = Math.min(MAX_H, Math.sqrt(AREA / ratio));
  return { width: Math.round(height * ratio), height: Math.round(height) };
}

export function LogoMarquee() {
  const row = (dup: number) => (
    <div className="flex h-8 shrink-0 items-center gap-14 pr-14" aria-hidden={dup > 0}>
      {BRANDS.map((b) =>
        b.logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={`${dup}-${b.name}`} src={b.logo} alt={dup ? '' : b.name} {...logoBox(b)} style={logoBox(b)} className="shrink-0 object-contain opacity-60 grayscale transition-opacity hover:opacity-100" />
        ) : (
          <span key={`${dup}-${b.name}`} className="whitespace-nowrap text-md font-semibold leading-6 tracking-[-0.03em] text-black-700 opacity-60">
            {b.name}
          </span>
        ),
      )}
    </div>
  );
  return (
    <div className="marquee-mask logo-marquee overflow-hidden">
      <div className="marquee-track" style={{ animationDuration: '45s' }}>
        {row(0)}
        {row(1)}
      </div>
    </div>
  );
}
