import type { IconName } from "./types";

/**
 * Icon set curado pra anúncios cinematográficos. Cada ícone é uma string SVG
 * com viewBox 24x24 e currentColor pra herdar a cor do contexto.
 *
 * Mantemos inline (sem dep externa) pra render funcionar idêntico no editor
 * e no Remotion (sem fetch externo).
 */
export const ICON_SVGS: Record<IconName, string> = {
  "arrow-down": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12l7 7 7-7"/></svg>`,
  "arrow-up": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>`,
  "arrow-right": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>`,
  star: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`,
  play: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`,
  check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l5 5 9-12"/></svg>`,
  x: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6l12 12M18 6L6 18"/></svg>`,
  fire: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2s4 4.5 4 9c0 2.21-1.79 4-4 4s-4-1.79-4-4c0-1.5.5-3 1-4-1 1-3 3-3 6 0 3.31 2.69 6 6 6s6-2.69 6-6c0-5-6-11-6-11z"/></svg>`,
  diamond: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L2 9l10 13L22 9 12 2z"/></svg>`,
  circle: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="9"/></svg>`,
  triangle: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3l10 18H2L12 3z"/></svg>`,
  line: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M4 12h16"/></svg>`,
  quote: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 7h4v4H9c0 2 1 3 3 3v2c-3 0-5-2-5-5V7zm10 0h4v4h-2c0 2 1 3 3 3v2c-3 0-5-2-5-5V7z"/></svg>`,
  alert: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>`,
};

export const ICON_LIST: IconName[] = Object.keys(ICON_SVGS) as IconName[];

export function iconSvgString(name: IconName | undefined | null): string | null {
  if (!name) return null;
  return ICON_SVGS[name] ?? null;
}
