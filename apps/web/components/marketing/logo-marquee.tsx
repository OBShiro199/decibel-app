// Customer logos scrolling under the hero: greyscale, slow, masked at both edges,
// paused on hover. Brands without a logo file render as a clean text wordmark.
import { BRANDS } from './social-proof';

export function LogoMarquee() {
  const row = (dup: number) => (
    <div className="flex shrink-0 items-center gap-12 pr-12" aria-hidden={dup > 0}>
      {BRANDS.map((b) =>
        b.logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={`${dup}-${b.name}`} src={b.logo} alt={dup ? '' : b.name} width={208} height={52} className="h-[52px] w-auto object-contain opacity-60 grayscale transition-opacity hover:opacity-100" />
        ) : (
          <span key={`${dup}-${b.name}`} className="whitespace-nowrap text-lg font-semibold tracking-[-0.03em] text-black-700 opacity-60">
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
