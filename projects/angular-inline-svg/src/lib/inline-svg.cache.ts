import { Injectable, inject } from '@angular/core';

import { INLINE_SVG_CONFIG } from './inline-svg.config';

interface CacheEntry {
  promise: Promise<string>;
  expiresAt: number;
}

/**
 * This Cache only makes sense if you are in the browser.
 * In an SSR setup you would want to implement a strategy on your own or
 * cache directly infront of the SSR server.
 */
@Injectable({ providedIn: 'root' })
export class InlineSvgCache {
  #config = inject(INLINE_SVG_CONFIG);

  // Bounded LRU + TTL, mirroring TanStack Query's max-size + gcTime idea:
  // keep a finite number of entries and drop stale ones so the Map can't
  // grow without bound (e.g. cache-busted URLs).
  #maxEntries = this.#config.cacheMaxEntries;
  #ttlMs = this.#config.cacheTtlMs;

  #cache = new Map<string, CacheEntry>();

  get(url: string): Promise<string> | undefined {
    const entry = this.#cache.get(url);
    if (!entry) return undefined;

    // Expired: evict and report a miss so the caller refetches.
    if (Date.now() > entry.expiresAt) {
      this.#cache.delete(url);
      return undefined;
    }

    // Touch: re-insert to move this key to the most-recently-used end.
    this.#cache.delete(url);
    this.#cache.set(url, entry);
    return entry.promise;
  }

  set(url: string, promise: Promise<string>): void {
    if (this.#cache.has(url)) {
      this.#cache.delete(url);
    } else if (this.#cache.size >= this.#maxEntries) {
      const oldestKey = this.#cache.keys().next().value;
      if (oldestKey !== undefined) this.#cache.delete(oldestKey);
    }

    this.#cache.set(url, { promise, expiresAt: Date.now() + this.#ttlMs });
  }

  delete(url: string): void {
    this.#cache.delete(url);
  }

  clear(): void {
    this.#cache.clear();
  }
}
