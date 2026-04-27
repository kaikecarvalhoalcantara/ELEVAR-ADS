import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import type { AnimationProps } from "../BeatScene";
import { LineContent } from "./LineRenderer";

export const Bloco: React.FC<AnimationProps> = ({ lines, lineSegments, style }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      {lines.map((line, idx) => {
        const delay = idx * 6;
        const localFrame = frame - delay;
        const reveal = interpolate(localFrame, [0, 14], [0, 100], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        const exitStart = durationInFrames - 14 - delay;
        const exitProgress = interpolate(
          localFrame,
          [exitStart, exitStart + 14],
          [100, 0],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
        );
        const clipPercent = frame < durationInFrames / 2 ? reveal : exitProgress;
        return (
          <div
            key={idx}
            style={{
              ...style,
              clipPath: `inset(0 ${100 - clipPercent}% 0 0)`,
              WebkitClipPath: `inset(0 ${100 - clipPercent}% 0 0)`,
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
