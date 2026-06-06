// A Collection of parsing utilities for user freely to import and use in their own projects.

/**
 * Rewrites the ids of the SVG element and all its children.
 * This is useful to avoid conflicts with other SVGs that have the same ids.
 *
 * @warning This function is not SSR-safe.
 */
export function injectUids(svg: SVGElement, uid: string) {
  // 1. Find elements with IDs using standard NodeList iteration
  const elementsWithId = svg.querySelectorAll('[id]');
  if (elementsWithId.length === 0) return; // Fast bail!

  const idMap = new Map<string, string>();

  for (let i = 0; i < elementsWithId.length; i++) {
    const el = elementsWithId[i];
    const oldId = el.id;
    const newId = `${oldId}-${uid}`;

    idMap.set(oldId, newId);
    el.id = newId;
  }

  // 2. Rewrite attributes, avoiding Array.from() and Regex unless necessary
  const allElements = svg.querySelectorAll('*');

  for (let i = 0; i < allElements.length; i++) {
    const el = allElements[i];
    const attrs = el.attributes; // NamedNodeMap

    for (let j = 0; j < attrs.length; j++) {
      const attr = attrs[j];
      const val = attr.value;

      // FAST PATH: If the attribute value doesn't have a '#', skip it entirely.
      if (!val.includes('#')) continue;

      // Check for url(#id) pattern
      if (val.includes('url(')) {
        const newVal = val.replace(/url\(#([^)]+)\)/g, (match, id) => {
          const mapped = idMap.get(id);
          return mapped ? `url(#${mapped})` : match;
        });

        if (newVal !== val) el.setAttribute(attr.name, newVal);
      }
      // Check for direct href references
      else if (attr.name === 'href' || attr.name === 'xlink:href') {
        const id = val.substring(1); // strip the leading #
        const mapped = idMap.get(id);

        if (mapped) el.setAttribute(attr.name, `#${mapped}`);
      }
    }
  }
}

export interface InjectUidsFromOptions {
  svgText: string;
  hash: string;
  baseURL: string;
  [key: string]: any;
}

/**
 * Rewrites id references inside <style> blocks of an SVG string.
 * Optimized: single-pass combined regex, pre-escaped alternation,
 * fast-path bailouts, no per-id regex compilation.
 */
export function injectUidsFrom({ svgText, hash, baseURL }: InjectUidsFromOptions): string {
  // --- 1. Collect all IDs from the SVG (one pass) ---
  const idMatches = svgText.matchAll(/\bid=(["'])([^"']+)\1/g);
  const ids = [...new Set([...idMatches].map((m) => m[2]))];

  if (!ids.length) return svgText;

  // --- 2. Pre-escape all ids and build ONE combined alternation ---
  // Sorted longest-first so the alternation engine greedily matches the
  // longest possible id (avoids "foo" shadowing "foobar").
  const escapedIds = ids
    .sort((a, b) => b.length - a.length)
    .map((id) => id.replace(/[$()*+.?[\\\]^{|}]/g, '\\$&'));

  const alt = escapedIds.join('|');

  // Two combined patterns compiled ONCE:
  //   urlPattern  — url('#id') / url("#id") / url(#id)
  //   refPattern  — bare #id not followed by an id-continue char
  const urlPattern = new RegExp(`url\\((['"]?)#(${alt})\\1\\)`, 'g');
  const refPattern = new RegExp(`#(${alt})(?![a-zA-Z0-9_-])`, 'g');

  // --- 3. Walk only <style> blocks, bail early when possible ---
  return svgText.replace(/<style[^>]*>([\S\s]*?)<\/style>/gi, (fullMatch, cssContent: string) => {
    // Fast-path: no '#' means nothing to rewrite
    if (!cssContent.includes('#')) return fullMatch;

    const modified = cssContent
      // url(#id)  →  url(baseURL#id__hash)
      .replace(urlPattern, (_, quote, id) => `url(${quote}${baseURL}#${id}__${hash}${quote})`)
      // #id  →  #id__hash
      .replace(refPattern, (_, id) => `#${id}__${hash}`);

    // Only pay the string-replace cost when something actually changed
    return modified === cssContent ? fullMatch : fullMatch.replace(cssContent, modified);
  });
}
