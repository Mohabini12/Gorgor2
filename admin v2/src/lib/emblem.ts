/**
 * GORGOR tactical seal — the single source of truth for the app emblem.
 *
 * Everything here is real vector geometry (no raster art), so the same mark is
 * used for the in-app logo, the PWA icon, and the backend-generated brand
 * assets served from `/api/branding/icon.svg`.
 */

export interface EmblemConfig {
  /** Lettering running around the white band of the seal. */
  ringText: string;
  goldLight: string;
  gold: string;
  goldDeep: string;
  redLight: string;
  red: string;
  redDeep: string;
  /** Outline / detail ink. */
  ink: string;
  /** Ring lettering colour. */
  ringInk: string;
  /** Full-bleed plate behind the seal. */
  plate: string;
}

export const DEFAULT_EMBLEM: EmblemConfig = {
  ringText: "SOMAALIYEED TALISKA CIIDANKA XOOOGGA DAAKA",
  goldLight: "#FBE28C",
  gold: "#E8B22C",
  goldDeep: "#A9741B",
  redLight: "#E33C33",
  red: "#CE2028",
  redDeep: "#A10F1B",
  ink: "#8B5D12",
  ringInk: "#C4202B",
  plate: "#FDFBF3",
};

export type EmblemVariant = "seal" | "mono";

/** Shape returned by `/api/branding` and stored in the `branding` table. */
export interface BrandingState {
  appName: string;
  subtitleEn: string;
  subtitleSo: string;
  variant: EmblemVariant;
  emblem: EmblemConfig;
  updatedAt: string | null;
}

const CX = 256;
const CY = 256;
const RING_R = 207;
const RING_FS = 34;
const TRACKING = 0.06;

const CHAR_W: Record<string, number> = {
  A: 0.66, B: 0.63, C: 0.66, D: 0.68, E: 0.58, F: 0.55, G: 0.69, H: 0.69,
  I: 0.28, J: 0.52, K: 0.63, L: 0.55, M: 0.84, N: 0.7, O: 0.72, P: 0.61,
  Q: 0.72, R: 0.63, S: 0.62, T: 0.58, U: 0.68, V: 0.64, W: 0.87, X: 0.63,
  Y: 0.61, Z: 0.58, " ": 0.28,
};

export interface RingGlyph {
  c: string;
  x: number;
  y: number;
  deg: number;
}

/** Distributes each letter of the seal ring individually along the arc. */
export function ringGlyphs(ringText: string): RingGlyph[] {
  const chars = [...ringText.toUpperCase()];
  const widths = chars.map((c) => (CHAR_W[c] ?? 0.62) + TRACKING);
  const total = widths.reduce((a, b) => a + b, 0);
  let acc = 0;
  return chars
    .map((c, i) => {
      const mid = acc + widths[i] / 2 - total / 2;
      acc += widths[i];
      const theta = (mid * RING_FS) / RING_R;
      return {
        c,
        x: CX + RING_R * Math.sin(theta),
        y: CY - RING_R * Math.cos(theta),
        deg: (theta * 180) / Math.PI,
      };
    })
    .filter((g) => g.c !== " ");
}

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

const FEATHER =
  "M0,-6 C26,-17 62,-16 94,-5 C99,-3 99,1 94,3 C62,13 26,12 0,4 Z";
const RAY_LONG = "M251.8,228 L260.2,228 L257.2,182 L254.8,182 Z";
const RAY_SHORT = "M252.2,228 L259.8,228 L257.2,200 L254.8,200 Z";
const SHOULDER = "M-18,-16 C2,-27 26,-23 42,-10 C28,7 0,13 -18,10 Z";
const SABER =
  "M-6.5,2 L6.5,2 C10,-90 8,-180 1.5,-252 L0,-262 L-3.5,-250 C-4,-180 -4,-90 -6.5,2 Z";
const SABER_GUARD = "M-21,3 L21,3 L18,13 L-18,13 Z";
const SABER_GRIP = "M-5.5,13 L5.5,13 L5,33 L-5,33 Z";
const ANCHOR_ARMS =
  "M196,326 L216,344 C222,368 238,382 256,382 C274,382 290,368 296,344 L316,326 L306,340 C298,362 278,370 256,370 C234,370 214,362 206,340 Z";
const STAR =
  "M256,98 L265.4,125.1 L294,125.6 L271.2,142.9 L279.5,170.4 L256,154 L232.5,170.4 L240.8,142.9 L218,125.6 L246.6,125.1 Z";

const PRIMARY_FEATHERS: [number, number][] = [
  [-54, 1.02],
  [-41, 1.18],
  [-29, 1.31],
  [-18, 1.39],
  [-8, 1.36],
  [1, 1.22],
];

const COVERT_FEATHERS: [number, number][] = [
  [-34, 0.62],
  [-22, 0.7],
  [-11, 0.72],
  [-1, 0.64],
];

export interface BuildEmblemOptions {
  variant?: EmblemVariant;
  /** Draw the full-bleed plate behind the seal (needed for launcher masks). */
  plate?: boolean;
  /** Prefix for gradient / symbol ids so multiple instances never collide. */
  idPrefix?: string;
  size?: number;
}

/**
 * Renders the complete emblem as SVG markup.
 * Used by the backend icon route and by the in-app logo component.
 */
export function buildEmblemSvg(
  config: Partial<EmblemConfig> = {},
  options: BuildEmblemOptions = {}
): string {
  const cfg: EmblemConfig = { ...DEFAULT_EMBLEM, ...config };
  const variant = options.variant ?? "seal";
  const withPlate = options.plate ?? true;
  const p = options.idPrefix ? `${options.idPrefix}-` : "";
  const sizeAttr = options.size ? ` width="${options.size}" height="${options.size}"` : "";

  const mono = variant === "mono";
  const ink = mono ? "currentColor" : cfg.ink;
  const goldFill = mono ? "currentColor" : `url(#${p}goldWing)`;
  const steelFill = mono ? "currentColor" : `url(#${p}goldSteel)`;
  const ringFill = mono ? "currentColor" : `url(#${p}goldRing)`;
  const fieldFill = mono ? "currentColor" : `url(#${p}redField)`;
  const burstFill = mono ? "currentColor" : "#FFF8E4";
  const coreFill = mono ? "currentColor" : "#FFFDF6";

  const glyphs = mono ? [] : ringGlyphs(cfg.ringText);
  const ringMarkup = glyphs
    .map(
      (g) =>
        `    <text x="0" y="0" transform="translate(${g.x.toFixed(2)},${g.y.toFixed(
          2
        )}) rotate(${g.deg.toFixed(2)})">${escapeXml(g.c)}</text>`
    )
    .join("\n");

  const rays = Array.from({ length: 16 }, (_, i) => {
    const shape = i % 2 === 0 ? RAY_LONG : RAY_SHORT;
    return `      <path d="${shape}" transform="rotate(${i * 22.5},256,250)"/>`;
  }).join("\n");

  const primaries = PRIMARY_FEATHERS.map(
    ([deg, s]) =>
      `      <use href="#${p}feather" xlink:href="#${p}feather" transform="rotate(${deg}) scale(${s})"/>`
  ).join("\n");

  const coverts = COVERT_FEATHERS.map(
    ([deg, s]) =>
      `      <use href="#${p}feather" xlink:href="#${p}feather" transform="rotate(${deg}) scale(${s})"/>`
  ).join("\n");

  const plateRect = withPlate
    ? `  <rect width="512" height="512" fill="${mono ? "none" : cfg.plate}"/>\n`
    : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 512 512"${sizeAttr} fill="none" role="img" aria-label="GORGOR emblem">
  <defs>
    <linearGradient id="${p}goldRing" x1="0" y1="0" x2="0.35" y2="1">
      <stop offset="0" stop-color="${cfg.goldLight}"/>
      <stop offset="0.45" stop-color="${cfg.gold}"/>
      <stop offset="1" stop-color="${cfg.goldDeep}"/>
    </linearGradient>
    <linearGradient id="${p}goldWing" x1="0" y1="0" x2="0.2" y2="1">
      <stop offset="0" stop-color="${cfg.goldLight}"/>
      <stop offset="0.5" stop-color="${cfg.gold}"/>
      <stop offset="1" stop-color="${cfg.goldDeep}"/>
    </linearGradient>
    <linearGradient id="${p}goldSteel" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${cfg.goldLight}"/>
      <stop offset="0.5" stop-color="${cfg.gold}"/>
      <stop offset="1" stop-color="${cfg.goldDeep}"/>
    </linearGradient>
    <radialGradient id="${p}redField" cx="50%" cy="40%" r="72%">
      <stop offset="0" stop-color="${cfg.redLight}"/>
      <stop offset="0.58" stop-color="${cfg.red}"/>
      <stop offset="1" stop-color="${cfg.redDeep}"/>
    </radialGradient>

    <!-- Eagle primary feather, rooted at the origin and pointing +X -->
    <path id="${p}feather" d="${FEATHER}"/>

    <!-- Right wing: six primaries, four coverts and the shoulder -->
    <g id="${p}wingR">
${primaries}
${coverts}
      <path d="${SHOULDER}"/>
    </g>

    <!-- Sabre: curved blade, cross-guard, grip and pommel -->
    <g id="${p}saber">
      <path d="${SABER}"/>
      <path d="${SABER_GUARD}"/>
      <path d="${SABER_GRIP}"/>
      <circle cx="0" cy="40" r="8"/>
    </g>
  </defs>
${plateRect}
  <g transform="translate(256,256) scale(0.945) translate(-256,-256)">
    <!-- Gold rim and lettering band -->
    <circle cx="256" cy="256" r="252" fill="${ringFill}"/>
    <circle cx="256" cy="256" r="244" fill="${mono ? "none" : cfg.plate}"/>
    <circle cx="256" cy="256" r="248" fill="none" stroke="${ink}" stroke-width="2" stroke-opacity="0.55"/>
${
  glyphs.length
    ? `    <!-- Ring lettering -->
    <g font-family="'Arial Narrow','Oswald','Helvetica Neue',Arial,sans-serif" font-size="${RING_FS}" font-weight="700" fill="${cfg.ringInk}" text-anchor="middle">
${ringMarkup}
    </g>
`
    : ""
}
    <!-- Inner gold ring and red field -->
    <circle cx="256" cy="256" r="194" fill="none" stroke="${ringFill}" stroke-width="9"/>
    <circle cx="256" cy="256" r="188" fill="${fieldFill}"/>
    <circle cx="256" cy="256" r="178" fill="none" stroke="${mono ? "currentColor" : cfg.plate}" stroke-width="1.6" stroke-opacity="0.22"/>

    <!-- Crossed sabres behind the eagle -->
    <g fill="${steelFill}" stroke="${ink}" stroke-width="1.4" stroke-linejoin="round">
      <use href="#${p}saber" xlink:href="#${p}saber" transform="translate(196,382) rotate(35)"/>
      <use href="#${p}saber" xlink:href="#${p}saber" transform="translate(316,382) rotate(-35)"/>
    </g>

    <!-- Eagle wings -->
    <g fill="${goldFill}" stroke="${ink}" stroke-width="1.6" stroke-linejoin="round">
      <g transform="translate(256,250)">
        <use href="#${p}wingR" xlink:href="#${p}wingR"/>
        <use href="#${p}wingR" xlink:href="#${p}wingR" transform="scale(-1,1)"/>
      </g>
    </g>

    <!-- Navy anchor -->
    <g fill="${goldFill}" stroke="${ink}" stroke-width="1.6" stroke-linejoin="round">
      <circle cx="256" cy="298" r="11" fill="none" stroke="${goldFill}" stroke-width="8"/>
      <rect x="250" y="304" width="12" height="72" rx="5"/>
      <rect x="218" y="310" width="76" height="12" rx="6"/>
      <path d="${ANCHOR_ARMS}"/>
    </g>

    <!-- Central sunburst -->
    <g fill="${burstFill}">
${rays}
    </g>
    <circle cx="256" cy="250" r="26" fill="${coreFill}" stroke="${mono ? "currentColor" : cfg.gold}" stroke-width="3.5"/>

    <!-- Gold star -->
    <path d="${STAR}" fill="${goldFill}" stroke="${ink}" stroke-width="1.6" stroke-linejoin="round"/>
  </g>
</svg>
`;
}
