import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';

// The share card for links to usedecibel.com (LinkedIn, Slack, X, iMessage, Google).
export const alt = 'Decibel: verified UK and EU mobiles and a power dialler';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/** Geist from Google Fonts at build time; falls back to the default face if offline. */
async function geist(weight: number): Promise<ArrayBuffer | null> {
  try {
    const css = await (await fetch(`https://fonts.googleapis.com/css2?family=Geist:wght@${weight}&display=swap`, { headers: { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Safari/537.36' } })).text();
    const url = css.match(/src: url\((.+?)\) format\('(?:truetype|opentype|woff)'\)/)?.[1];
    return url ? await (await fetch(url)).arrayBuffer() : null;
  } catch {
    return null;
  }
}

export default async function OpengraphImage() {
  const [ear, medium, regular] = await Promise.all([readFile(join(process.cwd(), 'public/brand/ear.png')).catch(() => null), geist(500), geist(400)]);
  const earSrc = ear ? `data:image/png;base64,${ear.toString('base64')}` : null;
  const fonts = [medium && { name: 'Geist', data: medium, weight: 500 as const }, regular && { name: 'Geist', data: regular, weight: 400 as const }].filter(Boolean) as { name: string; data: ArrayBuffer; weight: 400 | 500 }[];

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', background: '#f6f6f4', padding: '72px 80px', fontFamily: 'Geist' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {earSrc ? <img src={earSrc} width={35} height={60} alt="" /> : null}
          <span style={{ fontSize: 40, fontWeight: 500, letterSpacing: '-0.03em', color: '#08090a' }}>Decibel</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 26 }}>
          <div style={{ display: 'flex', fontSize: 74, fontWeight: 500, lineHeight: 1.04, letterSpacing: '-0.045em', color: '#08090a', maxWidth: 960 }}>
            Verified UK &amp; EU mobiles and a power dialler.
          </div>
          <div style={{ display: 'flex', fontSize: 30, fontWeight: 400, lineHeight: 1.35, letterSpacing: '-0.015em', color: '#62666d', maxWidth: 900 }}>
            Search UK and EU decision makers, reveal a direct mobile and call it from your browser.
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 24, color: '#62666d', letterSpacing: '-0.01em' }}>
          <span>usedecibel.com</span>
          <span style={{ color: '#c9cbd0' }}>·</span>
          <span>Power dialler · call recording · built-in pipeline</span>
        </div>
      </div>
    ),
    { ...size, fonts: fonts.length ? fonts : undefined },
  );
}
