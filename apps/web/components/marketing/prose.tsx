import { Badge } from '@/components/ui/display';
import { cn } from '@/lib/utils';

/** Long-form body styles: plain h2 / h3 / p / ul / ol / a / strong / code children are styled here. */
const body = [
  'mt-10 text-md leading-6 tracking-[-0.16px] text-black-700',
  '[&_h2]:mt-12 [&_h2]:scroll-mt-24 [&_h2]:font-display [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:leading-6 [&_h2]:tracking-[-0.4px] [&_h2]:text-black-0',
  '[&_h3]:mt-8 [&_h3]:text-md [&_h3]:font-semibold [&_h3]:leading-5 [&_h3]:text-black-0',
  '[&_p]:mt-4',
  '[&_ul]:mt-4 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5',
  '[&_ol]:mt-4 [&_ol]:list-decimal [&_ol]:space-y-2 [&_ol]:pl-5',
  '[&_li]:pl-1',
  '[&_strong]:font-semibold [&_strong]:text-black-400',
  '[&_a]:text-accent-500 [&_a]:underline [&_a]:underline-offset-2',
  '[&_code]:tabular-nums [&_code]:text-sm',
].join(' ');

export function Prose({
  title,
  lead,
  updated,
  draft,
  children,
  className,
}: {
  title: string;
  lead?: React.ReactNode;
  /** e.g. "1 October 2026" */
  updated?: string;
  /** Shows the "Draft for legal review" badge. */
  draft?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <article className={cn('mx-auto w-full max-w-[752px] px-4 py-16 md:py-24', className)}>
      {draft ? <Badge tone="warning">Draft for legal review</Badge> : null}
      <h1 className={cn('t-h1 text-black-0', draft && 'mt-4')}>{title}</h1>
      {lead ? <p className="t-body-lg mt-4 text-black-700">{lead}</p> : null}
      {updated ? <p className="t-small mt-4 text-black-700">Last updated {updated}</p> : null}
      <div className={body}>{children}</div>
    </article>
  );
}

/** Bordered table for long-form pages; scrolls horizontally on narrow screens. */
export function ProseTable({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="mt-6 overflow-x-auto rounded-lg border border-white-800">
      <table className="t-body w-full min-w-[560px] border-collapse text-left">
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h} scope="col" className="t-small border-b border-white-800 bg-canvas px-4 py-3 text-black-700">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="[&:last-child>td]:border-b-0">
              {row.map((cell, j) => (
                <td key={j} className={cn('border-b border-white-800 px-4 py-3 align-top', j === 0 ? 'text-black-400' : 'text-black-700')}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Quiet callout box for notes such as "not legal advice". */
export function ProseNote({ children }: { children: React.ReactNode }) {
  return <div className="mt-6 rounded-lg border border-white-800 bg-canvas px-4 py-3 text-black-400">{children}</div>;
}
