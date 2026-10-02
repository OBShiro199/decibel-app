'use client';
import { X } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

function useEscape(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);
}

function Portal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  // Inside the app, overlays render into the themed wrapper so they share its tokens and font.
  return mounted ? createPortal(children, document.getElementById('app-portal') ?? document.body) : null;
}

/** Dialog: overlay z 100, content z 101, max-width 520, radius 12, padding 24, 1px border. */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  width = 520,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  width?: number;
}) {
  useEscape(open, onClose);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open) ref.current?.focus();
  }, [open]);
  if (!open) return null;
  return (
    <Portal>
      <div className="overlay-in fixed inset-0 z-dialogOverlay bg-overlay" onClick={onClose} aria-hidden />
      <div className="pointer-events-none fixed inset-0 z-dialog flex items-start justify-center overflow-y-auto p-4 pt-[10vh]">
        <div
          ref={ref}
          role="dialog"
          aria-modal="true"
          aria-label={title}
          tabIndex={-1}
          style={{ maxWidth: width }}
          className="dialog-in pointer-events-auto w-full rounded-lg border border-white-800 bg-white-100 p-6 outline-none"
        >
          {title ? (
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h3 className="t-h3">{title}</h3>
                {description ? <p className="mt-1 text-black-700">{description}</p> : null}
              </div>
              <button onClick={onClose} aria-label="Close" className="-mr-1 -mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-sm hover:bg-white-300">
                <X size={16} strokeWidth={1.5} />
              </button>
            </div>
          ) : null}
          {children}
          {footer ? <div className="mt-6 flex justify-end gap-2">{footer}</div> : null}
        </div>
      </div>
    </Portal>
  );
}

/** Right-hand drawer over the app (not modal): 1px left border, z menu. */
export function Drawer({
  open,
  onClose,
  title,
  children,
  width = 440,
}: {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  width?: number;
}) {
  useEscape(open, onClose);
  if (!open) return null;
  return (
    <Portal>
      <div className="fixed inset-0 z-navOverlay" onClick={onClose} aria-hidden />
      <aside
        role="dialog"
        aria-label={typeof title === 'string' ? title : 'Details'}
        style={{ width: `min(${width}px, 100vw)` }}
        className="softphone-in fixed bottom-0 right-0 top-0 z-menu flex flex-col border-l border-white-800 bg-white-100"
      >
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-white-800 px-4">
          <div className="t-h4 min-w-0 truncate">{title}</div>
          <button onClick={onClose} aria-label="Close" className="flex h-8 w-8 items-center justify-center rounded-sm hover:bg-white-300">
            <X size={16} strokeWidth={1.5} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </aside>
    </Portal>
  );
}

/**
 * Popover / menu anchored to its trigger. The panel renders in a portal with fixed
 * positioning, so scroll containers and tables can never clip or cover it. It follows
 * the trigger on scroll and resize, flips above when there is no room below, and
 * closes on outside click or Escape.
 */
export function Popover({
  trigger,
  children,
  align = 'left',
  side = 'bottom',
  className,
}: {
  trigger: (props: { open: boolean; toggle: () => void }) => React.ReactNode;
  children: (close: () => void) => React.ReactNode;
  align?: 'left' | 'right';
  side?: 'top' | 'bottom';
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; placement: 'top' | 'bottom' } | null>(null);
  const close = useCallback(() => setOpen(false), []);
  useEscape(open, close);

  const place = useCallback(() => {
    const a = anchor.current?.getBoundingClientRect();
    if (!a) return;
    const p = panel.current;
    const w = p?.offsetWidth ?? 220;
    const h = p?.offsetHeight ?? 0;
    const gap = 4;
    const roomBelow = window.innerHeight - a.bottom;
    const placement: 'top' | 'bottom' = side === 'top' ? (a.top > h + gap ? 'top' : 'bottom') : roomBelow < h + gap && a.top > roomBelow ? 'top' : 'bottom';
    const top = placement === 'bottom' ? a.bottom + gap : a.top - h - gap;
    let left = align === 'right' ? a.right - w : a.left;
    left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
    setPos({ top: Math.max(8, top), left, placement });
  }, [align, side]);

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    place();
    // second pass once the panel has its real size
    const raf = requestAnimationFrame(place);
    const onMove = () => place();
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(onMove) : null;
    if (panel.current && ro) ro.observe(panel.current);
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (anchor.current?.contains(t) || panel.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
      ro?.disconnect();
      document.removeEventListener('mousedown', onDown);
    };
  }, [open, place]);

  return (
    <div ref={anchor} className="relative inline-block">
      {trigger({ open, toggle: () => setOpen((o) => !o) })}
      {open ? (
        <Portal>
          <div
            ref={panel}
            role="menu"
            style={{ position: 'fixed', top: pos?.top ?? -9999, left: pos?.left ?? -9999, visibility: pos ? 'visible' : 'hidden' }}
            className={cn('popover-in z-[105] min-w-[200px] rounded-md border border-white-800 bg-white-100 p-1 shadow-popover', className)}
          >
            {children(close)}
          </div>
        </Portal>
      ) : null}
    </div>
  );
}

export function MenuItem({
  children,
  onClick,
  danger,
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex h-8 w-full items-center gap-2 rounded-sm px-2 text-left hover:bg-white-300 disabled:text-white-900 disabled:hover:bg-transparent',
        danger && 'text-danger-700',
      )}
    >
      {children}
    </button>
  );
}

// ------------------------------------------------------------------ toasts --
interface Toast {
  id: number;
  message: string;
  action?: { label: string; href?: string; onClick?: () => void };
}
const ToastContext = createContext<(message: string, action?: Toast['action']) => void>(() => {});

/** Toasts: bottom-left, black-0 fill, white text, radius 8, 4s. */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((message: string, action?: Toast['action']) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-3), { id, message, action }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-4 left-4 z-toast flex flex-col gap-2" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="toast-in pointer-events-auto flex max-w-sm items-center gap-3 rounded-md border border-white-800 bg-white-100 px-3 py-2.5 text-sm text-black-400 shadow-popover">
            <span>{t.message}</span>
            {t.action ? (
              t.action.href ? (
                <a href={t.action.href} className="shrink-0 underline">
                  {t.action.label}
                </a>
              ) : (
                <button onClick={t.action.onClick} className="shrink-0 underline">
                  {t.action.label}
                </button>
              )
            ) : null}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
