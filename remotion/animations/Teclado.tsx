import { useCurrentFrame, useVideoConfig } from "remotion";
import type { AnimationProps } from "../BeatScene";
import { LineContent } from "./LineRenderer";

const CHARS_PER_FRAME = 1.4;

export const Teclado: React.FC<AnimationProps> = ({ lines, lineSegments, style }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  // Se há cor por palavra, fallback pra render estático com cursor — typewriter
  // por chars não combina bem com segments coloridos (complexidade).
  if (lineSegments && lineSegments.some((seg) => seg && seg.length > 0)) {
    const showCursor = frame % 20 < 10 && frame < durationInFrames - 6;
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        {lines.map((line, idx) => (
          <div key={idx} style={style}>
            <LineContent
              text={line}
              segments={lineSegments[idx]}
              defaultColor={style.color as string | undefined}
            />
            {idx === lines.length - 1 && showCursor ? "▍" : ""}
          </div>
        ))}
      </div>
    );
  }

  // Comportamento normal (typewriter char-by-char)
  const totals = lines.map((l) => l.length);
  const totalChars = totals.reduce((a, b) => a + b, 0);
  const typeFrames = Math.min(durationInFrames - 8, Math.ceil(totalChars / CHARS_PER_FRAME));
  const visibleChars = Math.min(totalChars, Math.floor(frame * CHARS_PER_FRAME));
  const showCursor = frame < typeFrames + 6;
  const cursor = showCursor && frame % 20 < 10 ? "▍" : "";

  let remaining = visibleChars;
  const visibleLines = lines.map((line) => {
    if (remaining <= 0) return "";
    const slice = line.slice(0, remaining);
    remaining -= slice.length;
    return slice;
  });
  const lastIdx = visibleLines.findIndex((v, i) => v.length < lines[i]!.length);
  if (lastIdx >= 0) visibleLines[lastIdx] = visibleLines[lastIdx]! + cursor;
  else if (visibleLines.length > 0)
    visibleLines[visibleLines.length - 1] =
      visibleLines[visibleLines.length - 1]! + cursor;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      {visibleLines.map((line, i) => (
        <div key={i} style={style}>
          {line || " "}
        </div>
      ))}
    </div>
  );
};
