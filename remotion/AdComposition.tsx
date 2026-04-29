import { AbsoluteFill, Sequence } from "remotion";
import { BeatScene } from "./BeatScene";
import type {
  AnimationKind,
  Beat,
  PageStyle,
  ProjectStyle,
} from "../lib/types";
import { defaultProjectStyle } from "../lib/style-defaults";

export const FRAMES_PER_BEAT = 48; // 2s a 24fps

export interface PageWithStyle extends Beat, PageStyle {
  hideText?: boolean;
  segments?: import("../lib/types").TextSegment[][];
  iconAbove?: import("../lib/types").IconName;
  iconBelow?: import("../lib/types").IconName;
  iconColor?: string;
  videoZoom?: number;
  videoFlipH?: boolean;
  videoFlipV?: boolean;
  videoTrimStart?: number;
  videoTrimEnd?: number;
  elements?: import("../lib/types").PageElement[];
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
  textScaleX?: number;
  glowColor?: string;
  glowIntensity?: number;
  gradientEnabled?: boolean;
  gradientFrom?: string;
  gradientTo?: string;
  gradientAngle?: number;
  // V18: remover vídeo + cor de fundo
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
  // V19: velocidade de animação
  animationSpeed?: number;
  animationEntryDuration?: number;
  animationExitDuration?: number;
  // V21: letter effect
  letterEffect?:
    | "none"
    | "projetada"
    | "brilhante"
    | "eco"
    | "contorno"
    | "fundo"
    | "desalinhado"
    | "vazado"
    | "neon"
    | "falha";
  letterEffectIntensity?: number;
  letterEffectColor?: string;
}

export interface AdProps {
  beats: PageWithStyle[];
  videos: string[];
  animations?: AnimationKind[];
  format: "9:16" | "4:5" | "16:9" | "1:1";
  fontHook: string;
  fontTransition: string;
  projectStyle?: ProjectStyle;
}

const ANIMATION_ROTATION: AnimationKind[] = [
  "teclado",
  "subir",
  "deslocar",
  "mesclar",
  "bloco",
];

const FALLBACK_PROJECT_STYLE: ProjectStyle = defaultProjectStyle({
  toneFilter: "neutro",
  vibe: "cinematografico",
});

export const AdComposition: React.FC<AdProps> = ({
  beats,
  videos,
  animations,
  fontHook,
  fontTransition,
  projectStyle,
}) => {
  const ps = projectStyle ?? FALLBACK_PROJECT_STYLE;
  return (
    <AbsoluteFill style={{ backgroundColor: "#000000" }}>
      {beats.map((beat, idx) => {
        const animation =
          animations?.[idx] ??
          ANIMATION_ROTATION[idx % ANIMATION_ROTATION.length]!;
        const video = videos[idx] ?? null;
        return (
          <Sequence
            key={idx}
            from={idx * FRAMES_PER_BEAT}
            durationInFrames={FRAMES_PER_BEAT}
          >
            <BeatScene
              beat={beat}
              videoSrc={video}
              animation={animation}
              fontHook={fontHook}
              fontTransition={fontTransition}
              projectStyle={ps}
            />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
