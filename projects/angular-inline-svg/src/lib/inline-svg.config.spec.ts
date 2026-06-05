import { TestBed } from '@angular/core/testing';

import {
  INLINE_SVG_CONFIG,
  DEFAULT_INLINE_SVG_OPTIONS,
  provideInlineSvg,
} from './inline-svg.config';

describe('INLINE_SVG_CONFIG', () => {
  it('falls back to the default options when unconfigured', () => {
    TestBed.configureTestingModule({});
    expect(TestBed.inject(INLINE_SVG_CONFIG)).toEqual(DEFAULT_INLINE_SVG_OPTIONS);
  });

  it('merges provided options over the defaults via provideInlineSvg()', () => {
    TestBed.configureTestingModule({
      providers: [provideInlineSvg({ baseUrl: 'assets/icons', cacheTtlMs: 1000 })],
    });

    const config = TestBed.inject(INLINE_SVG_CONFIG);

    expect(config.baseUrl).toBe('assets/icons');
    expect(config.cacheTtlMs).toBe(1000);
    // Untouched option keeps its default.
    expect(config.cacheMaxEntries).toBe(DEFAULT_INLINE_SVG_OPTIONS.cacheMaxEntries);
  });
});
