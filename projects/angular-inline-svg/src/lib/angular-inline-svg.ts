import {
  Directive,
  ElementRef,
  Renderer2,
  PLATFORM_ID,
  inject,

  // Signal
  input,
  output,
  effect,
  resource,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

import { InlineSvgCache } from './inline-svg.cache';
import { INLINE_SVG_CONFIG, isSvgSupported } from './inline-svg.config';

type SvgAttributeValue = string | number | boolean;

const GENERIC_FALLBACK_SVG = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="100%" height="100%" style="opacity: 0.3;">
    <rect width="22" height="22" x="1" y="1" rx="2" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="4"/>
  </svg>
`;

/**
 * Recursively remove all inline event handlers from an element.
 */
export function stripHandlers(el: Element) {
  for (const attr of Array.from(el.attributes)) {
    if (/^on/i.test(attr.name)) el.removeAttribute(attr.name);
  }

  for (const child of Array.from(el.children)) stripHandlers(child);
}

@Directive({
  selector: '[inlineSVG]',
  exportAs: 'inlineSvg',
})
export class AngularInlineSvg {
  #platformId = inject(PLATFORM_ID);
  #el = inject(ElementRef<HTMLElement>);
  #renderer = inject(Renderer2);
  #cache = inject(InlineSvgCache);
  #config = inject(INLINE_SVG_CONFIG);

  #isBrowser = isPlatformBrowser(this.#platformId);

  /** URL of the SVG to load and inline. */
  inlineSVG = input.required<string>();

  /** URL loaded instead if the main `inlineSVG` request fails. */
  fallbackSVG = input<string>();

  /** When true (default), relative URLs are resolved against the configured `baseUrl`. */
  resolveSVGUrl = input(true);

  /** Attributes applied to the root `<svg>` after load (e.g. `{ width: 24, fill: 'red' }`). */
  setSVGAttributes = input<Record<string, SvgAttributeValue>>();

  /** Attribute names stripped from the root `<svg>` after load. */
  removeSVGAttributes = input<readonly string[]>();

  /** When true (default), the SVG is cached and reused for subsequent requests. */
  useCache = input(true);

  /** Emits the inserted `<svg>` element once it is in the DOM (browser only). */
  loaded = output<SVGElement>();

  /** Emits when loading or parsing fails (after any fallback has also failed). */
  failed = output<Error>();

  /** * Optional callback to transform or sanitize the raw SVG string before parsing.
   * Useful for running external SVGs through DOMPurify.
   */
  preParse = input<(rawSvg: string) => string>();

  /**
   * We allow free access to the resource allowing you track and freely modify the state of the resource.
   */
  res = resource({
    params: () => {
      const url = this.inlineSVG();
      if (!url) return undefined;

      const fallback = this.fallbackSVG();
      return {
        url: this.#resolveUrl(url),
        fallback: fallback ? this.#resolveUrl(fallback) : undefined,
      };
    },
    loader: async ({ params, abortSignal }) => {
      if (!isSvgSupported() || !this.#isBrowser) return undefined;

      try {
        return await this.#load(params.url, abortSignal);
      } catch (err) {
        // Fall back to the secondary URL before giving up.
        if (params.fallback && params.fallback !== params.url) {
          return await this.#load(params.fallback, abortSignal);
        }

        throw err;
      }
    },
  });

  /**
   * Render reactively: re-runs when the markup OR the attribute inputs change.
   */
  #render = effect(() => {
    let raw = this.res.value();
    const error = this.res.error();

    if (error) {
      this.failed.emit(error);
      raw = GENERIC_FALLBACK_SVG;
    }

    /** The loader only resolves in the browser (it bails on the server), so by
     * the time we have markup we know we can parse/manipulate the DOM.
     */
    if (!raw) return this.clearHost();

    /**  Run the user's custom pre-parse hook if provided. */
    const transformFn = this.preParse();
    raw = transformFn ? transformFn(raw) : raw;

    const svg = this.parse(raw);
    if (!svg) {
      this.failed.emit(new Error('No <svg> element found in loaded contents'));
      return;
    }

    this.scrub(svg);
    this.applyAttributes(svg);
    this.clearHost();
    this.#renderer.appendChild(this.#el.nativeElement, svg);
    this.loaded.emit(svg);
  });

  async #load(url: string, abortSignal: AbortSignal): Promise<string> {
    if (!this.useCache()) return this.#fetch(url, abortSignal);

    /** Return the in-flight/cached request if we already have one */
    const cached = this.#cache.get(url);
    if (cached) return cached;

    /** Cache the promise synchronously so concurrent callers dedupe onto it */
    const request = this.#fetch(url, abortSignal);
    this.#cache.set(url, request);

    return request;
  }

  async #fetch(url: string, abortSignal: AbortSignal): Promise<string> {
    try {
      const res = await fetch(url, { signal: abortSignal });
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);

      const contentType = res.headers.get('content-type');
      const [fileType] = (contentType ?? '').split(/ ?; ?/);

      if (!['image/svg+xml', 'text/plain'].some((d) => fileType.includes(d))) {
        throw new Error(`Invalid SVG content type: ${fileType}`);
      }

      return await res.text();
    } catch (err) {
      // Don't cache failures, so a later attempt can retry cleanly.
      this.#cache.delete(url);
      throw err;
    }
  }

  #resolveUrl(url: string): string {
    const base = this.#config.baseUrl;
    const isAbsolute = /^(https?:)?\/\//i.test(url) || url.startsWith('/') || url.startsWith('#');

    if (!this.resolveSVGUrl() || !base || isAbsolute) return url;

    return `${base.replace(/\/+$/, '')}/${url.replace(/^\/+/, '')}`;
  }

  /**
   * Parsing in a detached element keeps the markup out of Angular's HTML
   * sanitizer, which would otherwise strip the <svg>. Safe for same-origin
   * assets; route untrusted input through DOMPurify before this directive.
   */
  parse(raw: string): SVGElement | null {
    const template = this.#renderer.createElement('div') as HTMLDivElement;
    template.innerHTML = raw;
    return template.querySelector('svg');
  }

  /**
   * Apply the attributes to the SVG element.
   */
  applyAttributes(svg: SVGElement): void {
    const toSet = this.setSVGAttributes();
    this.applyA11yDefaults(svg, toSet);

    const toRemove = this.removeSVGAttributes() ?? [];
    if (toRemove.length > 0) {
      // Create an array containing the root SVG + all its descendants
      const allElements = [svg, ...Array.from(svg.querySelectorAll('*'))];

      for (const el of allElements) {
        for (const name of toRemove) el.removeAttribute(name);
      }
    }

    if (toSet) {
      for (const [name, value] of Object.entries(toSet)) {
        svg.setAttribute(name, String(value));
      }
    }
  }

  /**
   * Apply the accessibility defaults to the SVG element.
   */
  applyA11yDefaults(svg: SVGElement, toSet: Record<string, SvgAttributeValue> | undefined): void {
    const has = (name: string) => svg.hasAttribute(name) || (!!toSet && name in toSet);

    // Prevents a legacy IE/Edge bug where SVGs land in the tab order.
    if (!has('focusable')) svg.setAttribute('focusable', 'false');

    // Treat the icon as decorative unless the consumer gave it a semantic hint,
    // so meaningful icons (role/aria-label) are never hidden from screen readers.
    const labelled = ['role', 'aria-label', 'aria-labelledby', 'aria-hidden'].some(has);
    if (!labelled) svg.setAttribute('aria-hidden', 'true');
  }

  /**
   * Defense-in-depth, NOT a full sanitizer: innerHTML on a detached node won't
   * execute <script>, but inline event handlers fire once it's in the live DOM.
   * Route genuinely untrusted input through DOMPurify upstream.
   */
  scrub(svg: SVGElement): void {
    for (const script of Array.from(svg.querySelectorAll('script'))) {
      script.remove();
    }

    stripHandlers(svg);
  }

  clearHost(): void {
    this.#renderer.setProperty(this.#el.nativeElement, 'innerHTML', '');
  }
}
