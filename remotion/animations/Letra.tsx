import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { AnimationProps } from "../BeatScene";

/**
 * V56: Letra por letra — estilo Canva. Cada caractere entra
 * individualmente com fade + leve subida + scale. Rítmo dramático,
 * marcante. Diferente de "teclado" que mostra char por char sem
 * animação visual — aqui cada letra TEM sua animação spring.
 */
export const Letra: React.FC<AnimationProps> = ({
  lines,
  lineSegments,
  style,
  entryDuration = 18,
  exitDuration = 14,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const exitStart = durationInFrames - exitDuration;
  const charDelay = 1.2; // frames entre caracteres (rápido)

  // Conta total de chars de TODAS as linhas pra delay acumulado
  let cumulativeCharIdx = 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      {lines.map((line, lineIdx) => {
        const segs = lineSegments?.[lineIdx];
        // Mapeia char → cor
        const charColors = mapCharColors(line, segs);
        const elements = Array.from(line).map((char, charIdx) => {
          const totalDelay = cumulativeCharIdx * charDelay;
          cumulativeCharIdx++;
          if (char === " ") {
            return (
              <span key={charIdx} style={{ display: "inline-block", width: "0.3em" }}>
                {" "}
              </span>
            );
          }
          const progress = spring({
            frame: frame - totalDelay,
            fps,
            durationInFrames: entryDuration,
            config: { damping: 14, mass: 0.5 },
          });
          const exit = interpolate(frame, [exitStart, durationInFrames], [1, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          const translateY = interpolate(progress, [0, 1], [30, 0]);
          const scale = interpolate(progress, [0, 1], [0.7, 1]);
          const opacity = Math.min(progress, exit);
          return (
            <span
              key={charIdx}
              style={{
                display: "inline-block",
                transform: `translateY(${translateY}px) scale(${scale})`,
                opacity,
                color: charColors[charIdx] ?? (style.color as string | undefined),
              }}
            >
              {char}
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

function mapCharColors(
  line: string,
  segs?: { text: string; color?: string }[],
): Array<string | undefined> {
  if (!segs || segs.length === 0) return Array.from(line).map(() => undefined);
  const colors: Array<string | undefined> = [];
  let segIdx = 0;
  let consumedInSeg = 0;
  for (let i = 0; i < line.length; i++) {
    if (segIdx >= segs.length) {
      colors.push(undefined);
      continue;
    }
    colors.push(segs[segIdx]!.color);
    consumedInSeg++;
    if (consumedInSeg >= segs[segIdx]!.text.length) {
      segIdx++;
      consumedInSeg = 0;
    }
  }
  return colors;
}
