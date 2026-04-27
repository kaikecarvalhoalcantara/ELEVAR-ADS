import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { AnimationProps } from "../BeatScene";
import { LineContent } from "./LineRenderer";

export const Deslocar: React.FC<AnimationProps> = ({ lines, lineSegments, style }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames, width } = useVideoConfig();

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      {lines.map((line, idx) => {
        const delay = idx * 5;
        const dir = idx % 2 === 0 ? -1 : 1;
        const progress = spring({
          frame: frame - delay,
          fps,
          config: { damping: 22, mass: 0.7 },
        });
        const exitStart = durationInFrames - 14;
        const exitOpacity = interpolate(
          frame,
          [exitStart, durationInFrames],
          [1, 0],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
        );
        const translateX = interpolate(progress, [0, 1], [dir * width * 0.35, 0]);
        const opacity = Math.min(progress, exitOpacity);
        return (
          <div
            key={idx}
            style={{
              ...style,
              transform: `translateX(${translateX}px)`,
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
