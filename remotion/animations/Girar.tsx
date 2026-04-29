import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { AnimationProps } from "../BeatScene";
import { LineContent } from "./LineRenderer";

/**
 * Girar — texto rotaciona 180° na entrada. Vibe dinâmica.
 */
export const Girar: React.FC<AnimationProps> = ({
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
        const delay = idx * 4;
        const progress = spring({
          frame: frame - delay,
          fps,
          durationInFrames: entryDuration,
          config: { damping: 16, mass: 0.6 },
        });
        const exit = interpolate(frame, [exitStart, durationInFrames], [1, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        const rotation = interpolate(progress, [0, 1], [-180, 0]);
        const scale = interpolate(progress, [0, 1], [0.6, 1]);
        const opacity = Math.min(progress, exit);
        return (
          <div
            key={idx}
            style={{
              ...style,
              transform: `rotate(${rotation}deg) scale(${scale})`,
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
