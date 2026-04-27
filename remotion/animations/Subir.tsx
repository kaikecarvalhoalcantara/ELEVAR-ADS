import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { AnimationProps } from "../BeatScene";
import { LineContent } from "./LineRenderer";

export const Subir: React.FC<AnimationProps> = ({ lines, lineSegments, style }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      {lines.map((line, idx) => {
        const delay = idx * 4;
        const progress = spring({
          frame: frame - delay,
          fps,
          config: { damping: 18, mass: 0.6 },
        });
        const exitStart = durationInFrames - 14;
        const exitOpacity = interpolate(
          frame,
          [exitStart, durationInFrames],
          [1, 0],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
        );
        const translateY = interpolate(progress, [0, 1], [80, 0]);
        const opacity = Math.min(progress, exitOpacity);
        return (
          <div
            key={idx}
            style={{
              ...style,
              transform: `translateY(${translateY}px)`,
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
