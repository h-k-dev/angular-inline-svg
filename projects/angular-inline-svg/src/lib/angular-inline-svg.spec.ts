/** */
import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { afterEach, beforeEach, vi } from 'vitest';

import { GRADIENTS } from '../../assets/uniquifyIds';
import { AngularInlineSvg } from './angular-inline-svg';
import { provideInlineSvg } from './inline-svg.config';

@Component({
  imports: [AngularInlineSvg],
  template: `<span [inlineSVG]="url"></span>`,
})
class HostComponent {
  url = 'assets/media/fish.svg';
}

describe('InlineSvg', () => {
  let fixture: ComponentFixture<HostComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HostComponent] });
    fixture = TestBed.createComponent(HostComponent);
  });

  it('should create the directive on its host element', () => {
    fixture.detectChanges();

    const host = fixture.debugElement.query(By.directive(AngularInlineSvg));
    expect(host).toBeTruthy();
    expect(host.injector.get(AngularInlineSvg)).toBeTruthy();
  });
});

describe('InlineSvg rendering', () => {
  let fixture: ComponentFixture<HostComponent>;

  beforeEach(() => {
    // jsdom does not always expose SVGRect; isSvgSupported() gates the loader on
    // it, so stub it to guarantee the browser path runs.
    vi.stubGlobal('SVGRect', class {});

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        headers: { get: (name: string) => (name === 'content-type' ? 'image/svg+xml' : null) },
        text: async () => GRADIENTS,
      })),
    );

    TestBed.configureTestingModule({ imports: [HostComponent] });
    fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.url = '0.svg';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches and inlines assets/0.svg into the host element', async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const host = fixture.debugElement.query(By.directive(AngularInlineSvg))
      .nativeElement as HTMLElement;
    const svg = host.querySelector('svg');

    expect(svg).toBeTruthy();
    // Structure from 0.svg survives parsing/scrubbing.
    expect(svg!.querySelector('linearGradient#grad')).toBeTruthy();
    expect(svg!.querySelector('clipPath#clip')).toBeTruthy();
    expect(svg!.querySelector('filter#blur')).toBeTruthy();
    expect(svg!.querySelector('use')!.getAttribute('href')).toBe('#grad');
    // Accessibility defaults are applied on commit.
    expect(svg!.getAttribute('focusable')).toBe('false');
    expect(svg!.getAttribute('aria-hidden')).toBe('true');
  });

  it('parses once and reuses the shared master for repeat icons', async () => {
    const parseSpy = vi.spyOn(AngularInlineSvg.prototype, 'parse');

    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const second = TestBed.createComponent(HostComponent);
    second.componentInstance.url = '0.svg';
    second.detectChanges();
    await second.whenStable();
    second.detectChanges();

    // The second instance hydrates from the cached master instead of re-parsing.
    expect(parseSpy).toHaveBeenCalledTimes(1);

    const firstSvg = (
      fixture.debugElement.query(By.directive(AngularInlineSvg)).nativeElement as HTMLElement
    ).querySelector('svg');
    const secondSvg = (
      second.debugElement.query(By.directive(AngularInlineSvg)).nativeElement as HTMLElement
    ).querySelector('svg');

    // Both render full, independent clones - not the same node.
    expect(firstSvg).toBeTruthy();
    expect(secondSvg).toBeTruthy();
    expect(secondSvg).not.toBe(firstSvg);
    expect(secondSvg!.querySelector('linearGradient#grad')).toBeTruthy();
    // Per-instance commit work (a11y defaults) still runs on the clone.
    expect(secondSvg!.getAttribute('aria-hidden')).toBe('true');
  });

  it('parses per instance when cacheParsedElements is disabled', async () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [HostComponent],
      providers: [provideInlineSvg({ cacheParsedElements: false })],
    });

    const parseSpy = vi.spyOn(AngularInlineSvg.prototype, 'parse');

    const first = TestBed.createComponent(HostComponent);
    first.componentInstance.url = '0.svg';
    first.detectChanges();
    await first.whenStable();
    first.detectChanges();

    const second = TestBed.createComponent(HostComponent);
    second.componentInstance.url = '0.svg';
    second.detectChanges();
    await second.whenStable();
    second.detectChanges();

    // Text/promise caching still applies, but each instance parses its own copy.
    expect(parseSpy).toHaveBeenCalledTimes(2);

    const secondSvg = (
      second.debugElement.query(By.directive(AngularInlineSvg)).nativeElement as HTMLElement
    ).querySelector('svg');
    expect(secondSvg).toBeTruthy();
    expect(secondSvg!.querySelector('linearGradient#grad')).toBeTruthy();
  });
});
