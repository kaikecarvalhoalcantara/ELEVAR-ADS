import type { ProjectStyle, ToneFilter, Vibe } from "./types";

/**
 * Default styling presets per ToneFilter — MUITO MAIS DISCRETOS que antes
 * (sombras estavam dando aspecto de "neon/glow"). Agora o texto fica limpo,
 * com sombra apenas pra legibilidade sobre o vídeo, não como efeito.
 */
const TONE_DEFAULTS: Record<ToneFilter, Partial<ProjectStyle>> = {
  neutro: {
    baseColor: "#ffffff",
    accentColor: "#d4af37",
    baseShadowBlur: 14,
    baseShadowOpacity: 0.5,
    baseOverlayOpacity: 0.4,
  },
  escuro: {
    baseColor: "#ffffff",
    accentColor: "#c8a04c",
    baseShadowBlur: 18,
    baseShadowOpacity: 0.55,
    baseOverlayOpacity: 0.55,
  },
  suave: {
    baseColor: "#fafafa",
    accentColor: "#a78bfa",
    baseShadowBlur: 8,
    baseShadowOpacity: 0.3,
    baseOverlayOpacity: 0.22,
  },
  infantil: {
    baseColor: "#fff7ad",
    accentColor: "#ff7eb6",
    baseShadowBlur: 6,
    baseShadowOpacity: 0.25,
    baseOverlayOpacity: 0.18,
  },
  vintage: {
    baseColor: "#f5e9c8",
    accentColor: "#c08552",
    baseShadowBlur: 12,
    baseShadowOpacity: 0.4,
    baseOverlayOpacity: 0.35,
  },
  premium: {
    baseColor: "#ffffff",
    accentColor: "#cba135",
    baseShadowBlur: 16,
    baseShadowOpacity: 0.5,
    baseOverlayOpacity: 0.5,
  },
};

const VIBE_LETTER_SPACING: Record<Vibe, number> = {
  cinematografico: -0.005,
  documental: 0,
  glamour: 0.015,
  tenso: -0.01,
  calmo: 0.01,
  elegante: 0.02,
};

export function defaultProjectStyle(args: {
  toneFilter: ToneFilter;
  vibe: Vibe;
}): ProjectStyle {
  const tone = TONE_DEFAULTS[args.toneFilter];
  return {
    toneFilter: args.toneFilter,
    vibe: args.vibe,
    baseColor: tone.baseColor ?? "#ffffff",
    accentColor: tone.accentColor ?? "#d4af37",
    baseFontSize: 0, // 0 = auto compute
    baseLetterSpacing: VIBE_LETTER_SPACING[args.vibe] ?? 0,
    baseLineHeight: 1.05,
    baseShadowBlur: tone.baseShadowBlur ?? 14,
    baseShadowOpacity: tone.baseShadowOpacity ?? 0.45,
    baseOverlayOpacity: tone.baseOverlayOpacity ?? 0.4,
    baseAlign: "center",
    colorFilter: "neutro",
  };
}

export interface ResolvedPageStyle {
  fontSize: number;
  color: string;
  letterSpacing: number;
  lineHeight: number;
  textShadowBlur: number;
  textShadowOpacity: number;
  overlayOpacity: number;
  align: "left" | "center" | "right";
}

export function resolvePageStyle(
  page: { [k: string]: unknown },
  project: ProjectStyle,
): ResolvedPageStyle {
  return {
    fontSize: numericField(page.fontSize, project.baseFontSize),
    color: stringField(page.color, project.baseColor),
    letterSpacing: numericField(page.letterSpacing, project.baseLetterSpacing),
    lineHeight: numericField(page.lineHeight, project.baseLineHeight),
    textShadowBlur: numericField(page.textShadowBlur, project.baseShadowBlur),
    textShadowOpacity: numericField(page.textShadowOpacity, project.baseShadowOpacity),
    overlayOpacity: numericField(page.overlayOpacity, project.baseOverlayOpacity),
    align: (page.align as ResolvedPageStyle["align"]) ?? project.baseAlign,
  };
}

function numericField(v: unknown, fallback: number): number {
  return typeof v === "number" && !Number.isNaN(v) ? v : fallback;
}
function stringField(v: unknown, fallback: string): string {
  return typeof v === "string" && v ? v : fallback;
}
