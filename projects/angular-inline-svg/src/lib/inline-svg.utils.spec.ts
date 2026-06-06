import { injectUids } from './inline-svg.utils';
import { GRADIENTS, MESSY_GRADIENTS } from '../../assets/uniquifyIds';

describe('uniquifyIds', () => {
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
