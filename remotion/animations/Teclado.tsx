import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import type { AnimationProps } from "../BeatScene";
import { LineContent } from "./LineRenderer";

// V83: era 1.4 (texto digitando muito rápido). Diminuí pra 0.6 — frases
// de 30 chars demoram ~50 frames (~2s) pra digitar, deixando os outros
// 4 segundos pra leitura confortável.
const CHARS_PER_FRAME = 0.6;

/**
 * Teclado — efeito typewriter (digita letra por letra).
 * V87: agora respeita direction.
 *  - "ambos": digita + faz fade-out no fim do slide (saída suave)
 *  - "entrando": digita + cursor pisca + texto fica até o fim (NÃO sai)
 *  - "saindo": começa com texto completo, só faz a saída
 */
export const Teclado: React.FC<AnimationProps> = ({
  lines,
  lineSegments,
  style,
  exitDuration = 48,
  direction = "ambos",
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const exitStart = durationInFrames - exitDuration;

  // V87: opacity de saída — se "entrando", fica em 1 até o fim
  const exitOpacity =
    direction === "entrando"
      ? 1
      : interpolate(frame, [exitStart, durationInFrames], [1, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });

  // Se há cor por palavra, fallback pra render estático com cursor — typewriter
  // por chars não combina bem com segments coloridos (complexidade).
  if (lineSegments && lineSegments.some((seg) => seg && seg.length > 0)) {
    const showCursor = frame % 20 < 10 && frame < durationInFrames - 6;
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          opacity: exitOpacity,
        }}
      >
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

  // V87: se "saindo", começa com texto inteiro. Senão, anima digitação.
  const visibleChars =
    direction === "saindo"
      ? totalChars
      : Math.min(totalChars, Math.floor(frame * CHARS_PER_FRAME));

  // Cursor pisca enquanto digita + alguns frames extras. Se "entrando",
  // continua piscando até o fim do slide (não some).
  const typeFrames = Math.min(
    durationInFrames - 8,
    Math.ceil(totalChars / CHARS_PER_FRAME),
  );
  const cursorEnd =
    direction === "entrando" ? durationInFrames : typeFrames + 6;
  const showCursor = frame < cursorEnd;
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
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        opacity: exitOpacity,
      }}
    >
      {visibleLines.map((line, i) => (
        <div key={i} style={style}>
          {line || " "}
        </div>
      ))}
    </div>
  );
};
