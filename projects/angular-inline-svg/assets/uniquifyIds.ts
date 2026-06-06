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
