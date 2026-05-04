import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { AnimationProps } from "../BeatScene";

/**
 * Cair — palavra/linha cai de cima. translateY -60 → 0. V61 controles.
 */
export const Cair: React.FC<AnimationProps> = ({
  lines,
  lineSegments,
  style,
  entryDuration = 14,
  exitDuration = 14,
  direction = "ambos",
  splitStyle = "palavra",
  flipExit = false,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const exitStart = durationInFrames - exitDuration;
  const wordDelay = 6;
  const lineGap = 8;

  function compute(itemDelay: number): { opacity: number; translateY: number } {
    const entryProgress =
      direction === "saindo"
        ? 1
        : spring({
            frame: frame - itemDelay,
            fps,
            durationInFrames: entryDuration,
            config: { damping: 18, mass: 0.6 },
          });
    const exitProgress =
      direction === "entrando"
        ? 1
        : interpolate(frame, [exitStart, durationInFrames], [1, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
    // Cair: começa em -60 (cima)
    const tyEntry = interpolate(entryProgress, [0, 1], [-60, 0]);
    // Exit: padrão sai pra baixo (+60); flipExit inverte (sobe -60)
    const tyExit = interpolate(exitProgress, [0, 1], [flipExit ? -60 : 60, 0]);
    const inExit = direction !== "entrando" && frame >= exitStart;
    const translateY = inExit ? tyExit : tyEntry;
    const opacity = Math.min(entryProgress, exitProgress);
    return { opacity, translateY };
  }

  if (splitStyle === "linha") {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        {lines.map((line, lineIdx) => {
          const { opacity, translateY } = compute(lineIdx * lineGap);
          return (
            <div
              key={lineIdx}
              style={{
                ...style,
                transform: `translateY(${translateY}px)`,
                opacity,
              }}
            >
              {line}
            </div>
          );
        })}
      </div>
    );
  }

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
          const { opacity, translateY } = compute(totalDelay);
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
