'use client';
// Last resort when the root layout itself fails: plain HTML with no app styles or providers.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en-GB">
      <body style={{ margin: 0, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif', background: '#fff', color: '#141414' }}>
        <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ maxWidth: 360, textAlign: 'center' }}>
            <h1 style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-0.02em', margin: 0 }}>Decibel hit a problem</h1>
            <p style={{ fontSize: 14, lineHeight: '21px', color: '#5c5c5c', margin: '8px 0 20px' }}>Reload the page to carry on. If it keeps happening, email oliver@usedecibel.com.</p>
            <button onClick={reset} style={{ height: 36, padding: '0 16px', borderRadius: 6, border: 0, background: '#141414', color: '#fff', fontSize: 14, cursor: 'pointer' }}>
              Reload
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
