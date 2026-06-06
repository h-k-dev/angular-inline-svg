// A Collection of parsing utilities for user freely to import and use in their own projects.

/**
 * Rewrites the ids of the SVG element and all its children.
 * This is useful to avoid conflicts with other SVGs that have the same ids.
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
