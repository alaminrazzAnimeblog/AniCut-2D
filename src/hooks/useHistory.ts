import { useCallback, useRef, useState } from 'react';

export function useHistory<T>(initial: T, maxHistory = 40) {
  const [current, setCurrent] = useState<T>(initial);
  const pastRef = useRef<T[]>([]);
  const futureRef = useRef<T[]>([]);
  const [, forceTick] = useState(0);

  const reset = useCallback((next: T) => {
    pastRef.current = [];
    futureRef.current = [];
    setCurrent(next);
    forceTick((n) => n + 1);
  }, []);

  const commit = useCallback(
    (updater: T | ((prev: T) => T), recordHistory = true) => {
      setCurrent((prev) => {
        const next = typeof updater === 'function' ? (updater as (p: T) => T)(prev) : updater;
        if (recordHistory) {
          pastRef.current = [...pastRef.current.slice(-(maxHistory - 1)), prev];
          futureRef.current = [];
        }
        return next;
      });
    },
    [maxHistory]
  );

  const undo = useCallback(() => {
    setCurrent((prev) => {
      if (pastRef.current.length === 0) return prev;
      const previous = pastRef.current[pastRef.current.length - 1];
      pastRef.current = pastRef.current.slice(0, -1);
      futureRef.current = [prev, ...futureRef.current];
      return previous;
    });
  }, []);

  const redo = useCallback(() => {
    setCurrent((prev) => {
      if (futureRef.current.length === 0) return prev;
      const next = futureRef.current[0];
      futureRef.current = futureRef.current.slice(1);
      pastRef.current = [...pastRef.current, prev];
      return next;
    });
  }, []);

  return {
    state: current,
    commit,
    reset,
    undo,
    redo,
    canUndo: pastRef.current.length > 0,
    canRedo: futureRef.current.length > 0,
  };
}
