import { injectUids, injectUidsFrom } from './inline-svg.utils';
import {
  GRADIENTS,
  MESSY_GRADIENTS,
  SVG_WITH_STYLE_URL_REFS,
  SVG_WITH_BARE_ID_REFS,
  SVG_WITH_QUOTED_URL_REFS,
  SVG_WITH_PREFIX_OVERLAP,
  SVG_NO_STYLE,
  SVG_NO_IDS,
  SVG_STYLE_NO_HASH,
  SVG_HEX_COLOR_MATCHING_ID,
  SVG_MULTIPLE_STYLE_BLOCKS,
} from '../../assets/uniquifyIds';

describe('inline-svg utils', () => {
  describe('injectUids', () => {
    function parseSvg(raw: string): SVGElement {
      const div = document.createElement('div');
      div.innerHTML = raw;
      return div.querySelector('svg')!;
    }

    it('rewrites id attributes', () => {
      const svg = parseSvg(GRADIENTS);
      injectUids(svg, '42');

      expect(svg.querySelector('#grad-42')).toBeTruthy();
      expect(svg.querySelector('#clip-42')).toBeTruthy();
      expect(svg.querySelector('#blur-42')).toBeTruthy();
      // old ids gone
      expect(svg.querySelector('#grad')).toBeNull();
    });

    it('rewrites url() references', () => {
      const svg = parseSvg(GRADIENTS);
      injectUids(svg, '42');

      const rects = svg.querySelectorAll('rect');
      expect(rects[0].getAttribute('fill')).toBe('url(#grad-42)');
      expect(rects[1].getAttribute('clip-path')).toBe('url(#clip-42)');
      expect(rects[2].getAttribute('filter')).toBe('url(#blur-42)');
    });

    it('rewrites direct href references', () => {
      const svg = parseSvg(GRADIENTS);
      injectUids(svg, '42');

      expect(svg.querySelector('use')!.getAttribute('href')).toBe('#grad-42');
    });

    it('does nothing when there are no ids', () => {
      const svg = parseSvg(`<svg><rect width="10" height="10"/></svg>`);
      expect(() => injectUids(svg, '42')).not.toThrow();
    });

    it('two instances get different ids', () => {
      const svg1 = parseSvg(GRADIENTS);
      const svg2 = parseSvg(GRADIENTS);
      injectUids(svg1, '1');
      injectUids(svg2, '2');

      expect(svg1.querySelector('#grad-1')).toBeTruthy();
      expect(svg2.querySelector('#grad-2')).toBeTruthy();
      // no cross-contamination
      expect(svg1.querySelector('#grad-2')).toBeNull();
    });

    it('rewrites legacy xlink:href references', () => {
      const svg = parseSvg(MESSY_GRADIENTS);
      injectUids(svg, '42');

      const uses = svg.querySelectorAll('use');
      // The second <use> tag has the xlink:href
      expect(uses[1].getAttribute('xlink:href')).toBe('#clip-42');
    });

    it('rewrites multiple url() references inside a style attribute', () => {
      const svg = parseSvg(MESSY_GRADIENTS);
      injectUids(svg, '42');

      // Select the specific circle that actually has a style attribute applied
      const circle = svg.querySelector('circle[style]')!;
      const style = circle.getAttribute('style')!;

      expect(style).toContain('url(#grad-42)');
      expect(style).toContain('url(#ff0000-42)');
    });

    it('does not mutate hex colors that happen to match an id', () => {
      const svg = parseSvg(MESSY_GRADIENTS);
      injectUids(svg, '42');

      // The rect has fill="#ff0000", which matches the filter ID, but is just a color.
      const rects = svg.querySelectorAll('rect');
      expect(rects[1].getAttribute('fill')).toBe('#ff0000');
    });
  });

  describe('injectUidsFrom', () => {
    const hash = 'abc12';
    const baseURL = 'https://example.com/base';

    it('rewrites url(#id) references inside <style> tags', () => {
      const result = injectUidsFrom({ svgText: SVG_WITH_STYLE_URL_REFS, hash, baseURL });
      expect(result).toContain(`url(${baseURL}#grad__${hash})`);
      expect(result).toContain(`url(${baseURL}#clip__${hash})`);
      expect(result).toContain(`url(${baseURL}#blur__${hash})`);
    });

    it('rewrites bare #id selectors inside <style> tags', () => {
      const result = injectUidsFrom({ svgText: SVG_WITH_BARE_ID_REFS, hash, baseURL });
      expect(result).toContain(`#grad__${hash} { stop-color: red }`);
      expect(result).toContain(`url(${baseURL}#grad__${hash})`);
    });

    it('handles single and double quotes in url() inside <style> tags', () => {
      const result = injectUidsFrom({ svgText: SVG_WITH_QUOTED_URL_REFS, hash, baseURL });
      expect(result).toContain(`url('${baseURL}#grad__${hash}')`);
      expect(result).toContain(`url("${baseURL}#clip__${hash}")`);
    });

    it('avoids prefix overlap issues by matching the longest id first', () => {
      const result = injectUidsFrom({ svgText: SVG_WITH_PREFIX_OVERLAP, hash, baseURL });
      expect(result).toContain(`url(${baseURL}#foo__${hash})`);
      expect(result).toContain(`url(${baseURL}#foobar__${hash})`);
      expect(result).toContain(`#foo__${hash} { stop-color: red }`);
      expect(result).toContain(`#foobar__${hash} { stop-color: blue }`);
    });

    it('returns the original string if there is no <style> tag', () => {
      const result = injectUidsFrom({ svgText: SVG_NO_STYLE, hash, baseURL });
      expect(result).toBe(SVG_NO_STYLE);
    });

    it('returns the original string if there are no ids in the SVG', () => {
      const result = injectUidsFrom({ svgText: SVG_NO_IDS, hash, baseURL });
      expect(result).toBe(SVG_NO_IDS);
    });

    it('returns the original string if the <style> block has no # characters', () => {
      const result = injectUidsFrom({ svgText: SVG_STYLE_NO_HASH, hash, baseURL });
      expect(result).toBe(SVG_STYLE_NO_HASH);
    });

    it('rewrites matching hex colors inside <style> if they identically match an id', () => {
      // Due to the regex approach `(?![a-zA-Z0-9_-])`, a hex color like #ff0000
      // will be matched if the ID is strictly "ff0000" and it is followed by a semicolon or space.
      const result = injectUidsFrom({ svgText: SVG_HEX_COLOR_MATCHING_ID, hash, baseURL });
      expect(result).toContain(`fill: #ff0000__${hash};`);
      expect(result).toContain(`filter: url(${baseURL}#ff0000__${hash})`);
    });

    it('rewrites correctly across multiple <style> blocks', () => {
      const result = injectUidsFrom({ svgText: SVG_MULTIPLE_STYLE_BLOCKS, hash, baseURL });
      // Should have rewritten the grad reference in both separate style blocks
      const matches = result.match(new RegExp(`url\\(${baseURL}#grad__${hash}\\)`, 'g'));
      expect(matches?.length).toBe(2);
    });
  });
});
