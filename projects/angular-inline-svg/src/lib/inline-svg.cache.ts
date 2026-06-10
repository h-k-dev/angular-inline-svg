import { Injectable, inject } from '@angular/core';

import { INLINE_SVG_CONFIG } from './inline-svg.config';

interface CacheEntry {
  promise: Promise<string>;
  /** Resolved markup, populated once the promise settles, enabling synchronous cache hydration. */
  text?: string;
  /**
   * Detached, already parsed + scrubbed master element shared across directive
   * instances. Consumers must `cloneNode(true)` it and never mutate it.
   * Only populated for markup that needs no per-instance transform (no
   * `preParse`), so one master is valid for every instance of the same URL.
   */
  element?: SVGElement;
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

    const entry: CacheEntry = { promise, expiresAt: Date.now() + this.#ttlMs };

    // Stash the resolved markup so repeat icons can hydrate synchronously
    // (see getText) instead of flashing empty while the resource resolves.
    promise.then(
      (text) => {
        entry.text = text;
      },
      () => {},
    );

    this.#cache.set(url, entry);
  }

  /**
   * Synchronously returns cached markup if a previous request for this URL has
   * already resolved. Lets callers paint a repeat icon on the first render
   * without waiting for the async resource pipeline.
   */
  getText(url: string): string | undefined {
    const entry = this.#cache.get(url);
    if (!entry) return undefined;

    if (Date.now() > entry.expiresAt) {
      this.#cache.delete(url);
      return undefined;
    }

    return entry.text;
  }

  /**
   * Synchronously returns the shared parsed + scrubbed master for this URL.
   * `text` must match the markup the entry resolved to; the check guards
   * against keying mismatched markup (e.g. fallback content) under this URL.
   */
  getElement(url: string, text: string): SVGElement | undefined {
    const entry = this.#cache.get(url);
    if (!entry) return undefined;

    if (Date.now() > entry.expiresAt) {
      this.#cache.delete(url);
      return undefined;
    }

    return entry.text === text ? entry.element : undefined;
  }

  /**
   * Attaches a parsed + scrubbed master to an existing entry so later
   * instances of the same URL can skip parse/scrub and just clone. No-ops if
   * the entry is gone or resolved to different markup than `text`.
   */
  setElement(url: string, text: string, element: SVGElement): void {
    const entry = this.#cache.get(url);
    if (entry && entry.text === text) entry.element = element;
  }

  delete(url: string): void {
    this.#cache.delete(url);
  }

  clear(): void {
    this.#cache.clear();
  }
}
