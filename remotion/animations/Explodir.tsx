import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import type { AnimationProps } from "../BeatScene";
import { LineContent } from "./LineRenderer";

/**
 * Explodir — texto vem de fora pra dentro (1.4x → 1x). Impact / punch.
 */
export const Explodir: React.FC<AnimationProps> = ({
  lines,
  lineSegments,
  style,
  entryDuration = 14,
  exitDuration = 14,
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const exitStart = durationInFrames - exitDuration;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      {lines.map((line, idx) => {
        const delay = idx * 3;
        const progress = interpolate(frame - delay, [0, entryDuration], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: (t) => 1 - Math.pow(1 - t, 4), // easeOutQuart
        });
        const exit = interpolate(frame, [exitStart, durationInFrames], [1, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        const scale = interpolate(progress, [0, 1], [1.5, 1]);
        const opacity = Math.min(progress, exit);
        return (
          <div
            key={idx}
            style={{
              ...style,
              transform: `scale(${scale})`,
              opacity,
              filter: `blur(${interpolate(progress, [0, 0.3, 1], [10, 4, 0])}px)`,
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
