import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { AnimationProps } from "../BeatScene";

/**
 * Subir — palavra por palavra (estilo Canva). Cada palavra sobe de baixo
 * pra cima com fade, com stagger entre elas. Linhas têm pequeno gap extra.
 */
export const Subir: React.FC<AnimationProps> = ({
  lines,
  lineSegments,
  style,
  entryDuration = 14,
  exitDuration = 14,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const exitStart = durationInFrames - exitDuration;
  const wordDelay = 3; // frames entre palavras
  const lineGap = 4; // frames extra entre linhas

  // Soma de palavras já processadas pra calcular delay acumulado
  let cumulativeWordIdx = 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      {lines.map((line, lineIdx) => {
        const words = line.split(" ").filter(Boolean);
        const segs = lineSegments?.[lineIdx];
        // Mapeia palavras pras suas cores se houver segments
        const wordColors = mapWordColors(words, segs);
        const elements = words.map((word, wordIdx) => {
          const totalDelay = cumulativeWordIdx + lineIdx * lineGap;
          cumulativeWordIdx += wordDelay;
          const progress = spring({
            frame: frame - totalDelay,
            fps,
            durationInFrames: entryDuration,
            config: { damping: 18, mass: 0.6 },
          });
          const exit = interpolate(frame, [exitStart, durationInFrames], [1, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          const translateY = interpolate(progress, [0, 1], [60, 0]);
          const opacity = Math.min(progress, exit);
          return (
            <span
              key={wordIdx}
              style={{
                display: "inline-block",
                transform: `translateY(${translateY}px)`,
                opacity,
                color: wordColors[wordIdx] ?? (style.color as string | undefined),
                marginRight: wordIdx < words.length - 1 ? "0.3em" : 0,
              }}
            >
              {word}
            </span>
          );
        });
        return (
          <div
            key={lineIdx}
            style={{
              ...style,
              // Override pra permitir spans inline
              whiteSpace: "normal",
              padding: 0,
            }}
          >
            {elements}
          </div>
        );
      })}
    </div>
  );
};

/**
 * Mapeia segments (formato lib/types) → cor por palavra. Se não tem
 * segments, retorna array vazio (cada palavra usa cor padrão).
 */
function mapWordColors(
  words: string[],
  segs?: { text: string; color?: string }[],
): Array<string | undefined> {
  if (!segs || segs.length === 0) return words.map(() => undefined);
  // Concatena segments e divide por palavra preservando cor de cada segmento
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
    consumedInSeg += words[i]!.length + 1; // +1 pelo espaço
    if (consumedInSeg >= seg.text.length) {
      segIdx++;
      consumedInSeg = 0;
    }
  }
  return colors;
}
