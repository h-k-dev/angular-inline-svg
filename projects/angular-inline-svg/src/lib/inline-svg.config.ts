import { InjectionToken, Provider } from '@angular/core';

/** The contract for fetching SVGs. Must return a Promise resolving to the raw SVG string. */
export type InlineSvgFetcher = (url: string, abortSignal: AbortSignal) => Promise<string>;

export interface InlineSvgOptions {
  /** Prepended to relative URLs (when `resolveSVGUrl` is enabled on the directive). */
  baseUrl?: string;
  /** Maximum number of cached SVGs before least-recently-used eviction. */
  cacheMaxEntries?: number;
  /** How long (ms) a cached SVG stays fresh before it is refetched. */
  cacheTtlMs?: number;
  /**
   * When true (default), the cache also keeps one parsed + scrubbed master
   * element per URL so repeat icons skip parse/scrub and just clone. Disable
   * to keep cache entries text-only (e.g. many distinct, large SVGs where the
   * extra DOM weight per entry matters more than repeat-render speed).
   */
  cacheParsedElements?: boolean;
  /** The UID to use for the SVG. */
  uid?: number;
  /**
   * Custom, DI-free fetcher for loading remote SVGs (e.g. axios or native fetch
   * with custom headers). For fetchers that need dependency injection (such as
   * Angular's `HttpClient`), use `provideInlineSvgFetcher` instead.
   *
   * Custom fetchers are responsible for their own content-type validation.
   */
  fetcher?: InlineSvgFetcher;
}

/** Config stored in DI; the fetcher lives in its own token so it can use DI. */
type StoredInlineSvgOptions = Required<Omit<InlineSvgOptions, 'fetcher'>>;

/**
 * The default fetcher: native `fetch` with content-type validation. Extracted
 * here so it can serve as the fallback for the `INLINE_SVG_FETCHER` token.
 */
export const defaultFetcher: InlineSvgFetcher = async (url, abortSignal) => {
  const res = await fetch(url, { signal: abortSignal });
  if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);

  const contentType = res.headers.get('content-type');
  const [fileType] = (contentType ?? '').split(/ ?; ?/);

  if (!['image/svg+xml', 'text/plain'].some((d) => fileType.includes(d))) {
    throw new Error(`Invalid SVG content type: ${fileType}`);
  }

  return res.text();
};

export const DEFAULT_INLINE_SVG_OPTIONS: StoredInlineSvgOptions = {
  baseUrl: '',
  cacheMaxEntries: 100,
  cacheTtlMs: 5 * 60 * 1000,
  cacheParsedElements: true,
  uid: 0,
};

export const INLINE_SVG_CONFIG = new InjectionToken<StoredInlineSvgOptions>('INLINE_SVG_CONFIG', {
  providedIn: 'root',
  factory: () => DEFAULT_INLINE_SVG_OPTIONS,
});

/** The fetcher used to load remote SVGs. Defaults to native `fetch`. */
export const INLINE_SVG_FETCHER = new InjectionToken<InlineSvgFetcher>('INLINE_SVG_FETCHER', {
  providedIn: 'root',
  factory: () => defaultFetcher,
});

/**
 * Configure the inline SVG directive once at the application root, e.g.
 * `provideInlineSvg({ baseUrl: 'assets/icons', cacheTtlMs: 60_000 })`.
 *
 * Pass `fetcher` for a DI-free custom fetcher. For DI-based fetchers (e.g.
 * `HttpClient`), use `provideInlineSvgFetcher` instead.
 */
export function provideInlineSvg(options: InlineSvgOptions = {}): Provider[] {
  const { fetcher, ...rest } = options;

  const providers: Provider[] = [
    { provide: INLINE_SVG_CONFIG, useValue: { ...DEFAULT_INLINE_SVG_OPTIONS, ...rest } },
  ];

  if (fetcher) providers.push({ provide: INLINE_SVG_FETCHER, useValue: fetcher });

  return providers;
}

/**
 * Provide a custom fetcher built inside an injection context, so it can use
 * `inject()` (e.g. to obtain Angular's `HttpClient`).
 *
 * ```typescript
 * provideInlineSvgFetcher(() => {
 *   const http = inject(HttpClient);
 *   return (url, signal) => firstValueFrom(http.get(url, { responseType: 'text' }));
 * });
 * ```
 */
export function provideInlineSvgFetcher(factory: () => InlineSvgFetcher): Provider {
  return { provide: INLINE_SVG_FETCHER, useFactory: factory };
}

/** True when the current environment can render SVG (false on most SSR/legacy targets). */
export function isSvgSupported(): boolean {
  return typeof SVGRect !== 'undefined';
}
