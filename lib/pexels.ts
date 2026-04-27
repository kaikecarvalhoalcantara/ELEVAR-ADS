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
}): Promise<PexelsVideo[]> {
  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey) {
    throw new Error("PEXELS_API_KEY ausente no .env.local");
  }
  const params = new URLSearchParams({
    query: args.query,
    orientation: args.orientation ?? "portrait",
    per_page: String(args.perPage ?? 15),
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
  const portrait = video.video_files.filter(
    (vf) => vf.height >= vf.width && vf.file_type === "video/mp4",
  );
  if (portrait.length === 0) {
    const fallback = video.video_files.find((vf) => vf.file_type === "video/mp4");
    return fallback ?? null;
  }
  let best = portrait[0]!;
  let bestScore = Infinity;
  for (const vf of portrait) {
    const widthDelta = Math.abs(vf.width - prefer.width);
    const heightDelta = Math.abs(vf.height - prefer.height);
    const score = widthDelta + heightDelta;
    if (score < bestScore) {
      bestScore = score;
      best = vf;
    }
  }
  return best;
}
