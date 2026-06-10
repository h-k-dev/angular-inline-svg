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
  computed,
  resource,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

import { InlineSvgCache } from './inline-svg.cache';
import { INLINE_SVG_CONFIG, INLINE_SVG_FETCHER, isSvgSupported } from './inline-svg.config';

import { InjectUidsFromOptions } from './inline-svg.utils';

type SvgAttributeValue = string | number | boolean;

const GENERIC_FALLBACK_SVG = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="100%" height="100%" style="opacity: 0.3;">
    <rect width="22" height="22" x="1" y="1" rx="2" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="4"/>
  </svg>
`;

@Directive({
  selector: '[inlineSVG]',
  exportAs: 'inlineSvg',
})
export class AngularInlineSvg {
  #platformId = inject(PLATFORM_ID);
  #el = inject(ElementRef<HTMLElement>);
  #renderer = inject(Renderer2);

  // Cache for in-memory storage of SVGs.
  #cache = inject(InlineSvgCache);

  // Customizable configuration and fetcher.
  #config = inject(INLINE_SVG_CONFIG);
  #fetcher = inject(INLINE_SVG_FETCHER);

  #isBrowser = isPlatformBrowser(this.#platformId);

  /**
   * Stable per-instance id, generated once at construction, used when no
   * explicit `hash` is supplied. Kept off the reactive render path so we never
   * mutate shared config while an effect is running.
   */
  #uid = `__${this.#config.uid++}`;

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
  preParse = input<(options: InjectUidsFromOptions) => string>();

  /** Optional callback to run after the SVG has been scrubbed and the attributes have been applied. */
  afterScrub = input<(svg: SVGElement) => void>();

  /** The hash to use for the SVG. */
  hash = input('');

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
   * Pure derivation: turn the loaded markup into a pristine, scrubbed (but
   * attribute-free) detached `<svg>`. Memoized so it only recomputes when the
   * source markup, `preParse`, or `hash` change - never on attribute changes.
   * Side effects (DOM mutation, output emits) belong in `#commit`.
   */
  #scrubbed = computed<{ svg: SVGElement | null; error?: Error }>(() => {
    const error = this.res.error();
    // Reading value() while the resource is errored throws, so only read it on
    // the success path and fall back to the generic placeholder otherwise.
    let raw = error ? undefined : this.res.value();

    if (error) {
      raw = GENERIC_FALLBACK_SVG;
    } else if (!raw && this.useCache()) {
      /** Synchronous cache hydration: a repeat icon paints immediately from the
       * already-resolved cache entry instead of flashing empty while the
       * resource resolves on a microtask.
       */
      const url = this.inlineSVG();
      if (url) raw = this.#cache.getText(this.#resolveUrl(url));
    }

    /** The loader only resolves in the browser (it bails on the server), so by
     * the time we have markup we know we can parse/manipulate the DOM.
     */
    if (!raw) return { svg: null, error };

    /**  Run the user's custom pre-parse hook if provided. */
    const transformFn = this.preParse();

    /** Shared master: when the markup needs no per-instance transform, parse +
     * scrub happen once per URL and every other instance just clones the cached
     * master. `preParse` markup is excluded because the hook can rewrite the
     * text per instance (e.g. uid injection). The master is only ever cloned in
     * `#render`, never mutated, so sharing it is safe.
     */
    const masterKey =
      !error && !transformFn && this.useCache() ? this.#resolveUrl(this.inlineSVG()) : undefined;

    if (masterKey) {
      const master = this.#cache.getElement(masterKey, raw);
      if (master) return { svg: master, error };
    }

    if (transformFn) {
      const hash = this.hash() || this.#uid;
      raw = transformFn({
        svgText: raw,
        hash,
        baseURL: this.#config.baseUrl,
      });
    }

    const svg = this.parse(raw);
    if (!svg) {
      return { svg: null, error: error ?? new Error('No <svg> element found in loaded contents') };
    }

    scrub(svg);

    if (masterKey) this.#cache.setElement(masterKey, raw, svg);

    return { svg, error };
  });

  /**
   * Commit to the DOM: re-runs when the scrubbed source OR the attribute inputs
   * change, but only clones and applies attributes - never re-parses/scrubs.
   */
  #render = effect(() => {
    const { svg, error } = this.#scrubbed();

    if (error) this.failed.emit(error);
    if (!svg) return this.clearHost();

    const clone = svg.cloneNode(true) as SVGElement;

    this.afterScrub()?.(clone);
    this.applyAttributes(clone);

    /** Send it */
    this.clearHost();
    this.#renderer.appendChild(this.#el.nativeElement, clone);
    this.loaded.emit(clone);
  });

  async #load(url: string, abortSignal: AbortSignal): Promise<string> {
    if (!this.useCache()) return this.#request(url, abortSignal);

    /** Return the in-flight/cached request if we already have one */
    const cached = this.#cache.get(url);
    if (cached) return cached;

    /** Cache the promise synchronously so concurrent callers dedupe onto it */
    const request = this.#request(url, abortSignal);
    this.#cache.set(url, request);

    return request;
  }

  async #request(url: string, abortSignal: AbortSignal): Promise<string> {
    try {
      // Delegate to the configured fetcher (default native fetch or user-provided).
      return await this.#fetcher(url, abortSignal);
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
    const toRemove = this.removeSVGAttributes() ?? [];

    this.applyA11yDefaults(svg, toSet);

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

  clearHost(): void {
    this.#renderer.setProperty(this.#el.nativeElement, 'innerHTML', '');
  }
}

/**
 * Defense-in-depth, NOT a full sanitizer: innerHTML on a detached node won't
 * execute <script>, but inline event handlers fire once it's in the live DOM.
 * Route genuinely untrusted input through DOMPurify upstream.
 */
export function scrub(svg: SVGElement) {
  for (const script of Array.from(svg.querySelectorAll('script'))) {
    script.remove();
  }

  stripHandlers(svg);
}

/**
 * Recursively remove all inline event handlers from an element.
 */
export function stripHandlers(el: Element) {
  for (const attr of Array.from(el.attributes)) {
    if (/^on/i.test(attr.name)) el.removeAttribute(attr.name);
  }

  for (const child of Array.from(el.children)) stripHandlers(child);
}
