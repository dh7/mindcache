'use client';

import { useState, useEffect, useRef } from 'react';
import { MindCache, type MindCacheOptions } from '../core/MindCache';

export interface UseMindCacheResult {
    /** The MindCache instance, null until loaded */
    mindcache: MindCache | null;
    /** Whether the MindCache is fully loaded and ready to use */
    isLoaded: boolean;
    /** Any error that occurred during initialization */
    error: Error | null;
}

/**
 * React hook for using MindCache with automatic lifecycle management.
 *
 * Handles async initialization (IndexedDB/Cloud) and provides loading state.
 * The MindCache instance is created once and persists across re-renders.
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { mindcache, isLoaded } = useMindCache({
 *     indexedDB: { dbName: 'my-app' }
 *   });
 *
 *   if (!isLoaded) return <Loading />;
 *
 *   return <div>{mindcache.get_value('key')}</div>;
 * }
 * ```
 */
export function useMindCache(options?: MindCacheOptions): UseMindCacheResult {
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const mindcacheRef = useRef<MindCache | null>(null);
  const initializingRef = useRef(false);

  useEffect(() => {
    // Prevent double initialization in React StrictMode
    if (initializingRef.current) {
      return;
    }
    initializingRef.current = true;

    const initialize = async () => {
      try {
        const mc = new MindCache(options);
        mindcacheRef.current = mc;

        await mc.waitForSync();
        setIsLoaded(true);
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)));
        // Still mark as loaded so the component can handle the error
        setIsLoaded(true);
      }
    };

    initialize();

    // Cleanup on unmount
    return () => {
      if (mindcacheRef.current) {
        mindcacheRef.current.disconnect();
      }
    };
  }, []); // Empty deps - only run once

  return {
    mindcache: mindcacheRef.current,
    isLoaded,
    error
  };
}
