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
});
