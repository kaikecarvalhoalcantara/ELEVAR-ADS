import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import type { AnimationProps } from "../BeatScene";
import { LineContent } from "./LineRenderer";

/**
 * Bloco — clipPath revelando da esquerda. V87: respeita direction.
 *  - "ambos": entra revelando + sai escondendo (default)
 *  - "entrando": só entra, fica visível até o fim do slide
 *  - "saindo": começa visível, só faz a saída
 * flipExit inverte o lado da saída (esquerda → direita).
 */
export const Bloco: React.FC<AnimationProps> = ({
  lines,
  lineSegments,
  style,
  entryDuration = 48,
  exitDuration = 48,
  direction = "ambos",
  flipExit = false,
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const exitStart = durationInFrames - exitDuration;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      {lines.map((line, idx) => {
        const delay = idx * 12;
        const localFrame = frame - delay;

        // Entry reveal: 0% → 100%. Quando direction === "saindo",
        // começa já 100% (visível direto).
        const reveal =
          direction === "saindo"
            ? 100
            : interpolate(localFrame, [0, entryDuration], [0, 100], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              });

        // Exit progress: 100% → 0%. Quando direction === "entrando",
        // permanece 100% até o fim (não sai).
        const exitProgress =
          direction === "entrando"
            ? 100
            : interpolate(
                localFrame,
                [exitStart, exitStart + exitDuration],
                [100, 0],
                { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
              );

        // Combina: durante entrada usa reveal, durante saída usa exit.
        // V87: usa exitStart como threshold (era durationInFrames/2 — bug
        // que cortava o tempo de respiro pela metade).
        const inExitPhase = direction !== "entrando" && frame >= exitStart;
        const clipPercent = inExitPhase ? exitProgress : reveal;

        // V87: lado da máscara — entrada sempre da esquerda, saída
        // pode inverter via flipExit.
        const insetSide = inExitPhase && flipExit ? "left" : "right";
        const insetCss =
          insetSide === "right"
            ? `inset(0 ${100 - clipPercent}% 0 0)`
            : `inset(0 0 0 ${100 - clipPercent}%)`;

        return (
          <div
            key={idx}
            style={{
              ...style,
              clipPath: insetCss,
              WebkitClipPath: insetCss,
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
