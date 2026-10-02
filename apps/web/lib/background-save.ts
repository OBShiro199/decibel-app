'use client';
// Saves that happen after the UI has already moved on (optimistic). They retry with
// backoff and, if they still fail, tell the user and offer a retry. Never silent.

type Toast = (message: string, action?: { label: string; onClick?: () => void; href?: string }) => void;

export async function saveInBackground(
  run: () => PromiseLike<{ error: { message: string } | null }>,
  opts: { what: string; toast: Toast; attempts?: number },
): Promise<boolean> {
  const attempts = opts.attempts ?? 3;
  let last = '';
  for (let i = 0; i < attempts; i++) {
    try {
      const { error } = await run();
      if (!error) return true;
      last = error.message;
      if (/permission|forbidden|violates|invalid input/i.test(last)) break; // retrying won't help
    } catch (e) {
      last = (e as Error).message;
    }
    await new Promise((r) => setTimeout(r, 500 * 2 ** i));
  }
  console.warn(`[save] ${opts.what} failed:`, last);
  opts.toast(`Couldn't save ${opts.what}.`, { label: 'Retry', onClick: () => void saveInBackground(run, opts) });
  return false;
}
