import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { AnimationProps } from "../BeatScene";

/**
 * Deslocar — palavra por palavra vinda da esquerda (estilo Canva). Cada
 * palavra entra com slide horizontal + fade. Stagger entre palavras.
 */
export const Deslocar: React.FC<AnimationProps> = ({
  lines,
  lineSegments,
  style,
  entryDuration = 14,
  exitDuration = 14,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const exitStart = durationInFrames - exitDuration;
  const wordDelay = 3;
  const lineGap = 4;

  let cumulativeWordIdx = 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      {lines.map((line, lineIdx) => {
        const words = line.split(" ").filter(Boolean);
        const segs = lineSegments?.[lineIdx];
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
          const translateX = interpolate(progress, [0, 1], [-50, 0]);
          const opacity = Math.min(progress, exit);
          return (
            <span
              key={wordIdx}
              style={{
                display: "inline-block",
                transform: `translateX(${translateX}px)`,
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
