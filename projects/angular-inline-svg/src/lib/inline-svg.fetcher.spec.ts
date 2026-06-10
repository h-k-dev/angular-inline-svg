import { Component, Injectable, inject } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AngularInlineSvg } from './angular-inline-svg';
import { InlineSvgCache } from './inline-svg.cache';
import {
  defaultFetcher,
  provideInlineSvg,
  provideInlineSvgFetcher,
  type InlineSvgFetcher,
} from './inline-svg.config';

const SVG_MARKUP = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>';

@Component({
  imports: [AngularInlineSvg],
  template: `<span [inlineSVG]="url" (failed)="onFailed($event)"></span>`,
})
class HostComponent {
  url = '0.svg';
  failures: Error[] = [];

  onFailed(err: Error): void {
    this.failures.push(err);
  }
}

function querySvg(fixture: ComponentFixture<HostComponent>): SVGSVGElement | null {
  const host = fixture.debugElement.query(By.directive(AngularInlineSvg))
    .nativeElement as HTMLElement;
  return host.querySelector('svg');
}

describe('defaultFetcher', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubFetch(impl: () => unknown): ReturnType<typeof vi.fn> {
    const fetchSpy = vi.fn(async () => impl());
    vi.stubGlobal('fetch', fetchSpy);
    return fetchSpy;
  }

  it('returns the response text for a valid image/svg+xml response', async () => {
    stubFetch(() => ({
      ok: true,
      status: 200,
      headers: { get: () => 'image/svg+xml' },
      text: async () => SVG_MARKUP,
    }));

    await expect(defaultFetcher('icon.svg', new AbortController().signal)).resolves.toBe(
      SVG_MARKUP,
    );
  });

  it('accepts a text/plain content type', async () => {
    stubFetch(() => ({
      ok: true,
      status: 200,
      headers: { get: () => 'text/plain; charset=utf-8' },
      text: async () => SVG_MARKUP,
    }));

    await expect(defaultFetcher('icon.svg', new AbortController().signal)).resolves.toBe(
      SVG_MARKUP,
    );
  });

  it('throws when the response is not ok', async () => {
    stubFetch(() => ({
      ok: false,
      status: 404,
      headers: { get: () => 'image/svg+xml' },
      text: async () => '',
    }));

    await expect(defaultFetcher('missing.svg', new AbortController().signal)).rejects.toThrow(
      'HTTP error! status: 404',
    );
  });

  it('throws on an invalid content type', async () => {
    stubFetch(() => ({
      ok: true,
      status: 200,
      headers: { get: () => 'text/html' },
      text: async () => '<html></html>',
    }));

    await expect(defaultFetcher('icon.svg', new AbortController().signal)).rejects.toThrow(
      'Invalid SVG content type: text/html',
    );
  });

  it('passes the abort signal through to fetch', async () => {
    const fetchSpy = stubFetch(() => ({
      ok: true,
      status: 200,
      headers: { get: () => 'image/svg+xml' },
      text: async () => SVG_MARKUP,
    }));

    const signal = new AbortController().signal;
    await defaultFetcher('icon.svg', signal);

    expect(fetchSpy).toHaveBeenCalledWith('icon.svg', { signal });
  });
});

describe('custom fetcher integration', () => {
  beforeEach(() => {
    // jsdom does not always expose SVGRect; isSvgSupported() gates the loader on
    // it, so stub it to guarantee the browser path runs.
    vi.stubGlobal('SVGRect', class {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses a DI-free fetcher passed via provideInlineSvg with the resolved url and a signal', async () => {
    const fetcher = vi.fn<InlineSvgFetcher>(async () => SVG_MARKUP);

    TestBed.configureTestingModule({
      imports: [HostComponent],
      providers: [provideInlineSvg({ fetcher })],
    });

    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, signal] = fetcher.mock.calls[0];
    expect(url).toBe('0.svg');
    expect(signal).toBeInstanceOf(AbortSignal);

    expect(querySvg(fixture)).toBeTruthy();
  });

  it('uses a DI-aware fetcher built inside an injection context', async () => {
    @Injectable({ providedIn: 'root' })
    class SvgSource {
      load(): string {
        return SVG_MARKUP;
      }
    }

    TestBed.configureTestingModule({
      imports: [HostComponent],
      providers: [
        provideInlineSvgFetcher(() => {
          const source = inject(SvgSource);
          return async () => source.load();
        }),
      ],
    });

    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(querySvg(fixture)).toBeTruthy();
  });

  it('emits failed and does not cache when the fetcher throws', async () => {
    const fetcher = vi.fn<InlineSvgFetcher>(async () => {
      throw new Error('boom');
    });

    TestBed.configureTestingModule({
      imports: [HostComponent],
      providers: [provideInlineSvg({ fetcher })],
    });

    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.componentInstance.failures).toHaveLength(1);
    expect(fixture.componentInstance.failures[0].message).toBe('boom');

    // Failures are not cached, so a later attempt can retry cleanly.
    const cache = TestBed.inject(InlineSvgCache);
    expect(cache.get('0.svg')).toBeUndefined();
  });

  it('aborts the in-flight fetcher when the directive is destroyed', async () => {
    let capturedSignal: AbortSignal | undefined;
    const fetcher = vi.fn<InlineSvgFetcher>((_url, signal) => {
      capturedSignal = signal;
      // Never resolves: keep the request in flight so we can observe the abort.
      return new Promise<string>(() => {});
    });

    TestBed.configureTestingModule({
      imports: [HostComponent],
      providers: [provideInlineSvg({ fetcher })],
    });

    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();

    // Let the resource loader effect run and invoke the fetcher. We can't await
    // whenStable() here because the request intentionally never settles.
    for (let i = 0; i < 5 && !capturedSignal; i++) {
      await new Promise((resolve) => setTimeout(resolve));
      fixture.detectChanges();
    }

    expect(capturedSignal).toBeDefined();
    expect(capturedSignal!.aborted).toBe(false);

    fixture.destroy();

    expect(capturedSignal!.aborted).toBe(true);
  });

  it('keeps the shared request alive when one of two deduped instances is destroyed', async () => {
    let capturedSignal: AbortSignal | undefined;
    let resolveFetch!: (text: string) => void;
    const fetcher = vi.fn<InlineSvgFetcher>((_url, signal) => {
      capturedSignal = signal;
      return new Promise<string>((resolve, reject) => {
        resolveFetch = resolve;
        signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      });
    });

    TestBed.configureTestingModule({
      imports: [HostComponent],
      providers: [provideInlineSvg({ fetcher })],
    });

    const first = TestBed.createComponent(HostComponent);
    first.detectChanges();
    const second = TestBed.createComponent(HostComponent);
    second.detectChanges();

    // Let both loaders run; the second dedupes onto the first's request.
    for (let i = 0; i < 5 && fetcher.mock.calls.length === 0; i++) {
      await new Promise((resolve) => setTimeout(resolve));
    }
    await new Promise((resolve) => setTimeout(resolve));
    expect(fetcher).toHaveBeenCalledTimes(1);

    // Destroying one instance must not abort the request the other awaits.
    first.destroy();
    expect(capturedSignal!.aborted).toBe(false);

    resolveFetch(SVG_MARKUP);
    await second.whenStable();
    second.detectChanges();

    expect(querySvg(second)).toBeTruthy();
    expect(second.componentInstance.failures).toHaveLength(0);
  });
});
