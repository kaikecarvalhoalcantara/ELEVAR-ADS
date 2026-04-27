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
export function buildTextShadow(opts: {
  shadowBlur: number;
  shadowOpacity: number;
  scale?: number; // pra ajustar stroke em previews menores
}): string {
  const scale = opts.scale ?? 1;
  const offsetY = Math.max(2, Math.round(opts.shadowBlur / 5));
  const sw = 1.5 * scale; // stroke width
  const sw2 = 1 * scale;
  const stroke = [
    `-${sw}px 0 0 rgba(0,0,0,0.92)`,
    `${sw}px 0 0 rgba(0,0,0,0.92)`,
    `0 -${sw}px 0 rgba(0,0,0,0.92)`,
    `0 ${sw}px 0 rgba(0,0,0,0.92)`,
    `-${sw2}px -${sw2}px 0 rgba(0,0,0,0.85)`,
    `${sw2}px -${sw2}px 0 rgba(0,0,0,0.85)`,
    `-${sw2}px ${sw2}px 0 rgba(0,0,0,0.85)`,
    `${sw2}px ${sw2}px 0 rgba(0,0,0,0.85)`,
  ].join(", ");
  const drop = `0 ${offsetY * scale}px ${opts.shadowBlur * scale}px rgba(0,0,0,${opts.shadowOpacity})`;
  return `${stroke}, ${drop}`;
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
