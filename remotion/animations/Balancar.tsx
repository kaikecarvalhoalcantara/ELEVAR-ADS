import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { AnimationProps } from "../BeatScene";
import { LineContent } from "./LineRenderer";

/**
 * Balançar — entrada com bounce forte (overshoot) que se acomoda.
 * Vibe energética / festa / chamada de atenção.
 */
export const Balancar: React.FC<AnimationProps> = ({
  lines,
  lineSegments,
  style,
  entryDuration = 14,
  exitDuration = 14,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const exitStart = durationInFrames - exitDuration;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      {lines.map((line, idx) => {
        const delay = idx * 5;
        const progress = spring({
          frame: frame - delay,
          fps,
          durationInFrames: entryDuration,
          config: { damping: 8, mass: 0.7, stiffness: 140 }, // bouncy
        });
        const exit = interpolate(frame, [exitStart, durationInFrames], [1, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        const scale = interpolate(progress, [0, 1], [0.3, 1]);
        const opacity = Math.min(progress, exit);
        return (
          <div
            key={idx}
            style={{
              ...style,
              transform: `scale(${scale})`,
              opacity,
            }}
          >
            <LineContent
              text={line}
              segments={lineSegments?.[idx]}
              defaultColor={style.color as string | undefined}
            />
          </div>
        );
      })}
    </div>
  );
};
