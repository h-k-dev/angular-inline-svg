import { TestBed } from '@angular/core/testing';

import { InlineSvgCache } from './inline-svg.cache';
import { provideInlineSvg } from './inline-svg.config';

describe('InlineSvgCache', () => {
  let cache: InlineSvgCache;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    cache = TestBed.inject(InlineSvgCache);
  });

  it('should be created', () => {
    expect(cache).toBeTruthy();
  });

  it('stores and returns the same in-flight promise (dedup)', () => {
    const promise = Promise.resolve('<svg></svg>');
    cache.set('a.svg', promise);

    expect(cache.get('a.svg')).toBe(promise);
  });

  it('returns undefined after delete', () => {
    cache.set('a.svg', Promise.resolve('<svg></svg>'));
    cache.delete('a.svg');

    expect(cache.get('a.svg')).toBeUndefined();
  });

  it('evicts the least-recently-used entry past capacity', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideInlineSvg({ cacheMaxEntries: 2 })],
    });
    cache = TestBed.inject(InlineSvgCache);

    cache.set('a.svg', Promise.resolve('a'));
    cache.set('b.svg', Promise.resolve('b'));
    // Touch "a" so "b" becomes the least-recently-used entry.
    cache.get('a.svg');
    cache.set('c.svg', Promise.resolve('c'));

    expect(cache.get('a.svg')).toBeDefined();
    expect(cache.get('b.svg')).toBeUndefined();
    expect(cache.get('c.svg')).toBeDefined();
  });

  describe('getText (synchronous hydration)', () => {
    it('returns undefined for an unknown url', () => {
      expect(cache.getText('missing.svg')).toBeUndefined();
    });

    it('returns undefined before the request settles', () => {
      cache.set('a.svg', Promise.resolve('<svg></svg>'));

      // The promise has not resolved yet, so there is no markup to hydrate from.
      expect(cache.getText('a.svg')).toBeUndefined();
    });

    it('returns the resolved markup once the request settles', async () => {
      const promise = Promise.resolve('<svg id="x"></svg>');
      cache.set('a.svg', promise);

      await promise;
      // Flush the cache's own .then() that records the resolved text.
      await Promise.resolve();

      expect(cache.getText('a.svg')).toBe('<svg id="x"></svg>');
    });

    it('evicts and returns undefined once the entry has expired (TTL)', async () => {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [provideInlineSvg({ cacheTtlMs: 1000 })],
      });
      cache = TestBed.inject(InlineSvgCache);

      vi.useFakeTimers();

      try {
        const promise = Promise.resolve('<svg></svg>');
        cache.set('a.svg', promise);

        await promise;
        await Promise.resolve();

        expect(cache.getText('a.svg')).toBe('<svg></svg>');

        vi.advanceTimersByTime(1001);

        expect(cache.getText('a.svg')).toBeUndefined();
        // Expiry also drops it from the dedup cache.
        expect(cache.get('a.svg')).toBeUndefined();
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('failure eviction', () => {
    it('evicts a failed request so a later attempt can retry', async () => {
      let reject!: (err: Error) => void;
      const failing = new Promise<string>((_resolve, r) => {
        reject = r;
      });
      cache.set('a.svg', failing);

      reject(new Error('boom'));
      await failing.catch(() => {});
      await Promise.resolve();

      expect(cache.get('a.svg')).toBeUndefined();
    });

    it('does not evict a newer entry when a stale request fails late', async () => {
      let reject!: (err: Error) => void;
      const failing = new Promise<string>((_resolve, r) => {
        reject = r;
      });
      cache.set('a.svg', failing);

      // A retry replaces the entry before the old request finally rejects.
      const replacement = Promise.resolve('<svg></svg>');
      cache.set('a.svg', replacement);

      reject(new Error('boom'));
      await failing.catch(() => {});
      await Promise.resolve();

      expect(cache.get('a.svg')).toBe(replacement);
    });
  });

  describe('subscribe (shared abort)', () => {
    it('aborts the shared request only after every subscriber has aborted', () => {
      const shared = new AbortController();
      cache.set('a.svg', new Promise<string>(() => {}), shared);

      const a = new AbortController();
      const b = new AbortController();
      cache.subscribe('a.svg', a.signal);
      cache.subscribe('a.svg', b.signal);

      a.abort();
      expect(shared.signal.aborted).toBe(false);

      b.abort();
      expect(shared.signal.aborted).toBe(true);
    });

    it('aborts immediately when the only subscriber is already aborted', () => {
      const shared = new AbortController();
      cache.set('a.svg', new Promise<string>(() => {}), shared);

      const a = new AbortController();
      a.abort();
      cache.subscribe('a.svg', a.signal);

      expect(shared.signal.aborted).toBe(true);
    });

    it('ignores subscriber aborts once the request has settled', async () => {
      const shared = new AbortController();
      const promise = Promise.resolve('<svg></svg>');
      cache.set('a.svg', promise, shared);

      const a = new AbortController();
      cache.subscribe('a.svg', a.signal);

      await promise;
      await Promise.resolve();

      a.abort();
      expect(shared.signal.aborted).toBe(false);
      expect(cache.getText('a.svg')).toBe('<svg></svg>');
    });

    it('treats an entry whose shared request was aborted as a miss', () => {
      const shared = new AbortController();
      cache.set('a.svg', new Promise<string>(() => {}), shared);

      const a = new AbortController();
      cache.subscribe('a.svg', a.signal);
      a.abort();

      // The doomed promise can never resolve; callers must refetch.
      expect(cache.get('a.svg')).toBeUndefined();
    });
  });

  describe('getElement / setElement (shared scrubbed master)', () => {
    function makeSvg(): SVGElement {
      return document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    }

    /** Inserts a settled entry so element attachment has resolved text to match against. */
    async function settle(url: string, text: string): Promise<void> {
      const promise = Promise.resolve(text);
      cache.set(url, promise);
      await promise;
      // Flush the cache's own .then() that records the resolved text.
      await Promise.resolve();
    }

    it('returns undefined for an unknown url', () => {
      expect(cache.getElement('missing.svg', '<svg></svg>')).toBeUndefined();
    });

    it('stores and returns the master for matching markup', async () => {
      await settle('a.svg', '<svg></svg>');

      const master = makeSvg();
      cache.setElement('a.svg', '<svg></svg>', master);

      expect(cache.getElement('a.svg', '<svg></svg>')).toBe(master);
    });

    it('refuses to attach a master when the markup does not match the entry', async () => {
      await settle('a.svg', '<svg id="a"></svg>');

      cache.setElement('a.svg', '<svg id="other"></svg>', makeSvg());

      expect(cache.getElement('a.svg', '<svg id="a"></svg>')).toBeUndefined();
      expect(cache.getElement('a.svg', '<svg id="other"></svg>')).toBeUndefined();
    });

    it('returns undefined when asked for different markup than was attached', async () => {
      await settle('a.svg', '<svg id="a"></svg>');
      cache.setElement('a.svg', '<svg id="a"></svg>', makeSvg());

      expect(cache.getElement('a.svg', '<svg id="stale"></svg>')).toBeUndefined();
    });

    it('evicts and returns undefined once the entry has expired (TTL)', async () => {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [provideInlineSvg({ cacheTtlMs: 1000 })],
      });
      cache = TestBed.inject(InlineSvgCache);

      vi.useFakeTimers();

      try {
        await settle('a.svg', '<svg></svg>');
        cache.setElement('a.svg', '<svg></svg>', makeSvg());

        expect(cache.getElement('a.svg', '<svg></svg>')).toBeDefined();

        vi.advanceTimersByTime(1001);

        expect(cache.getElement('a.svg', '<svg></svg>')).toBeUndefined();
        expect(cache.get('a.svg')).toBeUndefined();
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
