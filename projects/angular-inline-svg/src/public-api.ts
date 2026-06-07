export { injectUids, injectUidsFrom, type InjectUidsFromOptions } from './lib/inline-svg.utils';

/**
 * Exports all pipeline functions ensuring perfect tree-shaking.
 * - User can freely build their own pipeline if they want to.
 */
export { AngularInlineSvg, scrub, stripHandlers } from './lib/angular-inline-svg';

/**
 * Exports the cache and configuration.
 */
export { InlineSvgCache } from './lib/inline-svg.cache';

/**
 * Exports the provider and configuration.
 */
export {
  provideInlineSvg,
  provideInlineSvgFetcher,
  defaultFetcher,
  INLINE_SVG_CONFIG,
  INLINE_SVG_FETCHER,
  DEFAULT_INLINE_SVG_OPTIONS,
  isSvgSupported,
  type InlineSvgOptions,
  type InlineSvgFetcher,
} from './lib/inline-svg.config';
