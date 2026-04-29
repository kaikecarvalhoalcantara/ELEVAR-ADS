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
  buildLetterEffect,
  buildTextShadow,
  computeFitFontSize,
  normalizePageText,
} from "../lib/text-utils";
import type { LetterEffect } from "../lib/text-utils";
import { colorFilterCss, combinedVideoFilter } from "../lib/color-filters";
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
// V19: novas animações
import { Fade } from "./animations/Fade";
import { Escala } from "./animations/Escala";
import { Girar } from "./animations/Girar";
import { Explodir } from "./animations/Explodir";
import { Balancar } from "./animations/Balancar";
import { Flutuar } from "./animations/Flutuar";

export type AnimationKind =
  | "teclado"
  | "subir"
  | "deslocar"
  | "mesclar"
  | "bloco"
  | "fade"
  | "escala"
  | "girar"
  | "explodir"
  | "balancar"
  | "flutuar";

/** Helper: 0..1 → hex alpha "00".."ff" */
function alphaHex2(v: number): string {
  const c = Math.max(0, Math.min(1, v));
  return Math.round(c * 255).toString(16).padStart(2, "0");
}

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
      videoTrimEnd?: number;
      elements?: PageElement[];
      videoX?: number;
      videoY?: number;
      videoW?: number;
      videoH?: number;
      textOffsetX?: number;
      textOffsetY?: number;
      textShadowColor?: string;
      textStrokeColor?: string;
      textStrokeWidth?: number;
      // V16: arsenal de edição de letra
      italic?: boolean;
      fontWeightOverride?: number;
      underline?: boolean;
      strikethrough?: boolean;
      letterCase?: "none" | "upper" | "lower" | "capitalize";
      rotation?: number;
      skewX?: number;
      glowColor?: string;
      glowIntensity?: number;
      gradientEnabled?: boolean;
      gradientFrom?: string;
      gradientTo?: string;
      gradientAngle?: number;
      // V18: remover vídeo + cor de fundo sólida
      videoRemoved?: boolean;
      backgroundColor?: string;
      // V17: color grading per-page
      videoBrightness?: number;
      videoContrast?: number;
      videoSaturation?: number;
      videoHue?: number;
      videoTemperature?: number;
      videoVibrance?: number;
      videoHighlights?: number;
      videoShadows?: number;
      videoWhites?: number;
      videoBlacks?: number;
      // V19: velocidade da animação
      animationSpeed?: number;
      animationEntryDuration?: number;
      animationExitDuration?: number;
      // V21: letter effect
      letterEffect?: LetterEffect;
      letterEffectIntensity?: number;
      letterEffectColor?: string;
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
  // V16: textTransform respeita letterCase per-page; fallback no padrão (hook=uppercase)
  const textTransform: "uppercase" | "lowercase" | "capitalize" | "none" =
    beat.letterCase === "upper"
      ? "uppercase"
      : beat.letterCase === "lower"
        ? "lowercase"
        : beat.letterCase === "capitalize"
          ? "capitalize"
          : beat.letterCase === "none"
            ? "none"
            : isHook
              ? "uppercase"
              : "none";
  // V16: fontWeight customizável
  const fontWeight = beat.fontWeightOverride ?? (isHook ? 900 : 600);
  // V16: italic + underline + strikethrough
  const fontStyle: "italic" | "normal" = beat.italic ? "italic" : "normal";
  const decorations: string[] = [];
  if (beat.underline) decorations.push("underline");
  if (beat.strikethrough) decorations.push("line-through");
  const textDecoration = decorations.length > 0 ? decorations.join(" ") : "none";
  // V16: rotation + skew (transform aplicado no wrapper de texto)
  const beatRotation = beat.rotation ?? 0;
  const beatSkewX = beat.skewX ?? 0;
  const beatTextTransform =
    beatRotation !== 0 || beatSkewX !== 0
      ? `translate(${(beat.textOffsetX ?? 0) * 100}%, ${(beat.textOffsetY ?? 0) * 100}%) rotate(${beatRotation}deg) skewX(${beatSkewX}deg)`
      : `translate(${(beat.textOffsetX ?? 0) * 100}%, ${(beat.textOffsetY ?? 0) * 100}%)`;

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

  // V14/V16: Glow per-page com fallback no projeto.
  const glowIntensity = beat.glowIntensity ?? projectStyle.glowIntensity ?? 0;
  const glowColor = beat.glowColor ?? projectStyle.glowColor ?? "#ffd700";
  const baseShadow = buildTextShadow({
    shadowBlur,
    shadowOpacity,
    shadowColor: beat.textShadowColor ?? projectStyle.baseShadowColor,
    strokeColor: beat.textStrokeColor ?? projectStyle.baseStrokeColor,
    strokeWidth: beat.textStrokeWidth ?? projectStyle.baseStrokeWidth,
  });
  const computedShadow =
    glowIntensity > 0
      ? [
          `0 0 ${8}px ${glowColor}${alphaHex2(glowIntensity * 0.9)}`,
          `0 0 ${18}px ${glowColor}${alphaHex2(glowIntensity * 0.7)}`,
          `0 0 ${36}px ${glowColor}${alphaHex2(glowIntensity * 0.5)}`,
          baseShadow,
        ].join(", ")
      : baseShadow;

  // V14/V16: Gradiente per-page com fallback no projeto.
  const gradientEnabled =
    beat.gradientEnabled === true ||
    (beat.gradientEnabled === undefined && projectStyle.gradientEnabled === true);
  const gradFrom = beat.gradientFrom ?? projectStyle.gradientFrom ?? "#ffffff";
  const gradTo = beat.gradientTo ?? projectStyle.gradientTo ?? "#d4af37";
  const gradAngle = beat.gradientAngle ?? projectStyle.gradientAngle ?? 180;
  const gradientStyle: React.CSSProperties = gradientEnabled
    ? {
        background: `linear-gradient(${gradAngle}deg, ${gradFrom}, ${gradTo})`,
        WebkitBackgroundClip: "text",
        backgroundClip: "text",
        WebkitTextFillColor: "transparent",
        color: "transparent",
      }
    : {};

  // V21: Letter effect (preset estilo Canva)
  const letterFx = buildLetterEffect(
    beat.letterEffect,
    beat.letterEffectIntensity ?? 50,
    beat.letterEffectColor ?? "#ffd700",
    color,
  );
  const finalShadow = letterFx.overrideShadow ? letterFx.textShadow : computedShadow;

  const baseStyle: React.CSSProperties = {
    fontFamily: `"${fontFamily}", system-ui, sans-serif`,
    fontWeight,
    fontStyle,
    textDecoration,
    color,
    textAlign: align,
    textTransform,
    lineHeight,
    letterSpacing: `${letterSpacing}em`,
    textShadow: finalShadow,
    padding: "0 6%",
    fontSize: fontSizeBase,
    whiteSpace: "nowrap" as const,
    ...gradientStyle,
    // V21: letter effect override quando ativo
    ...(letterFx.overrideShadow
      ? {
          ...(letterFx.color !== undefined ? { color: letterFx.color } : {}),
          ...(letterFx.WebkitTextFillColor
            ? { WebkitTextFillColor: letterFx.WebkitTextFillColor }
            : {}),
          ...(letterFx.WebkitTextStroke
            ? { WebkitTextStroke: letterFx.WebkitTextStroke }
            : {}),
          ...(letterFx.background
            ? {
                background: letterFx.background,
                padding: letterFx.padding,
                display: "inline-block",
              }
            : {}),
        }
      : {}),
  };

  const AnimComp = animationComponent(animation);
  // V17: filtro combinado = LUT global do projeto + grading per-page
  const filterCss = combinedVideoFilter(projectStyle.colorFilter, {
    videoBrightness: beat.videoBrightness,
    videoContrast: beat.videoContrast,
    videoSaturation: beat.videoSaturation,
    videoHue: beat.videoHue,
    videoTemperature: beat.videoTemperature,
    videoVibrance: beat.videoVibrance,
    videoHighlights: beat.videoHighlights,
    videoShadows: beat.videoShadows,
    videoWhites: beat.videoWhites,
    videoBlacks: beat.videoBlacks,
  });

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

  // V18: cor de fundo + flag pra remover o vídeo
  const bgColor = beat.backgroundColor ?? "#0a0a0a";
  const showVideo = !beat.videoRemoved && !!videoSrc;

  return (
    <AbsoluteFill>
      {/* V18: cor sólida sempre primeiro (fica atrás do vídeo, ou aparece sozinha se removido) */}
      <AbsoluteFill style={{ backgroundColor: bgColor }} />
      {showVideo ? (
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
            <AbsoluteFill style={{ backgroundColor: bgColor }} />
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
      ) : null}
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
      {/* V14: VINHETA — escurece os 4 cantos */}
      {(projectStyle.vignetteIntensity ?? 0) > 0 && (
        <AbsoluteFill
          style={{
            background: `radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,${projectStyle.vignetteIntensity}) 100%)`,
            pointerEvents: "none",
          }}
        />
      )}
      {/* V14: LIGHT LEAKS — vazamentos de luz colorida nos cantos */}
      {(projectStyle.lightLeakIntensity ?? 0) > 0 && (
        <AbsoluteFill
          style={{
            background: `radial-gradient(ellipse at 85% 15%, ${projectStyle.lightLeakColor ?? "#ffd27a"}${alphaHex2((projectStyle.lightLeakIntensity ?? 0) * 0.85)} 0%, transparent 45%), radial-gradient(ellipse at 15% 85%, ${projectStyle.lightLeakColor ?? "#ffd27a"}${alphaHex2((projectStyle.lightLeakIntensity ?? 0) * 0.5)} 0%, transparent 40%)`,
            mixBlendMode: "screen",
            pointerEvents: "none",
          }}
        />
      )}
      {/* V14: GRANULADO de filme — noise via SVG turbulence */}
      {(projectStyle.grainIntensity ?? 0) > 0 && (
        <AbsoluteFill style={{ pointerEvents: "none", mixBlendMode: "overlay", opacity: projectStyle.grainIntensity }}>
          <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
            <filter id={`beat-grain-${animation}`}>
              <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" />
              <feColorMatrix type="saturate" values="0" />
            </filter>
            <rect width="100%" height="100%" filter={`url(#beat-grain-${animation})`} />
          </svg>
        </AbsoluteFill>
      )}
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
            // V11/V16: posição + rotação + skew aplicados no wrapper de texto
            transform: beatTextTransform,
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
            entryDuration={beat.animationEntryDuration ?? 14}
            exitDuration={beat.animationExitDuration ?? 14}
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
    case "fade":
      return Fade;
    case "escala":
      return Escala;
    case "girar":
      return Girar;
    case "explodir":
      return Explodir;
    case "balancar":
      return Balancar;
    case "flutuar":
      return Flutuar;
  }
}

export interface AnimationProps {
  lines: string[];
  lineSegments?: TextSegment[][];
  style: React.CSSProperties;
  weight: BeatWeight;
  // V19: duração customizável de entrada/saída (em frames)
  entryDuration?: number; // default 14
  exitDuration?: number;  // default 14
}
