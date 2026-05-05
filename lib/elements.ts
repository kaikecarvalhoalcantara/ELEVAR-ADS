import type { ElementShape, EntryAnimation, PageElement } from "./types";

/**
 * Cria um novo elemento com defaults razoáveis baseado no shape.
 */
export function createElement(shape: ElementShape): PageElement {
  const id = Math.random().toString(36).slice(2, 10);
  switch (shape) {
    case "rectangle":
      return {
        id,
        shape,
        x: 0.1,
        y: 0.1,
        w: 0.4,
        h: 0.12,
        color: "#000000",
        opacity: 0.7,
        rotation: 0,
        borderRadius: 6,
      };
    case "circle":
      return {
        id,
        shape,
        x: 0.35,
        y: 0.35,
        w: 0.3,
        h: 0.3,
        color: "#ffffff",
        opacity: 0.85,
        rotation: 0,
      };
    case "line":
      return {
        id,
        shape,
        x: 0.2,
        y: 0.5,
        w: 0.6,
        h: 0.008,
        color: "#ffffff",
        opacity: 1,
        rotation: 0,
      };
    case "diamond":
      return {
        id,
        shape,
        x: 0.4,
        y: 0.4,
        w: 0.2,
        h: 0.2,
        color: "#d4af37",
        opacity: 0.85,
        rotation: 0,
      };
    case "triangle":
      return {
        id,
        shape,
        x: 0.4,
        y: 0.4,
        w: 0.2,
        h: 0.18,
        color: "#ff4d4d",
        opacity: 0.85,
        rotation: 0,
      };
    case "star":
      return {
        id,
        shape,
        x: 0.4,
        y: 0.4,
        w: 0.2,
        h: 0.2,
        color: "#ffd84d",
        opacity: 1,
        rotation: 0,
      };
    case "hexagon":
      return {
        id,
        shape,
        x: 0.4,
        y: 0.4,
        w: 0.2,
        h: 0.2,
        color: "#4dd0ff",
        opacity: 0.9,
        rotation: 0,
      };
    case "arrow":
      return {
        id,
        shape,
        x: 0.3,
        y: 0.45,
        w: 0.4,
        h: 0.1,
        color: "#ffffff",
        opacity: 1,
        rotation: 0,
      };
    case "octagon":
      return {
        id,
        shape,
        x: 0.4,
        y: 0.4,
        w: 0.2,
        h: 0.2,
        color: "#a78bfa",
        opacity: 0.9,
        rotation: 0,
      };
    case "heart":
      return {
        id,
        shape,
        x: 0.4,
        y: 0.4,
        w: 0.2,
        h: 0.18,
        color: "#ff4d6d",
        opacity: 1,
        rotation: 0,
      };
    case "plus":
      return {
        id,
        shape,
        x: 0.45,
        y: 0.45,
        w: 0.1,
        h: 0.1,
        color: "#ffffff",
        opacity: 1,
        rotation: 0,
      };
    case "icon":
      return {
        id,
        shape,
        x: 0.42,
        y: 0.42,
        w: 0.16,
        h: 0.16,
        color: "#ffffff",
        opacity: 1,
        rotation: 0,
        iconName: "star",
      };
    // V41: 4 modelos de sombra com gradiente
    case "shadow-oval":
      return {
        id,
        shape,
        x: 0.2,
        y: 0.42,
        w: 0.6,
        h: 0.16,
        color: "#000000",
        opacity: 0.85,
        rotation: 0,
      };
    case "shadow-radial":
      return {
        id,
        shape,
        x: 0.3,
        y: 0.3,
        w: 0.4,
        h: 0.4,
        color: "#000000",
        opacity: 0.9,
        rotation: 0,
      };
    case "shadow-band":
      return {
        id,
        shape,
        x: 0,
        y: 0,
        w: 0.5,
        h: 1,
        color: "#000000",
        opacity: 0.95,
        rotation: 0,
      };
    case "shadow-edge":
      return {
        id,
        shape,
        x: 0,
        y: 0.7,
        w: 1,
        h: 0.3,
        color: "#000000",
        opacity: 0.9,
        rotation: 0,
      };
    // V59: overlay de vídeo (split-screen com 2 vídeos)
    case "video-overlay":
      return {
        id,
        shape,
        x: 0,
        y: 0.5,
        w: 1,
        h: 0.5,
        color: "#000000",
        opacity: 1,
        rotation: 0,
      };
  }
}

// Polígonos pra clip-path (porcentagens 0-100). Cada par "x% y%".
const STAR_POLY =
  "50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%";
const HEXAGON_POLY = "25% 5%, 75% 5%, 100% 50%, 75% 95%, 25% 95%, 0% 50%";
const ARROW_POLY =
  "0% 30%, 60% 30%, 60% 0%, 100% 50%, 60% 100%, 60% 70%, 0% 70%";
const OCTAGON_POLY =
  "30% 0%, 70% 0%, 100% 30%, 100% 70%, 70% 100%, 30% 100%, 0% 70%, 0% 30%";
const HEART_POLY =
  "50% 95%, 10% 55%, 0% 30%, 15% 5%, 35% 5%, 50% 25%, 65% 5%, 85% 5%, 100% 30%, 90% 55%";
const PLUS_POLY =
  "35% 0%, 65% 0%, 65% 35%, 100% 35%, 100% 65%, 65% 65%, 65% 100%, 35% 100%, 35% 65%, 0% 65%, 0% 35%, 35% 35%";

export function elementSupportsText(shape: ElementShape): boolean {
  return (
    shape === "rectangle" ||
    shape === "circle" ||
    shape === "hexagon" ||
    shape === "octagon"
  );
}

/**
 * Computa o estilo de animação de entrada baseado no frame atual.
 * Retorna apenas opacity + transform de entrada — chamador combina com a
 * rotação base do elemento.
 */
export function elementEntryStyle(
  entry: EntryAnimation,
  frame: number,
  duration: number,
  delay: number,
  baseOpacity: number,
): {
  opacity?: number;
  entryTransform?: string;
} {
  if (entry === "none" || frame >= delay + duration) {
    return {};
  }
  const t = Math.max(0, Math.min(1, (frame - delay) / duration));
  // ease-out cubic
  const ease = 1 - Math.pow(1 - t, 3);
  switch (entry) {
    case "fade":
      return { opacity: baseOpacity * ease };
    case "slide-up":
      return {
        opacity: baseOpacity * ease,
        entryTransform: `translateY(${(1 - ease) * 60}px)`,
      };
    case "slide-down":
      return {
        opacity: baseOpacity * ease,
        entryTransform: `translateY(${-(1 - ease) * 60}px)`,
      };
    case "slide-left":
      return {
        opacity: baseOpacity * ease,
        entryTransform: `translateX(${(1 - ease) * 60}px)`,
      };
    case "slide-right":
      return {
        opacity: baseOpacity * ease,
        entryTransform: `translateX(${-(1 - ease) * 60}px)`,
      };
    case "scale":
      return {
        opacity: baseOpacity * ease,
        entryTransform: `scale(${0.6 + 0.4 * ease})`,
      };
    default:
      return {};
  }
}

/**
 * Estilo CSS pra renderizar um elemento dentro de um container relativo.
 */
export function elementStyle(
  el: PageElement,
  scale: number = 1, // pra ajustar shadow no preview menor
): React.CSSProperties {
  const shadowBlur = el.shadowBlur ?? 0;
  const shadowOpacity = el.shadowOpacity ?? 0.5;
  const boxShadow =
    shadowBlur > 0
      ? `0 ${Math.round(shadowBlur * 0.4 * scale)}px ${Math.round(shadowBlur * scale)}px rgba(0,0,0,${shadowOpacity})`
      : undefined;

  const base: React.CSSProperties = {
    position: "absolute",
    left: `${el.x * 100}%`,
    top: `${el.y * 100}%`,
    width: `${el.w * 100}%`,
    height: `${el.h * 100}%`,
    background: el.color,
    opacity: el.opacity,
    transformOrigin: "center center",
    pointerEvents: "none",
    boxShadow,
  };
  switch (el.shape) {
    case "circle":
      return {
        ...base,
        borderRadius: "50%",
        transform: `rotate(${el.rotation}deg)`,
      };
    case "line":
      return {
        ...base,
        transform: `rotate(${el.rotation}deg)`,
      };
    case "diamond":
      return {
        ...base,
        transform: `rotate(${45 + el.rotation}deg)`,
      };
    case "triangle":
      return {
        ...base,
        clipPath: "polygon(50% 0, 100% 100%, 0 100%)",
        transform: `rotate(${el.rotation}deg)`,
        boxShadow: undefined, // box-shadow não respeita clip-path
        filter: boxShadow ? `drop-shadow(${boxShadow})` : undefined,
      };
    case "star":
      return {
        ...base,
        clipPath: `polygon(${STAR_POLY})`,
        transform: `rotate(${el.rotation}deg)`,
        boxShadow: undefined,
        filter: boxShadow ? `drop-shadow(${boxShadow})` : undefined,
      };
    case "hexagon":
      return {
        ...base,
        clipPath: `polygon(${HEXAGON_POLY})`,
        transform: `rotate(${el.rotation}deg)`,
        boxShadow: undefined,
        filter: boxShadow ? `drop-shadow(${boxShadow})` : undefined,
      };
    case "arrow":
      return {
        ...base,
        clipPath: `polygon(${ARROW_POLY})`,
        transform: `rotate(${el.rotation}deg)`,
        boxShadow: undefined,
        filter: boxShadow ? `drop-shadow(${boxShadow})` : undefined,
      };
    case "octagon":
      return {
        ...base,
        clipPath: `polygon(${OCTAGON_POLY})`,
        transform: `rotate(${el.rotation}deg)`,
        boxShadow: undefined,
        filter: boxShadow ? `drop-shadow(${boxShadow})` : undefined,
      };
    case "heart":
      return {
        ...base,
        clipPath: `polygon(${HEART_POLY})`,
        transform: `rotate(${el.rotation}deg)`,
        boxShadow: undefined,
        filter: boxShadow ? `drop-shadow(${boxShadow})` : undefined,
      };
    case "plus":
      return {
        ...base,
        clipPath: `polygon(${PLUS_POLY})`,
        transform: `rotate(${el.rotation}deg)`,
        boxShadow: undefined,
        filter: boxShadow ? `drop-shadow(${boxShadow})` : undefined,
      };
    case "icon":
      // Icon usa fundo transparente e renderiza o SVG como filho
      // (fora do escopo de elementStyle — feito no componente).
      return {
        ...base,
        background: "transparent",
        backgroundColor: "transparent",
        color: el.color,
        transform: `rotate(${el.rotation}deg)`,
        boxShadow: undefined,
        filter: boxShadow ? `drop-shadow(${boxShadow})` : undefined,
      };
    // V41: 4 sombras com gradiente. V74: densidade controlada por
    // shadowDensity (0-1, default 0.5). Quanto maior, mais "denso" o
    // efeito antes do fade. Cor do elemento define a tonalidade.
    case "shadow-oval": {
      const d = (el.shadowDensity ?? 0.5);
      // Oval — sólido até d*50%, fade até 100% (zero pra fora)
      const solid = Math.round(d * 50); // 0-50%
      const fadeEnd = Math.min(100, solid + Math.round((1 - d) * 50) + 25);
      return {
        ...base,
        background: `radial-gradient(ellipse at center, ${el.color} 0%, ${el.color} ${solid}%, transparent ${fadeEnd}%)`,
        transform: `rotate(${el.rotation}deg)`,
        boxShadow: undefined,
      };
    }
    case "shadow-radial": {
      const d = (el.shadowDensity ?? 0.5);
      const solid = Math.round(d * 40);
      const fadeEnd = Math.min(100, solid + Math.round((1 - d) * 50) + 30);
      return {
        ...base,
        background: `radial-gradient(circle at center, ${el.color} 0%, ${el.color} ${solid}%, transparent ${fadeEnd}%)`,
        transform: `rotate(${el.rotation}deg)`,
        boxShadow: undefined,
      };
    }
    case "shadow-band": {
      const d = (el.shadowDensity ?? 0.5);
      // Banda lateral split-screen: sólido até X%, fade até 100%.
      // d=0 → 30% sólido (bem fraco), d=1 → 90% sólido (quase total)
      const solidEnd = Math.round(20 + d * 70); // 20-90%
      return {
        ...base,
        background: `linear-gradient(90deg, ${el.color} 0%, ${el.color} ${solidEnd}%, transparent 100%)`,
        transform: `rotate(${el.rotation}deg)`,
        boxShadow: undefined,
      };
    }
    case "shadow-edge": {
      const d = (el.shadowDensity ?? 0.5);
      // Letterbox: transparent no topo, fade pra sólido. Quanto mais
      // denso, mais cedo começa o sólido.
      const solidStart = Math.round(80 - d * 70); // 10-80%
      return {
        ...base,
        background: `linear-gradient(180deg, transparent 0%, ${el.color} ${solidStart}%)`,
        transform: `rotate(${el.rotation}deg)`,
        boxShadow: undefined,
      };
    }
    case "video-overlay":
      // V59: container do vídeo overlay — sem background, vídeo é renderizado
      // como tag <video>/<OffthreadVideo> filho. Mantém transforms (rotation,
      // pos, size) no container; o vídeo dentro tem flip/zoom próprio.
      return {
        ...base,
        background: "transparent",
        backgroundColor: "transparent",
        overflow: "hidden",
        transform: `rotate(${el.rotation}deg)`,
        boxShadow: undefined,
      };
    case "rectangle":
    default:
      return {
        ...base,
        borderRadius: `${el.borderRadius ?? 0}%`,
        transform: `rotate(${el.rotation}deg)`,
      };
  }
}

/**
 * Estilo do texto interno do elemento (pra rectangle e circle).
 */
export function elementTextStyle(
  el: PageElement,
  scale: number = 1,
): React.CSSProperties {
  return {
    position: "absolute",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    padding: "6%",
    fontFamily: '"Anton", system-ui, sans-serif',
    color: el.textColor ?? "#ffffff",
    fontSize: (el.textSize ?? 32) * scale,
    fontWeight: el.textBold === false ? 500 : 900,
    textTransform: el.textUppercase === false ? "none" : "uppercase",
    lineHeight: 1.05,
    pointerEvents: "none",
  };
}
