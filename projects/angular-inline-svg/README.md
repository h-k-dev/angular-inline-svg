# @h-k-dev/angular-inline-svg

A tiny, **signal-based** Angular directive that fetches an SVG by URL and inlines it directly into the DOM, so you can style and script it with CSS and JavaScript like any other element.

Built for modern Angular (v21+): standalone, zoneless-friendly, and powered by `resource()`, `input()`, `output()`, and `effect()`.

## Features

- **Inline, not `<img>`** &mdash; the SVG lands in the DOM so `currentColor`, CSS, and JS all work.
- **Reactive** &mdash; built on Angular signals and `resource()`; re-renders automatically when inputs change.
- **Caching** &mdash; bounded LRU + TTL cache with in-flight request de-duplication.
- **Collision prevention** &mdash; auto-scopes internal SVG IDs (like gradients and clip-paths) to prevent visual bugs when rendering multiple icons.
- **Fallbacks** &mdash; supply a `fallbackSVG` URL, with a built-in generic placeholder as a last resort.
- **Attribute manipulation** &mdash; add or strip attributes on the inserted `<svg>` (e.g. `width`, `fill`).
- **Accessible by default** &mdash; sets `focusable="false"` and `aria-hidden="true"` unless you provide a semantic hint.
- **SSR-safe** &mdash; bails out cleanly on the server and only touches the DOM in the browser.
- **Hardened** &mdash; strips `<script>` tags and inline `on*` handlers as defense-in-depth.

## Installation

```bash
npm install @h-k-dev/angular-inline-svg