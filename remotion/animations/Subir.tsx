import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { AnimationProps } from "../BeatScene";

/**
 * Subir — palavra/linha por palavra/linha estilo Canva. translateY do
 * fundo (60) → 0 com fade. V61: respeita direction (ambos/entrando/saindo),
 * splitStyle (palavra/linha) e flipExit (inverte direção da saída).
 */
export const Subir: React.FC<AnimationProps> = ({
  lines,
  lineSegments,
  style,
  entryDuration = 48,
  exitDuration = 48,
  direction = "ambos",
  splitStyle = "palavra",
  flipExit = false,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const exitStart = durationInFrames - exitDuration;
  const wordDelay = 6;
  const lineGap = 8;

  // V61: helper que calcula opacity + translateY pra um item individual
  function compute(itemDelay: number): { opacity: number; translateY: number } {
    // Entry progress (0 → 1 conforme vai entrando)
    const entryProgress =
      direction === "saindo"
        ? 1 // saindo: começa visível direto
        : spring({
            frame: frame - itemDelay,
            fps,
            durationInFrames: entryDuration,
            config: { damping: 18, mass: 0.6 },
          });

    // Exit progress (1 → 0 conforme vai saindo)
    const exitProgress =
      direction === "entrando"
        ? 1 // entrando: nunca sai (fica até o fim)
        : interpolate(frame, [exitStart, durationInFrames], [1, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });

    // translateY base: entrada de baixo pra cima
    const tyEntry = interpolate(entryProgress, [0, 1], [60, 0]);
    // translateY exit: dependendo do flipExit, sai pra cima (-60) ou pra baixo (+60)
    const tyExit = interpolate(
      exitProgress,
      [0, 1],
      [flipExit ? 60 : -60, 0],
    );
    // Combina: durante exit (frame >= exitStart), aplica tyExit; senão tyEntry
    const inExit = direction !== "entrando" && frame >= exitStart;
    const translateY = inExit ? tyExit : tyEntry;
    const opacity = Math.min(entryProgress, exitProgress);
    return { opacity, translateY };
  }

  // V61: Modo LINHA — anima a linha inteira
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

  // Modo PALAVRA (default) — palavra por palavra
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
