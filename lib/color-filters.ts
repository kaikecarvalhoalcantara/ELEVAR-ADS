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

// ============================================================
// V17: Color grading per-page — sliders estilo Canva
// ============================================================

export interface VideoGradingAdjustments {
  videoBrightness?: number;
  videoContrast?: number;
  videoSaturation?: number;
  videoHue?: number;
  videoTemperature?: number;
  videoVibrance?: number;
  videoHighlights?: number;
  videoShadows?: number;
  videoWhites?: number;
  videoBlacks?: number;
}

/**
 * Constrói uma CSS `filter` string a partir dos 10 ajustes do Canva.
 * Defaults = neutro (100 ou 0 dependendo do tipo). Vazio se nenhum
 * ajuste foi feito — pra não impactar render quando user não usou.
 *
 * Mapeamento aproximado:
 * - brightness/contrast/saturation/hue → CSS filter direto
 * - temperature → hue-rotate sutil + sepia (warm) ou hue-rotate negativo (cool)
 * - vibrance → ajuste extra de saturate (afeta menos cores já saturadas
 *   é difícil em CSS, então aplicamos uma fração da saturação)
 * - highlights/shadows/whites/blacks → contrast + brightness em
 *   combinações pra simular cada tonalidade
 */
export function buildVideoGradingFilter(adj: VideoGradingAdjustments): string {
  const parts: string[] = [];
  // Defaults neutros
  let brightness = (adj.videoBrightness ?? 100) / 100; // 0.5 a 1.5
  let contrast = (adj.videoContrast ?? 100) / 100; // 0.5 a 1.5
  let saturate = (adj.videoSaturation ?? 100) / 100; // 0 a 2

  // Vibrance: amplifica saturação (mas menos que slider direto)
  const vibrance = adj.videoVibrance ?? 0; // -100..100
  if (vibrance !== 0) {
    saturate += (vibrance / 200); // -0.5 a 0.5 — boost sutil
    saturate = Math.max(0, saturate);
  }

  // Highlights: clareia tons claros — usamos brightness extra com contrast inverso
  const highlights = adj.videoHighlights ?? 0; // -100..100
  if (highlights !== 0) {
    brightness += (highlights / 400); // -0.25 a 0.25
    contrast -= (highlights / 800); // ajuste sutil pra suavizar
  }

  // Shadows: clareia tons escuros — brightness + reduz contrast nos pretos
  const shadows = adj.videoShadows ?? 0;
  if (shadows !== 0) {
    brightness += (shadows / 600);
    contrast -= (shadows / 400); // shadows positivos abrem sombras (menos contraste)
  }

  // Whites: ajuste extremo no branco — só contrast
  const whites = adj.videoWhites ?? 0;
  if (whites !== 0) {
    contrast += (whites / 300);
  }

  // Blacks: ajuste extremo no preto — contrast inverso
  const blacks = adj.videoBlacks ?? 0;
  if (blacks !== 0) {
    contrast -= (blacks / 300);
    brightness -= (blacks / 600);
  }

  // Aplica brightness/contrast/saturation se diferente do neutro
  if (Math.abs(brightness - 1) > 0.001) {
    parts.push(`brightness(${brightness.toFixed(3)})`);
  }
  if (Math.abs(contrast - 1) > 0.001) {
    parts.push(`contrast(${contrast.toFixed(3)})`);
  }
  if (Math.abs(saturate - 1) > 0.001) {
    parts.push(`saturate(${saturate.toFixed(3)})`);
  }

  // Hue rotate
  const hue = adj.videoHue ?? 0;
  if (hue !== 0) parts.push(`hue-rotate(${hue}deg)`);

  // Temperature: positiva = warm (sepia + leve hue), negativa = cool (hue azul)
  const temp = adj.videoTemperature ?? 0;
  if (temp !== 0) {
    if (temp > 0) {
      // Warm: leve sepia
      parts.push(`sepia(${(temp / 200).toFixed(3)})`);
    } else {
      // Cool: hue-rotate azulado (negative já cobre, mas adicionamos um leve)
      parts.push(`hue-rotate(${Math.round(temp / 4)}deg)`);
    }
  }

  return parts.join(" ");
}

/**
 * Combina o filtro LUT global do projeto com os ajustes per-page.
 * Ordem: LUT → ajustes per-page (ajustes no topo "ajustam" o LUT).
 */
export function combinedVideoFilter(
  cf: ColorFilter | undefined | null,
  adj: VideoGradingAdjustments,
): string {
  const lut = colorFilterCss(cf);
  const grading = buildVideoGradingFilter(adj);
  return [lut, grading].filter(Boolean).join(" ");
}
