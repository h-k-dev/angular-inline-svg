import { InjectionToken, Provider } from '@angular/core';

export interface InlineSvgOptions {
  /** Prepended to relative URLs (when `resolveSVGUrl` is enabled on the directive). */
  baseUrl?: string;
  /** Maximum number of cached SVGs before least-recently-used eviction. */
  cacheMaxEntries?: number;
  /** How long (ms) a cached SVG stays fresh before it is refetched. */
  cacheTtlMs?: number;
}

export const DEFAULT_INLINE_SVG_OPTIONS: Required<InlineSvgOptions> = {
  baseUrl: '',
  cacheMaxEntries: 100,
  cacheTtlMs: 5 * 60 * 1000,
};

export const INLINE_SVG_CONFIG = new InjectionToken<Required<InlineSvgOptions>>(
  'INLINE_SVG_CONFIG',
  {
    providedIn: 'root',
    factory: () => DEFAULT_INLINE_SVG_OPTIONS,
  },
);

/**
 * Configure the inline SVG directive once at the application root, e.g.
 * `provideInlineSvg({ baseUrl: 'assets/icons', cacheTtlMs: 60_000 })`.
 */
export function provideInlineSvg(options: InlineSvgOptions = {}): Provider {
  return {
    provide: INLINE_SVG_CONFIG,
    useValue: { ...DEFAULT_INLINE_SVG_OPTIONS, ...options },
  };
}

/** True when the current environment can render SVG (false on most SSR/legacy targets). */
export function isSvgSupported(): boolean {
  return typeof SVGRect !== 'undefined';
}
