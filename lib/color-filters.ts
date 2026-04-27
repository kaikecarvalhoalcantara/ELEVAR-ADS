import type { ColorFilter } from "./types";

/**
 * CSS `filter` strings que dão aspecto de LUT/color grading sobre os vídeos.
 * Aplicado em TODOS os vídeos do anúncio pra manter coerência visual,
 * estilo o user pediu ("vermelho escuro", "verde escuro", etc).
 */
export const COLOR_FILTER_CSS: Record<ColorFilter, string> = {
  neutro: "",
  vermelho:
    "saturate(1.35) sepia(0.4) hue-rotate(-25deg) brightness(0.92) contrast(1.05)",
  verde: "hue-rotate(55deg) saturate(0.85) brightness(0.92) contrast(1.05)",
  preto: "brightness(0.55) contrast(1.45) saturate(0.55)",
  dourado: "sepia(0.55) saturate(1.35) hue-rotate(-15deg) brightness(0.95)",
  azul: "hue-rotate(195deg) saturate(0.85) brightness(0.82) contrast(1.1)",
};

export const COLOR_FILTER_LABELS: Record<ColorFilter, string> = {
  neutro: "Sem filtro",
  vermelho: "Vermelho escuro",
  verde: "Verde escuro",
  preto: "Preto / desaturado",
  dourado: "Dourado / âmbar",
  azul: "Azul noite",
};

export function colorFilterCss(cf: ColorFilter | undefined | null): string {
  if (!cf) return "";
  return COLOR_FILTER_CSS[cf] ?? "";
}
