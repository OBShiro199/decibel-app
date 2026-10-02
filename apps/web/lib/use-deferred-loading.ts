'use client';
import { useEffect, useRef, useState } from 'react';

/** Shows an indicator only if loading lasts longer than `delay`, then keeps it for at least `minDuration`. */
export function useDeferredLoading(isLoading: boolean, delay = 200, minDuration = 400) {
  const [show, setShow] = useState(false);
  const shownAt = useRef<number | null>(null);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined;
    if (isLoading) {
      t = setTimeout(() => {
        shownAt.current = Date.now();
        setShow(true);
      }, delay);
    } else if (shownAt.current) {
      const remaining = Math.max(0, minDuration - (Date.now() - shownAt.current));
      t = setTimeout(() => {
        shownAt.current = null;
        setShow(false);
      }, remaining);
    }
    return () => clearTimeout(t);
  }, [isLoading, delay, minDuration]);
  return show;
}
