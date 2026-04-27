import { AbsoluteFill, OffthreadVideo, useCurrentFrame, useVideoConfig } from "remotion";
import type {
  Beat,
  BeatWeight,
  IconName,
  PageElement,
  PageStyle,
  ProjectStyle,
  TextSegment,
} from "../lib/types";
import {
  buildTextShadow,
  computeFitFontSize,
  normalizePageText,
} from "../lib/text-utils";
import { colorFilterCss } from "../lib/color-filters";
import { iconSvgString } from "../lib/icons";
import {
  elementEntryStyle,
  elementStyle,
  elementSupportsText,
  elementTextStyle,
} from "../lib/elements";
import { Teclado } from "./animations/Teclado";
import { Subir } from "./animations/Subir";
import { Deslocar } from "./animations/Deslocar";
import { Mesclar } from "./animations/Mesclar";
import { Bloco } from "./animations/Bloco";

export type AnimationKind = "teclado" | "subir" | "deslocar" | "mesclar" | "bloco";

interface Props {
  beat: Beat &
    PageStyle & {
      hideText?: boolean;
      segments?: TextSegment[][];
      iconAbove?: IconName;
      iconBelow?: IconName;
      iconColor?: string;
      videoZoom?: number;
      videoFlipH?: boolean;
      videoFlipV?: boolean;
      videoTrimStart?: number;
      elements?: PageElement[];
      videoX?: number;
      videoY?: number;
      videoW?: number;
      videoH?: number;
    };
  videoSrc: string | null;
  animation: AnimationKind;
  fontHook: string;
  fontTransition: string;
  projectStyle: ProjectStyle;
}

export const BeatScene: React.FC<Props> = ({
  beat,
  videoSrc,
  animation,
  fontHook,
  fontTransition,
  projectStyle,
}) => {
  const { width, fps } = useVideoConfig();

  const isHook = beat.weight === "hook" || beat.weight === "punch";
  const fontFamily = isHook ? fontHook : fontTransition;
  const textTransform = isHook ? "uppercase" : "none";
  const fontWeight = isHook ? 900 : 600;

  const color = beat.color ?? projectStyle.baseColor;
  const letterSpacing = beat.letterSpacing ?? projectStyle.baseLetterSpacing;
  const lineHeight = beat.lineHeight ?? projectStyle.baseLineHeight;
  const shadowBlur = beat.textShadowBlur ?? projectStyle.baseShadowBlur;
  const shadowOpacity = beat.textShadowOpacity ?? projectStyle.baseShadowOpacity;
  const overlayOpacity = beat.overlayOpacity ?? projectStyle.baseOverlayOpacity;
  const align = beat.align ?? projectStyle.baseAlign;

  const normalized = normalizePageText(beat.text);
  const lines = normalized.split(" / ").map((s) => s.trim()).filter(Boolean);
  const lineSegments = beat.segments;

  const fontSizeBase = beat.fontSize && beat.fontSize > 0
    ? beat.fontSize
    : projectStyle.baseFontSize > 0
      ? projectStyle.baseFontSize
      : computeFitFontSize(lines, isHook, width);

  const baseStyle: React.CSSProperties = {
    fontFamily: `"${fontFamily}", system-ui, sans-serif`,
    fontWeight,
    color,
    textAlign: align,
    textTransform,
    lineHeight,
    letterSpacing: `${letterSpacing}em`,
    textShadow: buildTextShadow({ shadowBlur, shadowOpacity }),
    padding: "0 6%",
    fontSize: fontSizeBase,
    whiteSpace: "nowrap" as const,
  };

  const AnimComp = animationComponent(animation);
  const filterCss = colorFilterCss(projectStyle.colorFilter);

  // Vídeo transforms (V4 zoom/flip/trim) + posição livre (V9)
  const videoZoom = Math.max(1, beat.videoZoom ?? 1);
  const flipX = beat.videoFlipH ? -1 : 1;
  const flipY = beat.videoFlipV ? -1 : 1;
  const videoTransform = `scale(${videoZoom * flipX}, ${videoZoom * flipY})`;
  const startFrom = Math.max(0, Math.round((beat.videoTrimStart ?? 0) * fps));
  const vx = beat.videoX ?? 0;
  const vy = beat.videoY ?? 0;
  const vw = beat.videoW ?? 1;
  const vh = beat.videoH ?? 1;
  const isFullCanvasVideo = vx === 0 && vy === 0 && vw === 1 && vh === 1;

  const iconAboveSvg = iconSvgString(beat.iconAbove);
  const iconBelowSvg = iconSvgString(beat.iconBelow);
  const iconColor = beat.iconColor ?? color;
  const iconSize = Math.round(fontSizeBase * 0.6);

  return (
    <AbsoluteFill>
      {videoSrc ? (
        isFullCanvasVideo ? (
          <OffthreadVideo
            src={videoSrc}
            muted
            startFrom={startFrom}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              filter: filterCss || undefined,
              transform: videoTransform !== "scale(1, 1)" ? videoTransform : undefined,
            }}
          />
        ) : (
          <>
            <AbsoluteFill style={{ backgroundColor: "#000" }} />
            <div
              style={{
                position: "absolute",
                left: `${vx * 100}%`,
                top: `${vy * 100}%`,
                width: `${vw * 100}%`,
                height: `${vh * 100}%`,
                overflow: "hidden",
              }}
            >
              <OffthreadVideo
                src={videoSrc}
                muted
                startFrom={startFrom}
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  filter: filterCss || undefined,
                  transform: videoTransform !== "scale(1, 1)" ? videoTransform : undefined,
                }}
              />
            </div>
          </>
        )
      ) : (
        <AbsoluteFill style={{ backgroundColor: "#0a0a0a" }} />
      )}
      <AbsoluteFill
        style={{
          background:
            projectStyle.template === "cinema"
              ? // Cinema: gradient fade SUAVE da metade do canvas pro preto.
                // Sem linha dura — vídeo aparece nítido em cima, transição
                // suave no meio (onde fica o texto), preto denso embaixo.
                `linear-gradient(180deg, rgba(0,0,0,${overlayOpacity * 0.4}) 0%, rgba(0,0,0,${overlayOpacity * 0.4}) 38%, rgba(0,0,0,0.6) 55%, rgba(0,0,0,0.92) 72%, #000 88%, #000 100%)`
              : `linear-gradient(180deg, rgba(0,0,0,${overlayOpacity * 0.6}) 0%, rgba(0,0,0,${overlayOpacity}) 100%)`,
        }}
      />
      {beat.elements && beat.elements.length > 0 && (
        <ElementsLayer elements={beat.elements} />
      )}
      {!beat.hideText && (
        <AbsoluteFill
          style={{
            alignItems:
              align === "center"
                ? "center"
                : align === "left"
                  ? "flex-start"
                  : "flex-end",
            justifyContent: "center",
            display: "flex",
            flexDirection: "column",
            gap: Math.round(fontSizeBase * 0.25),
          }}
        >
          {iconAboveSvg && (
            <IconRenderer svg={iconAboveSvg} color={iconColor} size={iconSize} />
          )}
          <AnimComp
            lines={lines}
            lineSegments={lineSegments}
            style={baseStyle}
            weight={beat.weight}
          />
          {iconBelowSvg && (
            <IconRenderer svg={iconBelowSvg} color={iconColor} size={iconSize} />
          )}
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};

const IconRenderer: React.FC<{ svg: string; color: string; size: number }> = ({
  svg,
  color,
  size,
}) => (
  <div
    style={{
      width: size,
      height: size,
      color,
      filter: `drop-shadow(0 4px 12px rgba(0,0,0,0.5))`,
    }}
    dangerouslySetInnerHTML={{ __html: svg }}
  />
);

const ElementsLayer: React.FC<{ elements: PageElement[] }> = ({ elements }) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {elements.map((el) => {
        const baseStyle = elementStyle(el);
        const entry = el.entry ?? "none";
        const dur = el.entryDuration ?? 12;
        const delay = el.entryDelay ?? 0;
        const e = elementEntryStyle(entry, frame, dur, delay, el.opacity);
        const baseTransform = (baseStyle.transform as string | undefined) ?? "";
        const composedTransform = e.entryTransform
          ? `${e.entryTransform} ${baseTransform}`.trim()
          : baseTransform;
        const finalStyle: React.CSSProperties = {
          ...baseStyle,
          opacity: e.opacity ?? el.opacity,
          transform: composedTransform || undefined,
        };
        return (
          <div key={el.id} style={finalStyle}>
            {el.shape === "icon" && el.iconName && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  color: el.color,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
                dangerouslySetInnerHTML={{
                  __html: iconSvgString(el.iconName) ?? "",
                }}
              />
            )}
            {el.text && elementSupportsText(el.shape) && (
              <div style={elementTextStyle(el)}>{el.text}</div>
            )}
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

function animationComponent(kind: AnimationKind) {
  switch (kind) {
    case "teclado":
      return Teclado;
    case "subir":
      return Subir;
    case "deslocar":
      return Deslocar;
    case "mesclar":
      return Mesclar;
    case "bloco":
      return Bloco;
  }
}

export interface AnimationProps {
  lines: string[];
  lineSegments?: TextSegment[][];
  style: React.CSSProperties;
  weight: BeatWeight;
}
