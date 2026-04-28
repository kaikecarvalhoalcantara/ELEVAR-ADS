import { Composition } from "remotion";
import { AdComposition, type AdProps } from "./AdComposition";

const FPS = 24; // 30 era o ideal, mas 24 é cinema-standard e 20% mais rápido pra render
const FRAMES_PER_BEAT = 48; // 2 segundos por beat em 24fps

const previewProps: AdProps = {
  beats: [
    { text: "TUDO QUE É FÁCIL / DE GOSTAR", weight: "hook" },
    { text: "TAMBÉM É MUITO / FÁCIL DE ESQUECER", weight: "hook" },
    { text: "Isso serve para os / relacionamentos", weight: "transition" },
    { text: "Para deixar um / RASTRO REAL", weight: "punch" },
    { text: "Ao tocar em / Saiba Mais", weight: "punch" },
    { text: "Toque em / Saiba Mais", weight: "punch" },
  ],
  videos: [],
  format: "9:16",
  fontHook: "Anton",
  fontTransition: "Inter",
  projectStyle: undefined,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const AdCompAny = AdComposition as React.ComponentType<any>;

export const Root: React.FC = () => {
  return (
    <>
      <Composition
        id="Ad-9x16"
        component={AdCompAny}
        defaultProps={previewProps as unknown as Record<string, unknown>}
        fps={FPS}
        width={1080}
        height={1920}
        durationInFrames={previewProps.beats.length * FRAMES_PER_BEAT}
        calculateMetadata={({ props }) => {
          const ap = props as unknown as AdProps;
          return {
            durationInFrames: Math.max(1, ap.beats.length) * FRAMES_PER_BEAT,
            width: dimsFor(ap.format).width,
            height: dimsFor(ap.format).height,
          };
        }}
      />
    </>
  );
};

function dimsFor(format: AdProps["format"]) {
  // Resolução reduzida pra economizar memória/CPU no Railway.
  // 720p é visualmente OK pra ads, render é 4x mais leve que 1080p.
  switch (format) {
    case "9:16":
      return { width: 720, height: 1280 };
    case "4:5":
      return { width: 720, height: 900 };
    case "16:9":
      return { width: 1280, height: 720 };
    case "1:1":
      return { width: 720, height: 720 };
  }
}
