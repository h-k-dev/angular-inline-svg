export const GRADIENTS = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <defs>
    <linearGradient id="grad">
      <stop offset="0%" stop-color="blue"/>
      <stop offset="100%" stop-color="red"/>
    </linearGradient>
    <clipPath id="clip">
      <circle cx="50" cy="50" r="40"/>
    </clipPath>
    <filter id="blur">
      <feGaussianBlur stdDeviation="2"/>
    </filter>
  </defs>

  <!-- url(#...) references -->
  <rect width="100" height="100" fill="url(#grad)"/>
  <rect width="100" height="100" clip-path="url(#clip)"/>
  <rect width="100" height="100" filter="url(#blur)"/>

  <!-- direct href reference -->
  <use href="#grad"/>
</svg>`;

export const MESSY_GRADIENTS = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <defs>
    <linearGradient id="grad">
      <stop offset="0%" stop-color="blue"/>
      <stop offset="100%" stop-color="red"/>
    </linearGradient>
    <clipPath id="clip">
      <circle cx="50" cy="50" r="40"/>
    </clipPath>
    <filter id="ff0000">
      <feGaussianBlur stdDeviation="2"/>
    </filter>
  </defs>

  <rect width="100" height="100" fill="url(#grad)" clip-path="url(#clip)"/>

  <circle cx="50" cy="50" r="40" style="fill: url(#grad); filter: url(#ff0000);" />

  <use href="#grad"/>

  <use xlink:href="#clip"/>

  <rect width="10" height="10" fill="#ff0000" />
</svg>`;

const SVG_WITH_STYLE_URL_REFS = `
<svg xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="grad"/>
    <clipPath id="clip"/>
    <filter id="blur"/>
  </defs>
  <style>
    .a { fill: url(#grad) }
    .b { clip-path: url(#clip) }
    .c { filter: url(#blur) }
  </style>
  <rect class="a"/>
</svg>`;

const SVG_WITH_BARE_ID_REFS = `
<svg xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="grad"/>
  </defs>
  <style>
    #grad { stop-color: red }
    .cls { fill: url(#grad) }
  </style>
</svg>`;

const SVG_WITH_QUOTED_URL_REFS = `
<svg xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="grad"/>
    <clipPath id="clip"/>
  </defs>
  <style>
    .a { fill: url('#grad') }
    .b { clip-path: url("#clip") }
  </style>
</svg>`;

const SVG_WITH_PREFIX_OVERLAP = `
<svg xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="foo"/>
    <clipPath id="foobar"/>
  </defs>
  <style>
    .a { fill: url(#foo) }
    .b { clip-path: url(#foobar) }
    #foo { stop-color: red }
    #foobar { stop-color: blue }
  </style>
</svg>`;

const SVG_NO_STYLE = `
<svg xmlns="http://www.w3.org/2000/svg">
  <defs><linearGradient id="grad"/></defs>
  <rect fill="url(#grad)"/>
</svg>`;

const SVG_NO_IDS = `
<svg xmlns="http://www.w3.org/2000/svg">
  <style>.a { fill: red }</style>
  <rect class="a"/>
</svg>`;

const SVG_STYLE_NO_HASH = `
<svg xmlns="http://www.w3.org/2000/svg">
  <defs><linearGradient id="grad"/></defs>
  <style>
    .a { fill: red; stroke: blue }
  </style>
</svg>`;

const SVG_HEX_COLOR_MATCHING_ID = `
<svg xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="ff0000"/>
  </defs>
  <style>
    .a { fill: #ff0000; filter: url(#ff0000) }
  </style>
  <rect fill="#ff0000"/>
</svg>`;

const SVG_MULTIPLE_STYLE_BLOCKS = `
<svg xmlns="http://www.w3.org/2000/svg">
  <defs><linearGradient id="grad"/></defs>
  <style>.a { fill: url(#grad) }</style>
  <style>.b { fill: url(#grad) }</style>
</svg>`;
