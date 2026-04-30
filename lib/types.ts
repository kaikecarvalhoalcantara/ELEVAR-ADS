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

export type AnimationKind =
  | "teclado"
  | "subir"
  | "deslocar"
  | "mesclar"
  | "bloco"
  // V19: Novas animações
  | "fade"
  | "escala"
  | "girar"
  | "explodir"
  | "balancar"
  | "flutuar";

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
  // V12: per-page override de cor da sombra + outline (defaults vêm do projeto)
  textShadowColor?: string;   // hex
  textStrokeColor?: string;   // hex
  textStrokeWidth?: number;   // 0..3
  // V16: arsenal de edição de texto per-page
  italic?: boolean;
  fontWeightOverride?: number;     // 100..900 (sobrescreve peso natural)
  underline?: boolean;
  strikethrough?: boolean;
  letterCase?: "none" | "upper" | "lower" | "capitalize";
  rotation?: number;               // -30..30 graus
  skewX?: number;                  // -20..20 graus
  textScaleX?: number;             // V23: 0.5..2 (default 1) — estica/encurta horizontalmente
  // V40: largura ATIVA da caixa de texto em % do canvas (ex: 1.4 = mais larga que 100%).
  // Quando definido, o texto faz reflow natural CSS (white-space: normal) em vez do
  // split manual em " / ". Estica → texto cabe em 1 linha; aperta → quebra em mais.
  textBoxWidth?: number;           // 0.3..2.0 — em fração do width do canvas
  // V16: glow + gradiente per-page (override do projeto)
  glowColor?: string;
  glowIntensity?: number;          // 0..1
  gradientEnabled?: boolean;
  gradientFrom?: string;
  gradientTo?: string;
  gradientAngle?: number;          // 0..360
  // V18: Remover vídeo + cor de fundo sólida
  videoRemoved?: boolean;          // true = sem vídeo, mostra backgroundColor
  backgroundColor?: string;        // hex, usado quando videoRemoved=true (default "#000000")
  // V17: Color grading per-page (estilo Canva — sliders sobre o vídeo)
  // Todos os defaults = "neutro" (sem alteração) → 0 ou 100 dependendo do tipo
  videoBrightness?: number;        // 50..150 (default 100 = neutro)
  videoContrast?: number;          // 50..150 (default 100)
  videoSaturation?: number;        // 0..200 (default 100)
  videoHue?: number;               // -180..180 graus (default 0)
  videoTemperature?: number;       // -100..100 (default 0 = neutro, neg=frio, pos=quente)
  videoVibrance?: number;          // -100..100 (default 0)
  videoHighlights?: number;        // -100..100 (default 0) — clareia/escurece tons claros
  videoShadows?: number;           // -100..100 (default 0) — clareia/escurece tons escuros
  videoWhites?: number;            // -100..100 (default 0) — extremo dos brancos
  videoBlacks?: number;            // -100..100 (default 0) — extremo dos pretos
  // V19: velocidade da animação
  animationSpeed?: number;          // 0.5..2 (default 1)
  animationEntryDuration?: number;  // frames (default 14)
  animationExitDuration?: number;   // frames (default 14)
  // V21: efeito visual da letra (preset estilo Canva)
  letterEffect?:
    | "none"
    | "projetada"   // drop shadow projetada
    | "brilhante"   // glow dourado
    | "eco"         // ghosts laterais
    | "contorno"    // só contorno (texto vazado)
    | "fundo"       // faixa colorida atrás
    | "desalinhado" // chromatic aberration
    | "vazado"      // hollow (stroke fino, sem fill)
    | "neon"        // glow forte multicor
    | "falha";      // glitch (RGB split forte)
  letterEffectIntensity?: number;   // 0..100 (default 50)
  letterEffectColor?: string;       // cor de destaque do efeito (hex)
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
  videoTrimEnd?: number;   // V21: segundos onde o clip deve PARAR (corta o final)
  videoPlaybackRate?: number; // V32: velocidade do vídeo (0.25 a 3, default 1)
  // V5: shapes/elementos sobre o vídeo (sombra, retângulo de destaque, etc)
  elements?: PageElement[];
  // V9: posição/tamanho do vídeo de fundo (default = preenche canvas)
  videoX?: number; // 0-1 default 0
  videoY?: number; // 0-1 default 0
  videoW?: number; // 0-1 default 1
  videoH?: number; // 0-1 default 1
  // V11: posição do texto — offset do centro (-0.5 a 0.5 = -50% a +50% do canvas).
  // 0,0 = centro. textOffsetY = -0.3 = 30% acima do centro. Default 0.
  textOffsetX?: number;
  textOffsetY?: number;
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
  template?: TemplateStyle;
  // V12: cor da sombra (default preto) + cor/largura do outline
  baseShadowColor?: string;   // hex, default "#000000"
  baseStrokeColor?: string;   // hex, default "#000000"
  baseStrokeWidth?: number;   // multiplier 0..3, default 1
  // V14: 5 efeitos avançados (todos opcionais, default off)
  glowColor?: string;         // hex, default "#ffd700" — aura em volta do texto
  glowIntensity?: number;     // 0..1, default 0 (off). Ex: 0.5 = aura média
  gradientEnabled?: boolean;  // default false
  gradientFrom?: string;      // hex, ex "#ffffff"
  gradientTo?: string;        // hex, ex "#d4af37"
  gradientAngle?: number;     // graus, default 180 (vertical)
  vignetteIntensity?: number; // 0..1, default 0 (off). Escurece cantos
  grainIntensity?: number;    // 0..1, default 0 (off). Noise de filme
  lightLeakColor?: string;    // hex, default "#ffd27a"
  lightLeakIntensity?: number; // 0..1, default 0 (off)
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

export interface RenderProgress {
  status: "idle" | "in_progress" | "complete" | "error";
  queueAdNumbers: number[]; // ads pra renderizar
  completedAdNumbers: number[]; // ads concluídos
  failedAdNumbers: { number: number; error: string }[]; // ads que falharam
  currentAdNumber?: number; // ad sendo renderizado agora
  currentChunk?: number; // chunk atual
  totalChunks?: number;
  message?: string;
  startedAt?: number;
  finishedAt?: number;
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
  // V34: usuário pode desativar a fonte de transição (usa fontHook em todos beats)
  transitionFontDisabled?: boolean;
  template?: TemplateStyle;
  ads: AdDraft[];
  createdAt: number;
  updatedAt: number;
  processing?: ProcessingState;
  rendering?: RenderProgress;
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
  // V12: cor da sombra + outline
  baseShadowColor?: string;
  baseStrokeColor?: string;
  baseStrokeWidth?: number;
  // V14: efeitos avançados
  glowColor?: string;
  glowIntensity?: number;
  gradientEnabled?: boolean;
  gradientFrom?: string;
  gradientTo?: string;
  gradientAngle?: number;
  vignetteIntensity?: number;
  grainIntensity?: number;
  lightLeakColor?: string;
  lightLeakIntensity?: number;
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
