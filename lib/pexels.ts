import type { MoodAudience } from "./types";

const PEXELS_SEARCH_URL = "https://api.pexels.com/videos/search";
// V51: API de FOTOS do Pexels — endpoint diferente do de vídeos.
// Adicionado pra dar muito mais opções pro user (HD, profissional, etc).
const PEXELS_PHOTOS_URL = "https://api.pexels.com/v1/search";

export interface PexelsVideoFile {
  id: number;
  quality: string;
  file_type: string;
  width: number;
  height: number;
  fps: number;
  link: string;
}

export interface PexelsVideo {
  id: number;
  width: number;
  height: number;
  duration: number;
  url: string;
  image: string;
  video_files: PexelsVideoFile[];
}

export interface PexelsSearchResponse {
  page: number;
  per_page: number;
  total_results: number;
  url: string;
  videos: PexelsVideo[];
  next_page?: string;
}

const KEYWORDS_BY_COMBO: Record<string, string[]> = {
  sofisticado_masculino: [
    "luxury businessman dark cinematic",
    "elegant man portrait moody",
    "executive office night",
    "perfume bottle dark",
    "watch close up dark",
  ],
  sofisticado_feminino: [
    "luxury woman elegant dark",
    "high fashion portrait moody",
    "perfume woman cinematic",
  ],
  sofisticado_geral: [
    "luxury cinematic dark",
    "premium product close up",
  ],
  melancolico_feminino: [
    "lonely woman backlight cinematic",
    "woman silhouette window",
    "rain woman emotional",
    "candle quiet dark",
  ],
  melancolico_masculino: [
    "lonely man cinematic dark",
    "man silhouette window",
    "rain alone moody",
  ],
  melancolico_geral: [
    "moody silhouette emotional",
    "quiet melancholic cinematic",
  ],
  agressivo_masculino: [
    "man boxing dark intense",
    "fast running cinematic",
    "fire close up dark",
  ],
  agressivo_geral: [
    "intense action dark cinematic",
    "fire close up",
  ],
  tenso_masculino: [
    "man stress city dark",
    "clock ticking close up",
    "hourglass dark moody",
  ],
  tenso_geral: [
    "tension cinematic dark",
    "hourglass close up dark",
  ],
  sedutor_feminino: [
    "elegant woman seductive cinematic",
    "perfume seductive close up",
  ],
  sedutor_masculino: [
    "man seductive dark cinematic",
    "smoke man portrait",
  ],
  sedutor_geral: [
    "seductive perfume cinematic",
  ],
  calmo_geral: [
    "calm nature cinematic warm",
    "candle peace warm light",
  ],
  infantil_geral: [
    "child playing warm light",
    "kid laughing cinematic",
    "vitamin gummy close up",
    "mother child morning warm",
  ],
  infantil_feminino: [
    "mother child warm cinematic",
    "girl laughing morning",
  ],
};

export function keywordsFor({ mood, audience }: MoodAudience): string[] {
  const specific = KEYWORDS_BY_COMBO[`${mood}_${audience}`];
  if (specific) return specific;
  const general = KEYWORDS_BY_COMBO[`${mood}_geral`];
  if (general) return general;
  return [`${mood} cinematic dark`];
}

// V89: cache em memória de queries Pexels — reduz drasticamente os hits.
// Mesma query+orientation+page = mesmo result na sessão. TTL 1h.
const PEXELS_VIDEO_CACHE = new Map<
  string,
  { videos: PexelsVideo[]; ts: number }
>();
const PEXELS_PHOTO_CACHE = new Map<
  string,
  { photos: PexelsPhoto[]; ts: number }
>();
const PEXELS_CACHE_TTL_MS = 60 * 60 * 1000; // 1h

function cacheKey(
  query: string,
  orientation: string,
  page: number,
  perPage: number,
): string {
  return `${query}|${orientation}|p${page}|n${perPage}`;
}

/**
 * V89: Fetch com retry exponencial — detecta 429 (rate-limit) e
 * outros 5xx, espera 2s/4s/8s e tenta de novo. Antes dava null
 * direto e a UI mostrava "AD com 10/32 slides sem vídeo".
 */
async function fetchPexelsWithRetry(
  url: string,
  apiKey: string,
  maxAttempts = 3,
): Promise<Response> {
  let lastErr: Error | null = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await fetch(url, { headers: { Authorization: apiKey } });
    // Sucesso ou erro do cliente (4xx exceto 429) → não retry
    if (res.ok) return res;
    if (res.status === 429 || res.status >= 500) {
      const waitMs = 2000 * Math.pow(2, attempt - 1); // 2s, 4s, 8s
      console.warn(
        `[pexels] ${res.status} na attempt ${attempt}/${maxAttempts}, aguardando ${waitMs}ms…`,
      );
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }
    }
    // 4xx que não é 429: erro permanente, joga
    const text = await res.text();
    lastErr = new Error(`Pexels falhou (${res.status}): ${text}`);
    if (res.status !== 429 && res.status < 500) throw lastErr;
  }
  throw lastErr ?? new Error("Pexels falhou após retries");
}

export async function searchPexelsVideos(args: {
  query: string;
  orientation?: "portrait" | "landscape" | "square";
  perPage?: number;
  page?: number; // V32: paginação — page=1 é a primeira
}): Promise<PexelsVideo[]> {
  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey) {
    throw new Error("PEXELS_API_KEY ausente no .env.local");
  }
  const orientation = args.orientation ?? "portrait";
  const page = args.page ?? 1;
  const perPage = args.perPage ?? 80;

  // V89: cache hit?
  const key = cacheKey(args.query, orientation, page, perPage);
  const cached = PEXELS_VIDEO_CACHE.get(key);
  if (cached && Date.now() - cached.ts < PEXELS_CACHE_TTL_MS) {
    return cached.videos;
  }

  // V32: per_page padrão 80 (máximo do Pexels). Antes era 15 → poucos resultados.
  const params = new URLSearchParams({
    query: args.query,
    orientation,
    per_page: String(perPage),
    page: String(page),
  });
  const res = await fetchPexelsWithRetry(
    `${PEXELS_SEARCH_URL}?${params.toString()}`,
    apiKey,
  );
  const data = (await res.json()) as PexelsSearchResponse;
  PEXELS_VIDEO_CACHE.set(key, { videos: data.videos, ts: Date.now() });
  return data.videos;
}

// V51: Tipos da Pexels Photos API
export interface PexelsPhotoSrc {
  original: string;
  large2x: string;
  large: string;
  medium: string;
  portrait: string;
  landscape: string;
  small: string;
  tiny: string;
}

export interface PexelsPhoto {
  id: number;
  width: number;
  height: number;
  url: string;
  photographer: string;
  src: PexelsPhotoSrc;
  alt: string;
}

export interface PexelsPhotosResponse {
  page: number;
  per_page: number;
  total_results: number;
  photos: PexelsPhoto[];
  next_page?: string;
}

/**
 * V51: Busca FOTOS no Pexels — endpoint /v1/search.
 * Diferente de vídeos: retorna 80 fotos por página (max), com tamanhos
 * múltiplos pré-renderizados (medium, large, original).
 */
export async function searchPexelsPhotos(args: {
  query: string;
  orientation?: "portrait" | "landscape" | "square";
  perPage?: number;
  page?: number;
}): Promise<PexelsPhoto[]> {
  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey) {
    throw new Error("PEXELS_API_KEY ausente no .env.local");
  }
  const orientation = args.orientation ?? "portrait";
  const page = args.page ?? 1;
  const perPage = args.perPage ?? 80;

  // V89: cache hit?
  const key = cacheKey(args.query, orientation, page, perPage);
  const cached = PEXELS_PHOTO_CACHE.get(key);
  if (cached && Date.now() - cached.ts < PEXELS_CACHE_TTL_MS) {
    return cached.photos;
  }

  const params = new URLSearchParams({
    query: args.query,
    orientation,
    per_page: String(perPage),
    page: String(page),
  });
  const res = await fetchPexelsWithRetry(
    `${PEXELS_PHOTOS_URL}?${params.toString()}`,
    apiKey,
  );
  const data = (await res.json()) as PexelsPhotosResponse;
  PEXELS_PHOTO_CACHE.set(key, { photos: data.photos, ts: Date.now() });
  return data.photos;
}

/**
 * V51: Escolhe a melhor URL de imagem baseada nas dimensões alvo.
 * Pexels oferece 8 tamanhos pré-renderizados. Pegamos o menor que ainda
 * tenha resolução >= que o canvas (evita upscale/blur), com fallback no
 * "original" se nada bater.
 */
export function pickBestPhotoUrl(
  photo: PexelsPhoto,
  prefer: { width: number; height: number },
): string {
  const isPortrait = prefer.height >= prefer.width;
  // Pra portrait, "portrait" é otimizado (1280×1920); pra landscape, "landscape" (1920×1280)
  if (isPortrait && photo.src.portrait) return photo.src.portrait;
  if (!isPortrait && photo.src.landscape) return photo.src.landscape;
  // Fallback: large2x (geralmente 1880×∞) → large → original
  return photo.src.large2x ?? photo.src.large ?? photo.src.original;
}

export function pickBestVideoFile(
  video: PexelsVideo,
  prefer: { width: number; height: number },
): PexelsVideoFile | null {
  // V32: filtragem MENOS estrita — antes só retornava portrait+mp4 (filtro
  // duplo que zerava muitos resultados). Agora pega TODOS os mp4, prioriza
  // portrait via score (mas não exclui landscape).
  const mp4Files = video.video_files.filter((vf) => vf.file_type === "video/mp4");
  if (mp4Files.length === 0) {
    return video.video_files[0] ?? null;
  }

  let best = mp4Files[0]!;
  let bestScore = Infinity;
  for (const vf of mp4Files) {
    // Score: penaliza diferença de dimensão E penaliza orientação errada
    const widthDelta = Math.abs(vf.width - prefer.width);
    const heightDelta = Math.abs(vf.height - prefer.height);
    const isPortrait = vf.height >= vf.width;
    const wantPortrait = prefer.height >= prefer.width;
    const orientationPenalty = isPortrait === wantPortrait ? 0 : 200;
    const score = widthDelta + heightDelta + orientationPenalty;
    if (score < bestScore) {
      bestScore = score;
      best = vf;
    }
  }
  return best;
}
