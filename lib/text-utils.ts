/**
 * Encontra o ponto de divisão das palavras que minimiza a diferença de
 * char-count entre os dois lados — gera linhas com largura visual parecida
 * (estilo "AO TOCAR EM / SAIBA MAIS" onde os 2 lados têm tamanho similar).
 */
function balanceSplit(words: string[]): [string, string] {
  if (words.length < 2) return [words.join(" "), ""];
  let bestSplit = Math.ceil(words.length / 2);
  let bestDelta = Infinity;
  for (let i = 1; i < words.length; i++) {
    const leftChars = words.slice(0, i).join(" ").length;
    const rightChars = words.slice(i).join(" ").length;
    const delta = Math.abs(leftChars - rightChars);
    if (delta < bestDelta) {
      bestDelta = delta;
      bestSplit = i;
    }
  }
  return [
    words.slice(0, bestSplit).join(" "),
    words.slice(bestSplit).join(" "),
  ];
}

/**
 * Normaliza o texto de uma página: trata \n, força máximo 2 linhas, e
 * auto-divide em " / " (com balanço por char-count) quando uma linha
 * tem 4+ palavras. Linhas balanceadas têm largura visual parecida.
 */
export function normalizePageText(raw: string): string {
  const cleaned = raw.replace(/\r\n?/g, "\n").replace(/\n+/g, " / ").trim();
  let parts = cleaned
    .split(" / ")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 2);

  // Se tem só 1 linha e ela tem 4+ palavras, divide com balanço por char-count
  if (parts.length === 1) {
    const words = parts[0]!.split(/\s+/).filter(Boolean);
    if (words.length >= 4) {
      const [a, b] = balanceSplit(words);
      parts = [a, b];
    }
  }

  // Se as 2 linhas estão desbalanceadas, redistribui usando balanceSplit
  if (parts.length === 2) {
    const [a, b] = parts as [string, string];
    const lenA = a.length;
    const lenB = b.length;
    const ratio = Math.max(lenA, lenB) / Math.max(1, Math.min(lenA, lenB));
    if (ratio > 2) {
      // Muito desbalanceado, recombina e divide melhor
      const allWords = [...a.split(/\s+/), ...b.split(/\s+/)].filter(Boolean);
      if (allWords.length >= 2) {
        const [na, nb] = balanceSplit(allWords);
        parts = [na, nb];
      }
    }
  }

  return parts.filter(Boolean).join(" / ");
}

/**
 * Constrói o CSS textShadow estilo "punch sticker": outline preto duro
 * (multi-layer stroke) + drop shadow soft controlado pelos parâmetros.
 *
 * O stroke duro elimina o aspecto "neon glow" que aparece quando você usa
 * apenas um shadow soft sobre texto branco — agora o texto fica recortado
 * sobre o vídeo igual letterring de pôster.
 */
/**
 * Converte hex (#rrggbb) pra "r,g,b" — usado em rgba(...).
 * Aceita "#fff" também. Fallback "0,0,0" se hex inválido.
 */
function hexToRgb(hex: string | undefined | null): string {
  if (!hex) return "0,0,0";
  let h = hex.replace("#", "").trim();
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (h.length !== 6) return "0,0,0";
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return "0,0,0";
  return `${r},${g},${b}`;
}

export function buildTextShadow(opts: {
  shadowBlur: number;
  shadowOpacity: number;
  scale?: number; // pra ajustar stroke em previews menores
  // V12: cor da sombra + cor/largura do outline (todos com defaults
  // iguais ao comportamento legado pra não quebrar drafts antigos).
  shadowColor?: string;   // hex, default "#000000"
  strokeColor?: string;   // hex, default "#000000"
  strokeWidth?: number;   // multiplier 0..3, default 1 (= comportamento original 1.5px)
}): string {
  const scale = opts.scale ?? 1;
  const offsetY = Math.max(2, Math.round(opts.shadowBlur / 5));
  const widthMul = opts.strokeWidth ?? 1;
  const sw = 1.5 * scale * widthMul;
  const sw2 = 1 * scale * widthMul;
  const strokeRgb = hexToRgb(opts.strokeColor ?? "#000000");
  const shadowRgb = hexToRgb(opts.shadowColor ?? "#000000");

  const strokeParts =
    widthMul > 0
      ? [
          `-${sw}px 0 0 rgba(${strokeRgb},0.92)`,
          `${sw}px 0 0 rgba(${strokeRgb},0.92)`,
          `0 -${sw}px 0 rgba(${strokeRgb},0.92)`,
          `0 ${sw}px 0 rgba(${strokeRgb},0.92)`,
          `-${sw2}px -${sw2}px 0 rgba(${strokeRgb},0.85)`,
          `${sw2}px -${sw2}px 0 rgba(${strokeRgb},0.85)`,
          `-${sw2}px ${sw2}px 0 rgba(${strokeRgb},0.85)`,
          `${sw2}px ${sw2}px 0 rgba(${strokeRgb},0.85)`,
        ]
      : [];
  const drop = `0 ${offsetY * scale}px ${opts.shadowBlur * scale}px rgba(${shadowRgb},${opts.shadowOpacity})`;
  return strokeParts.length > 0 ? `${strokeParts.join(", ")}, ${drop}` : drop;
}

// ============================================================
// V21: Letter effects — presets estilo Canva
// ============================================================

export type LetterEffect =
  | "none"
  | "projetada"
  | "brilhante"
  | "eco"
  | "contorno"
  | "fundo"
  | "desalinhado"
  | "vazado"
  | "neon"
  | "falha";

export interface LetterEffectStyle {
  textShadow?: string;
  color?: string;
  WebkitTextStroke?: string;
  WebkitTextFillColor?: string;
  background?: string;
  padding?: string;
  /** se true, desabilita o textShadow base do user (efeito tem o seu próprio) */
  overrideShadow?: boolean;
}

/**
 * Constrói as propriedades CSS pra um efeito de letra escolhido.
 * Intensidade 0..100 controla força. Cor opcional pra customizar o efeito.
 */
export function buildLetterEffect(
  effect: LetterEffect | undefined,
  intensity: number = 50,
  color: string = "#ffd700",
  baseColor: string = "#ffffff",
): LetterEffectStyle {
  if (!effect || effect === "none") return {};
  const i = Math.max(0, Math.min(100, intensity)) / 100; // 0..1

  switch (effect) {
    case "projetada":
      // Sombra projetada com offset diagonal
      return {
        textShadow: `${6 * i}px ${6 * i}px ${10 * i}px rgba(0,0,0,0.65)`,
        overrideShadow: true,
      };
    case "brilhante":
      // Glow dourado em camadas
      return {
        textShadow: [
          `0 0 ${10 * i}px ${color}`,
          `0 0 ${22 * i}px ${color}`,
          `0 0 ${44 * i}px ${color}aa`,
          `0 0 2px rgba(0,0,0,0.7)`,
        ].join(", "),
        overrideShadow: true,
      };
    case "eco":
      // Ghost shadows laterais com transparência decrescente
      return {
        textShadow: [
          `${8 * i}px 0 0 ${color}cc`,
          `${16 * i}px 0 0 ${color}88`,
          `${24 * i}px 0 0 ${color}44`,
        ].join(", "),
        overrideShadow: true,
      };
    case "contorno":
      // Só contorno — texto vazado preenchido com cor
      return {
        color: "transparent",
        WebkitTextFillColor: "transparent",
        WebkitTextStroke: `${1 + 2 * i}px ${baseColor}`,
        overrideShadow: true,
      };
    case "fundo":
      // Faixa colorida atrás (highlight)
      return {
        background: color,
        padding: `0 ${0.15 + 0.1 * i}em`,
        overrideShadow: true,
      };
    case "desalinhado":
      // Chromatic aberration sutil
      return {
        textShadow: [
          `-${2 * i}px 0 0 #ff0040`,
          `${2 * i}px 0 0 #00d4ff`,
          `0 ${1 * i}px 2px rgba(0,0,0,0.5)`,
        ].join(", "),
        overrideShadow: true,
      };
    case "vazado":
      // Hollow — só linha fina ao redor das letras
      return {
        color: "transparent",
        WebkitTextFillColor: "transparent",
        WebkitTextStroke: `${0.5 + 1.2 * i}px ${baseColor}`,
        textShadow: `0 0 ${4 * i}px rgba(0,0,0,0.3)`,
        overrideShadow: true,
      };
    case "neon":
      // Glow MUITO forte multicor estilo letreiro
      return {
        textShadow: [
          `0 0 4px white`,
          `0 0 ${8 * i}px white`,
          `0 0 ${20 * i}px ${color}`,
          `0 0 ${40 * i}px ${color}`,
          `0 0 ${60 * i}px ${color}aa`,
        ].join(", "),
        overrideShadow: true,
      };
    case "falha":
      // Glitch forte — RGB split + offsets múltiplos
      return {
        textShadow: [
          `${3 * i}px 0 0 #ff0040`,
          `-${3 * i}px 0 0 #00d4ff`,
          `${5 * i}px ${2 * i}px 0 #ff0040aa`,
          `-${5 * i}px -${2 * i}px 0 #00d4ffaa`,
        ].join(", "),
        overrideShadow: true,
      };
    default:
      return {};
  }
}

/**
 * Computa font-size que CABE em 2 linhas visuais sem quebra extra.
 * Considera tanto o targetMax estético quanto o limite imposto pelo
 * número de caracteres da linha mais longa.
 *
 * @param lines — array de até 2 linhas (já após normalizePageText)
 * @param isHook — true pra hook/punch (uppercase bold), false pra transition
 * @param canvasWidth — largura do canvas (1080 = base)
 */
export function computeFitFontSize(
  lines: string[],
  isHook: boolean,
  canvasWidth: number,
): number {
  const longest = Math.max(...lines.map((l) => l.length), 1);
  // ratio aproximado de largura por char em em-units
  // bold uppercase tipicamente ~0.6em por char, regular ~0.5em
  const charWidthRatio = isHook ? 0.58 : 0.52;
  const horizontalPadding = 0.12; // 6% cada lado = 12% total
  const availableWidth = canvasWidth * (1 - horizontalPadding);
  // Maior fonte que cabe a linha mais longa em 1 linha visual
  const maxByLength = availableWidth / (longest * charWidthRatio);

  const scale = canvasWidth / 1080;
  const targetMax = (isHook ? 130 : 100) * scale;
  const targetMin = (isHook ? 70 : 58) * scale;

  // Usa o menor entre o limite estético e o limite por comprimento
  const size = Math.min(targetMax, maxByLength);
  return Math.round(Math.max(targetMin, size));
}
