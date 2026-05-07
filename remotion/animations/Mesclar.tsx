import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import type { AnimationProps } from "../BeatScene";
import { LineContent } from "./LineRenderer";

/**
 * Mesclar — fade + scale + blur. V87: respeita direction.
 *  - "ambos": entra (fade+scale+blur in) + sai (fade+scale+blur out)
 *  - "entrando": só entra, fica visível até o fim
 *  - "saindo": começa visível, só faz a saída
 */
export const Mesclar: React.FC<AnimationProps> = ({
  lines,
  lineSegments,
  style,
  entryDuration = 48,
  exitDuration = 48,
  direction = "ambos",
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const inEnd = entryDuration;
  const outStart = durationInFrames - exitDuration;

  // Entry: opacity 0→1, scale 1.06→1, blur 10→0 ao longo dos primeiros frames
  const entryOpacity =
    direction === "saindo"
      ? 1
      : interpolate(frame, [0, inEnd], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
  const entryScale =
    direction === "saindo"
      ? 1
      : interpolate(frame, [0, inEnd], [1.06, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
  const entryBlur =
    direction === "saindo"
      ? 0
      : interpolate(frame, [0, inEnd], [10, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });

  // Exit: opacity 1→0, scale 1→1.04, blur 0→8. Quando "entrando", fica
  // estático no fim (1, 1, 0).
  const exitOpacity =
    direction === "entrando"
      ? 1
      : interpolate(frame, [outStart, durationInFrames], [1, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
  const exitScale =
    direction === "entrando"
      ? 1
      : interpolate(frame, [outStart, durationInFrames], [1, 1.04], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
  const exitBlur =
    direction === "entrando"
      ? 0
      : interpolate(frame, [outStart, durationInFrames], [0, 8], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });

  // Combina entry + exit: usa min/max conforme a fase
  const opacity = Math.min(entryOpacity, exitOpacity);
  const scale = frame >= outStart ? exitScale : entryScale;
  const blur = frame >= outStart ? exitBlur : entryBlur;

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
