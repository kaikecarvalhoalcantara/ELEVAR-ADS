import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { AnimationProps } from "../BeatScene";

/**
 * V60: Deslocar — estilo Canva. Cada LINHA inteira entra de uma direção
 * ALTERNADA: linha 1 vem da esquerda, linha 2 vem da direita, linha 3
 * da esquerda... Quem mostrou ao user no Canva foi exatamente isso —
 * "uma frase de cima do lado esquerdo, a debaixo da direita".
 *
 * Antes era palavra por palavra todas vindas da esquerda — não era o
 * efeito Canva real.
 */
export const Deslocar: React.FC<AnimationProps> = ({
  lines,
  lineSegments,
  style,
  entryDuration = 18,
  exitDuration = 14,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const exitStart = durationInFrames - exitDuration;
  const lineDelay = 7; // frames entre linhas (stagger marcante)

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      {lines.map((line, lineIdx) => {
        const totalDelay = lineIdx * lineDelay;
        const progress = spring({
          frame: frame - totalDelay,
          fps,
          durationInFrames: entryDuration,
          config: { damping: 18, mass: 0.7 },
        });
        const exit = interpolate(frame, [exitStart, durationInFrames], [1, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        // V60: linhas pares (0, 2, 4...) vêm da ESQUERDA; ímpares (1, 3...) da DIREITA
        const direction = lineIdx % 2 === 0 ? -1 : 1;
        const translateX = interpolate(progress, [0, 1], [direction * 80, 0]);
        const opacity = Math.min(progress, exit);

        const segs = lineSegments?.[lineIdx];
        const words = line.split(" ").filter(Boolean);
        const wordColors = mapWordColors(words, segs);

        return (
          <div
            key={lineIdx}
            style={{
              ...style,
              transform: `translateX(${translateX}px)`,
              opacity,
              whiteSpace: "normal",
              padding: 0,
            }}
          >
            {words.map((word, wordIdx) => (
              <span
                key={wordIdx}
                style={{
                  display: "inline-block",
                  color: wordColors[wordIdx] ?? (style.color as string | undefined),
                  marginRight: wordIdx < words.length - 1 ? "0.3em" : 0,
                }}
              >
                {word}
              </span>
            ))}
          </div>
        );
      })}
    </div>
  );
};

function mapWordColors(
  words: string[],
  segs?: { text: string; color?: string }[],
): Array<string | undefined> {
  if (!segs || segs.length === 0) return words.map(() => undefined);
  const colors: Array<string | undefined> = [];
  let segIdx = 0;
  let consumedInSeg = 0;
  for (let i = 0; i < words.length; i++) {
    if (segIdx >= segs.length) {
      colors.push(undefined);
      continue;
    }
    const seg = segs[segIdx]!;
    colors.push(seg.color);
    consumedInSeg += words[i]!.length + 1;
    if (consumedInSeg >= seg.text.length) {
      segIdx++;
      consumedInSeg = 0;
    }
  }
  return colors;
}
