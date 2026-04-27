export type Padrao = "HDCPY" | "EXPERT" | "MERCADO";

export type Mood =
  | "tenso"
  | "melancolico"
  | "sofisticado"
  | "agressivo"
  | "sedutor"
  | "calmo";

export type Audience = "infantil" | "feminino" | "masculino" | "geral";

export type Lang = "pt" | "es" | "en";

export type Format = "9:16" | "4:5" | "16:9" | "1:1";

export interface ParsedAd {
  number: number;
  padrao: Padrao;
  description: string;
  copy: string;
}

export interface ParsedDoc {
  cliente: string;
  nicho: string;
  nome: string;
  ads: ParsedAd[];
}

export type BeatWeight = "hook" | "transition" | "punch";

export interface Beat {
  text: string;
  weight: BeatWeight;
}

export interface ScenePlan extends Beat {
  query: string;
  tags: string[];
}

export type AnimationKind = "teclado" | "subir" | "deslocar" | "mesclar" | "bloco";

export type ToneFilter = "neutro" | "escuro" | "suave" | "infantil" | "vintage" | "premium";

export type Vibe = "cinematografico" | "documental" | "glamour" | "tenso" | "calmo" | "elegante";

export type Align = "left" | "center" | "right";

export interface PageStyle {
  fontSize?: number;          // px in canvas units (1080w)
  color?: string;             // hex, default white
  letterSpacing?: number;     // em
  lineHeight?: number;        // multiplier
  textShadowBlur?: number;    // px
  textShadowOpacity?: number; // 0-1
  overlayOpacity?: number;    // 0-1, darkness of overlay over video
  align?: Align;
}

export interface TextSegment {
  text: string;
  color?: string; // override de cor pra essa palavra/trecho
}

export type IconName =
  | "arrow-down"
  | "arrow-up"
  | "arrow-right"
  | "star"
  | "play"
  | "check"
  | "x"
  | "fire"
  | "diamond"
  | "circle"
  | "triangle"
  | "line"
  | "quote"
  | "alert";

export type ElementShape =
  | "rectangle"
  | "circle"
  | "line"
  | "diamond"
  | "triangle"
  | "star"
  | "hexagon"
  | "arrow"
  | "octagon"
  | "heart"
  | "plus"
  | "icon";

export type EntryAnimation =
  | "none"
  | "fade"
  | "slide-up"
  | "slide-down"
  | "slide-left"
  | "slide-right"
  | "scale";

export interface PageElement {
  id: string;
  shape: ElementShape;
  x: number;     // 0-1 — top-left X em fração da largura
  y: number;     // 0-1 — top-left Y em fração da altura
  w: number;     // 0-1 — largura em fração
  h: number;     // 0-1 — altura em fração
  color: string;
  opacity: number;     // 0-1
  rotation: number;    // graus
  borderRadius?: number; // 0-50 (%) — só pra retângulo
  // V6: sombra (drop-shadow)
  shadowBlur?: number;    // 0-50 px (canvas-space)
  shadowOpacity?: number; // 0-1
  // V6: texto dentro do elemento (só faz sentido em rectangle/circle)
  text?: string;
  textColor?: string;
  textSize?: number;     // px (canvas-space)
  textBold?: boolean;
  textUppercase?: boolean;
  // V8: animação de entrada
  entry?: EntryAnimation;
  entryDuration?: number; // frames (default 12 ≈ 0.4s)
  entryDelay?: number;    // frames (default 0)
  // V9: pra shape="icon" — qual ícone do set curado renderizar
  iconName?: IconName;
}

export interface PageDraft extends PageStyle {
  text: string;
  weight: BeatWeight;
  query: string;
  tags: string[];
  videoSrc: string;
  animation: AnimationKind;
  hideText?: boolean;
  // V4: cor por palavra. Se presente, sobrescreve `text` no render.
  // 2D: outer = linhas, inner = segments por linha.
  segments?: TextSegment[][];
  // V4: ícones decorativos
  iconAbove?: IconName;
  iconBelow?: IconName;
  iconColor?: string;
  // V4: transforms do vídeo de fundo
  videoZoom?: number; // 1 = sem zoom, 1.5 = 50% mais perto
  videoFlipH?: boolean;
  videoFlipV?: boolean;
  videoTrimStart?: number; // segundos pra pular do início do clip
  // V5: shapes/elementos sobre o vídeo (sombra, retângulo de destaque, etc)
  elements?: PageElement[];
  // V9: posição/tamanho do vídeo de fundo (default = preenche canvas)
  videoX?: number; // 0-1 default 0
  videoY?: number; // 0-1 default 0
  videoW?: number; // 0-1 default 1
  videoH?: number; // 0-1 default 1
}

export type ColorFilter =
  | "neutro"
  | "vermelho"
  | "verde"
  | "preto"
  | "dourado"
  | "azul";

/**
 * Template visual do projeto — escolhido no brand brief, aplica
 * defaults coerentes nas páginas geradas.
 */
export type TemplateStyle = "classico" | "destaque" | "cinema";

export interface AdDraft {
  number: number;
  padrao: Padrao;
  pages: PageDraft[];
}

export interface ProjectStyle {
  toneFilter: ToneFilter;
  vibe: Vibe;
  baseColor: string;
  accentColor: string;
  baseFontSize: number;
  baseLetterSpacing: number;
  baseLineHeight: number;
  baseShadowBlur: number;
  baseShadowOpacity: number;
  baseOverlayOpacity: number;
  baseAlign: Align;
  colorFilter: ColorFilter;
}

export interface ProcessingState {
  status: "pending" | "in_progress" | "complete" | "error";
  currentAdIndex: number; // 0-based
  totalAds: number;
  message?: string;
  errors?: string[];
  // pra retry após redeploy: salvamos a copy original + opções
  source?: string;
  pageCount?: number;
}

export interface ProjectDraft extends ProjectStyle {
  id: string;
  cliente: string;
  nicho: string;
  nome: string;
  format: Format;
  language: Lang;
  mood: Mood;
  audience: Audience;
  fontHook: string;
  fontTransition: string;
  template?: TemplateStyle;
  ads: AdDraft[];
  createdAt: number;
  updatedAt: number;
  processing?: ProcessingState;
}

export type AssetKind = "image" | "video";

export type AssetBeatType = BeatWeight | "any";

export interface ClientAsset {
  id: string;
  filename: string;
  filepath: string;
  type: AssetKind;
  ad: number | null;
  beatType: AssetBeatType;
  tags: string[];
  uploadedAt: number;
}

export interface MoodAudience {
  mood: Mood;
  audience: Audience;
}

export interface GenerateRequest {
  source: string;
  mood: Mood;
  audience: Audience;
  language: Lang;
  format: Format;
  fontHook: string;
  fontTransition: string;
  cliente?: string;
  nicho?: string;
  nome?: string;
  // brand brief — visual styling defaults
  toneFilter?: ToneFilter;
  vibe?: Vibe;
  baseColor?: string;
  accentColor?: string;
  baseFontSize?: number;
  baseLetterSpacing?: number;
  baseLineHeight?: number;
  baseShadowBlur?: number;
  baseShadowOpacity?: number;
  baseOverlayOpacity?: number;
  baseAlign?: Align;
  colorFilter?: ColorFilter;
  template?: TemplateStyle;
}

export interface GenerateResultAd {
  number: number;
  padrao: Padrao;
  beats: Beat[];
  outputPath?: string;
  error?: string;
}

export interface GenerateResult {
  cliente: string;
  nicho: string;
  nome: string;
  ads: GenerateResultAd[];
}
