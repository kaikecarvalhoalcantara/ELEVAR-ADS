import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { AnimationProps } from "../BeatScene";

/**
 * Deslocar — estilo Canva: linhas alternadas vindo de lados opostos.
 * Linha 1 da esquerda (-80), linha 2 da direita (+80), linha 3 esquerda...
 * V61: respeita direction + flipExit. splitStyle não se aplica (é por linha
 * por design).
 */
export const Deslocar: React.FC<AnimationProps> = ({
  lines,
  lineSegments,
  style,
  entryDuration = 48,
  exitDuration = 48,
  direction = "ambos",
  flipExit = false,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const exitStart = durationInFrames - exitDuration;
  const lineDelay = 7;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      {lines.map((line, lineIdx) => {
        const totalDelay = lineIdx * lineDelay;
        const entryProgress =
          direction === "saindo"
            ? 1
            : spring({
                frame: frame - totalDelay,
                fps,
                durationInFrames: entryDuration,
                config: { damping: 18, mass: 0.7 },
              });
        const exitProgress =
          direction === "entrando"
            ? 1
            : interpolate(frame, [exitStart, durationInFrames], [1, 0], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              });
        // Linhas pares vêm da esquerda (-1), ímpares da direita (+1)
        const dirEntry = lineIdx % 2 === 0 ? -1 : 1;
        // Saída: por default mesma direção. flipExit inverte.
        const dirExit = flipExit ? -dirEntry : dirEntry;
        const txEntry = interpolate(entryProgress, [0, 1], [dirEntry * 80, 0]);
        const txExit = interpolate(exitProgress, [0, 1], [dirExit * 80, 0]);
        const inExit = direction !== "entrando" && frame >= exitStart;
        const translateX = inExit ? txExit : txEntry;
        const opacity = Math.min(entryProgress, exitProgress);

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
