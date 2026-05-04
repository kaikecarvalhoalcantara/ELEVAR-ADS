import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { AnimationProps } from "../BeatScene";
import { LineContent } from "./LineRenderer";

/**
 * V56: Linha por linha — estilo Canva. Cada LINHA inteira entra de uma
 * vez (não palavra por palavra), com slide-up + fade + leve scale.
 * Stagger de 8 frames entre linhas. Visual mais "clean" que palavra
 * por palavra, mais legível pra slides com texto longo.
 */
export const Linha: React.FC<AnimationProps> = ({
  lines,
  lineSegments,
  style,
  entryDuration = 18,
  exitDuration = 14,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const exitStart = durationInFrames - exitDuration;
  const lineDelay = 8; // frames entre linhas (stagger marcante)

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      {lines.map((line, lineIdx) => {
        const totalDelay = lineIdx * lineDelay;
        const progress = spring({
          frame: frame - totalDelay,
          fps,
          durationInFrames: entryDuration,
          config: { damping: 16, mass: 0.7 },
        });
        const exit = interpolate(frame, [exitStart, durationInFrames], [1, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        const translateY = interpolate(progress, [0, 1], [50, 0]);
        const scale = interpolate(progress, [0, 1], [0.92, 1]);
        const opacity = Math.min(progress, exit);
        return (
          <div
            key={lineIdx}
            style={{
              ...style,
              transform: `translateY(${translateY}px) scale(${scale})`,
              opacity,
            }}
          >
            <LineContent
              text={line}
              segments={lineSegments?.[lineIdx]}
              defaultColor={style.color as string | undefined}
            />
          </div>
        );
      })}
    </div>
  );
};
