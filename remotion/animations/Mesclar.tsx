import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import type { AnimationProps } from "../BeatScene";
import { LineContent } from "./LineRenderer";

export const Mesclar: React.FC<AnimationProps> = ({ lines, lineSegments, style }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  const inEnd = 14;
  const outStart = durationInFrames - 12;

  const opacity = interpolate(
    frame,
    [0, inEnd, outStart, durationInFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const scale = interpolate(
    frame,
    [0, inEnd, outStart, durationInFrames],
    [1.06, 1, 1, 1.04],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const blur = interpolate(
    frame,
    [0, inEnd, outStart, durationInFrames],
    [10, 0, 0, 8],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  return (
    <div
      style={{
        opacity,
        transform: `scale(${scale})`,
        filter: `blur(${blur}px)`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
      }}
    >
      {lines.map((line, idx) => (
        <div key={idx} style={style}>
          <LineContent
            text={line}
            segments={lineSegments?.[idx]}
            defaultColor={style.color as string | undefined}
          />
        </div>
      ))}
    </div>
  );
};
