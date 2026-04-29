import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import type { AnimationProps } from "../BeatScene";
import { LineContent } from "./LineRenderer";

/**
 * Flutuar — entrada suave + movimento vertical sutil contínuo.
 * Vibe sofisticada / premium / calma.
 */
export const Flutuar: React.FC<AnimationProps> = ({
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
        const delay = idx * 3;
        const enter = interpolate(frame - delay, [0, entryDuration], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        const exit = interpolate(frame, [exitStart, durationInFrames], [1, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        // Movimento idle: senóide vertical sutil
        const idleY = Math.sin((frame / fps) * 2 * Math.PI * 0.5) * 6; // 6px amplitude, 0.5Hz
        const opacity = Math.min(enter, exit);
        return (
          <div
            key={idx}
            style={{
              ...style,
              transform: `translateY(${idleY}px)`,
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
