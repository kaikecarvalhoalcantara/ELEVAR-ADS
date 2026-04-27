import type { TextSegment } from "../../lib/types";

/**
 * Renderiza uma linha — ou texto plain ou segmentado com cores por palavra.
 * Usado por todas as animações pra evitar duplicação de lógica de segments.
 */
export const LineContent: React.FC<{
  text: string;
  segments?: TextSegment[];
  defaultColor?: string;
}> = ({ text, segments, defaultColor }) => {
  if (segments && segments.length > 0) {
    return (
      <>
        {segments.map((seg, i) => (
          <span key={i} style={{ color: seg.color ?? defaultColor }}>
            {seg.text}
          </span>
        ))}
      </>
    );
  }
  return <>{text}</>;
};
