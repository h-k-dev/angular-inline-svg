# @h-k-dev/angular-inline-svg

A tiny, **signal-based** Angular directive that fetches an SVG by URL and inlines it directly into the DOM, so you can style and script it with CSS and JavaScript like any other element. Think of this as the modern Angular counterpart to [react-inlinesvg](https://www.npmjs.com/package/react-inlinesvg).

> 💡 **Legacy Browser / Older Angular Support:** This package is heavily optimized for modern, cutting-edge environments. If you need to support legacy browsers or older versions of Angular, please use [ng-inline-svg-2](https://www.npmjs.com/package/ng-inline-svg-2).

My objectives is to stay in the browser - I expose functions from utils and more for you to build your own pipe line on server side.

## Features

- **Inline, not `<img>`** &mdash; the SVG lands in the DOM so `currentColor`, CSS, and JS all work.
- **Reactive** &mdash; built on Angular signals and `resource()`; re-renders automatically when inputs change.
- **Caching** &mdash; bounded LRU + TTL cache with in-flight request de-duplication.
- **Fallbacks** &mdash; supply a `fallbackSVG` URL, with a built-in generic placeholder as a last resort.
- **Attribute manipulation** &mdash; add or strip attributes on the inserted `<svg>` (e.g. `width`, `fill`).
- **Accessible by default** &mdash; sets `focusable="false"` and `aria-hidden="true"` unless you provide a semantic hint.
- **SSR-safe** &mdash; bails out cleanly on the server and only touches the DOM in the browser.
- **Hardened** &mdash; strips `<script>` tags and inline `on*` handlers as defense-in-depth.

## Installation

```bash
npm install @h-k-dev/angular-inline-svg
```

## Quick start

The directive is standalone &mdash; just import it where you need it.

```typescript
import { Component } from '@angular/core';
import { AngularInlineSvg } from '@h-k-dev/angular-inline-svg';

@Component({
  selector: 'app-logo',
  imports: [AngularInlineSvg],
  template: `<span [inlineSVG]="'assets/icons/logo.svg'"></span>`,
})
export class LogoComponent {}
```

The fetched SVG is appended to the host element, so the markup above renders as:

```html
<span><svg ...>...</svg></span>
```

## Configuration

Configure the directive once at the application root with `provideInlineSvg()`:

```typescript
import { ApplicationConfig } from '@angular/core';
import { provideInlineSvg } from '@h-k-dev/angular-inline-svg';

export const appConfig: ApplicationConfig = {
  providers: [
    provideInlineSvg({
      baseUrl: 'assets/icons',
      cacheMaxEntries: 100,
      cacheTtlMs: 5 * 60 * 1000, // 5 minutes
    }),
  ],
};
```

| Option            | Type               | Default       | Description                                                                                  |
| ----------------- | ------------------ | ------------- | -------------------------------------------------------------------------------------------- |
| `baseUrl`         | `string`           | `''`          | Prepended to relative URLs when `resolveSVGUrl` is enabled.                                  |
| `cacheMaxEntries` | `number`           | `100`         | Maximum cached SVGs before least-recently-used eviction.                                     |
| `cacheTtlMs`      | `number`           | `300000`      | How long (ms) a cached SVG stays fresh before it is refetched.                               |
| `fetcher`         | `InlineSvgFetcher` | native `fetch`| DI-free custom fetcher. For DI-based fetchers (e.g. `HttpClient`), use `provideInlineSvgFetcher`. |

> Custom fetchers are responsible for their own content-type validation. The
> built-in default rejects responses that aren't `image/svg+xml` or `text/plain`.

## Custom fetcher

By default the directive loads SVGs with the native `fetch` API. You can swap in
your own transport - to add auth headers, go through an interceptor stack, or use
a different HTTP client. A fetcher is any promise-based function matching:

```typescript
type InlineSvgFetcher = (url: string, abortSignal: AbortSignal) => Promise<string>;
```

Honor the `abortSignal` so in-flight requests are cancelled when the directive is
destroyed or its URL changes.

### Native fetch with custom headers

For a DI-free fetcher, pass it straight to `provideInlineSvg`:

```typescript
import { provideInlineSvg } from '@h-k-dev/angular-inline-svg';

provideInlineSvg({
  fetcher: async (url, signal) => {
    const res = await fetch(url, {
      signal,
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    return res.text();
  },
});
```

### Axios

Axios supports `AbortSignal` natively via its `signal` option:

```typescript
import axios from 'axios';
import { provideInlineSvg } from '@h-k-dev/angular-inline-svg';

provideInlineSvg({
  fetcher: (url, signal) =>
    axios.get<string>(url, { signal, responseType: 'text' }).then((res) => res.data),
});
```

### Angular HttpClient

`HttpClient` needs dependency injection, so build the fetcher inside an injection
context with `provideInlineSvgFetcher`. Bridge the `abortSignal` to unsubscription
so aborts actually cancel the request:

```typescript
import { inject } from '@angular/core';
import { HttpClient, provideHttpClient } from '@angular/common/http';
import { firstValueFrom, fromEvent, takeUntil } from 'rxjs';
import { provideInlineSvgFetcher } from '@h-k-dev/angular-inline-svg';

export const appConfig: ApplicationConfig = {
  providers: [
    provideHttpClient(),
    provideInlineSvgFetcher(() => {
      const http = inject(HttpClient);
      return (url, signal) =>
        firstValueFrom(
          http
            .get(url, { responseType: 'text' })
            .pipe(takeUntil(fromEvent(signal, 'abort'))),
        );
    }),
  ],
};
```

## API

### Inputs

| Input                 | Type                                      | Default | Description                                                                                  |
| --------------------- | ----------------------------------------- | ------- | -------------------------------------------------------------------------------------------- |
| `inlineSVG`           | `string` (required)                       | &mdash; | URL of the SVG to load and inline.                                                           |
| `fallbackSVG`         | `string`                                  | &mdash; | URL loaded instead if the main `inlineSVG` request fails.                                     |
| `resolveSVGUrl`       | `boolean`                                 | `true`  | When `true`, relative URLs are resolved against the configured `baseUrl`.                    |
| `setSVGAttributes`    | `Record<string, string \| number \| boolean>` | &mdash; | Attributes applied to the root `<svg>` after load (e.g. `{ width: 24, fill: 'red' }`).  |
| `removeSVGAttributes` | `readonly string[]`                       | &mdash; | Attribute names stripped from the `<svg>` and all descendants after load.                    |
| `useCache`            | `boolean`                                 | `true`  | When `true`, the SVG is cached and reused for subsequent requests.                           |
| `preParse`            | `(rawSvg: string) => string`              | &mdash; | Optional hook to transform/sanitize the raw SVG string before parsing (e.g. via DOMPurify).  |

### Outputs

| Output   | Payload      | Description                                                       |
| -------- | ------------ | ----------------------------------------------------------------- |
| `loaded` | `SVGElement` | Emits the inserted `<svg>` element once it is in the DOM.         |
| `failed` | `Error`      | Emits when loading or parsing fails (after any fallback fails).   |

## Usage examples

### Setting and removing attributes

```html
<span
  [inlineSVG]="'icon.svg'"
  [setSVGAttributes]="{ width: 32, height: 32, fill: 'currentColor' }"
  [removeSVGAttributes]="['width', 'height']"
></span>
```

### Fallback and event handling

```html
<span
  [inlineSVG]="'maybe-missing.svg'"
  [fallbackSVG]="'placeholder.svg'"
  (loaded)="onLoaded($event)"
  (failed)="onFailed($event)"
></span>
```

```typescript
onLoaded(svg: SVGElement) {
  console.log('SVG inserted', svg);
}

onFailed(err: Error) {
  console.error('SVG failed to load', err);
}
```

### Sanitizing untrusted SVGs

For SVGs from untrusted sources, run them through a sanitizer such as
[DOMPurify](https://github.com/cure53/DOMPurify) using the `preParse` hook:

```typescript
import DOMPurify from 'dompurify';

protected readonly sanitize = (raw: string): string => DOMPurify.sanitize(raw);
```

```html
<span [inlineSVG]="untrustedUrl" [preParse]="sanitize"></span>
```

## Security

The directive parses markup in a detached element (keeping it out of Angular's
sanitizer so the `<svg>` survives) and, as defense-in-depth, removes `<script>`
tags and inline `on*` event handlers. This is **not** a full sanitizer. For
genuinely untrusted input, always route the SVG through DOMPurify via `preParse`.

## Accessibility

After loading, the directive applies sensible defaults to the root `<svg>`:

- `focusable="false"` &mdash; keeps the SVG out of the tab order.
- `aria-hidden="true"` &mdash; treats the icon as decorative.

If you provide any of `role`, `aria-label`, `aria-labelledby`, or `aria-hidden`
via `setSVGAttributes`, the directive leaves it visible to screen readers:

```html
<span
  [inlineSVG]="'search.svg'"
  [setSVGAttributes]="{ role: 'img', 'aria-label': 'Search' }"
></span>
```

## License

MIT
