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
  /**
   * Shared-abort bookkeeping while the request is in flight (cleared once it
   * settles). The controller owns the actual request; `subscribers` counts the
   * callers still interested in the result.
   */
  inflight?: {
    controller: AbortController;
    subscribers: number;
    cleanups: (() => void)[];
  };
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

    // A shared request that was already aborted can never resolve; report a
    // miss so the caller starts a fresh one instead of awaiting a doomed promise.
    if (entry.inflight?.controller.signal.aborted) {
      this.#cache.delete(url);
      return undefined;
    }

    // Touch: re-insert to move this key to the most-recently-used end.
    this.#cache.delete(url);
    this.#cache.set(url, entry);
    return entry.promise;
  }

  set(url: string, promise: Promise<string>, controller?: AbortController): void {
    if (this.#cache.has(url)) {
      this.#cache.delete(url);
    } else if (this.#cache.size >= this.#maxEntries) {
      const oldestKey = this.#cache.keys().next().value;
      if (oldestKey !== undefined) this.#cache.delete(oldestKey);
    }

    const entry: CacheEntry = { promise, expiresAt: Date.now() + this.#ttlMs };
    if (controller) entry.inflight = { controller, subscribers: 0, cleanups: [] };

    const settle = () => {
      entry.inflight?.cleanups.forEach((cleanup) => cleanup());
      entry.inflight = undefined;
    };

    // Stash the resolved markup so repeat icons can hydrate synchronously
    // (see getText) instead of flashing empty while the resource resolves.
    promise.then(
      (text) => {
        entry.text = text;
        settle();
      },
      () => {
        settle();
        // Don't cache failures, so a later attempt can retry cleanly. Identity-
        // guarded so a late rejection never evicts a newer entry for this URL.
        if (this.#cache.get(url) === entry) this.#cache.delete(url);
      },
    );

    this.#cache.set(url, entry);
  }

  /**
   * Ties a caller's abort signal to the shared in-flight request for `url`.
   * The request is only aborted once every subscriber has aborted, so one
   * directive's destruction can't kill the fetch for the others deduped onto
   * it. No-op once the request has settled (or for entries without a controller).
   */
  subscribe(url: string, signal: AbortSignal): void {
    const inflight = this.#cache.get(url)?.inflight;
    if (!inflight) return;

    if (signal.aborted) {
      if (inflight.subscribers === 0) inflight.controller.abort();
      return;
    }

    inflight.subscribers++;

    const onAbort = () => {
      if (--inflight.subscribers === 0) inflight.controller.abort();
    };

    signal.addEventListener('abort', onAbort, { once: true });
    inflight.cleanups.push(() => signal.removeEventListener('abort', onAbort));
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
