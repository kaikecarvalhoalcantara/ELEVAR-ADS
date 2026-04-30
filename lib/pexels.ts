import type { MoodAudience } from "./types";

const PEXELS_SEARCH_URL = "https://api.pexels.com/videos/search";

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
  // V32: per_page padrão 80 (máximo do Pexels). Antes era 15 → poucos resultados.
  const params = new URLSearchParams({
    query: args.query,
    orientation: args.orientation ?? "portrait",
    per_page: String(args.perPage ?? 80),
    page: String(args.page ?? 1),
  });
  const res = await fetch(`${PEXELS_SEARCH_URL}?${params.toString()}`, {
    headers: { Authorization: apiKey },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Pexels search falhou (${res.status}): ${text}`);
  }
  const data = (await res.json()) as PexelsSearchResponse;
  return data.videos;
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
