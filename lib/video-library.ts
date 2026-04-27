import type { Format } from "./types";
import { pickBestVideoFile, searchPexelsVideos } from "./pexels";

const FORMAT_DIMS: Record<Format, { width: number; height: number }> = {
  "9:16": { width: 1080, height: 1920 },
  "4:5": { width: 1080, height: 1350 },
  "16:9": { width: 1920, height: 1080 },
  "1:1": { width: 1080, height: 1080 },
};

export function dimensionsFor(format: Format) {
  return FORMAT_DIMS[format];
}

export function slugify(query: string): string {
  return query
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export interface FetchOptions {
  query: string;
  format: Format;
  minPerQuery?: number; // legacy compat — ignorado
}

/**
 * Busca um vídeo no Pexels e retorna a URL DIRETA da CDN.
 * Zero download local, zero storage. Remotion baixa direto da Pexels
 * durante o render — eliminando todos os bugs de /api/local-video.
 */
export async function findOrFetchVideoForQuery(
  opts: FetchOptions,
): Promise<string | null> {
  const dims = dimensionsFor(opts.format);
  const orientation =
    opts.format === "9:16"
      ? "portrait"
      : opts.format === "16:9"
        ? "landscape"
        : "square";
  try {
    const videos = await searchPexelsVideos({
      query: opts.query,
      orientation,
      perPage: 3,
    });
    console.log(`[video-library] Pexels q="${opts.query}" → ${videos.length} results`);
    for (const video of videos) {
      const file = pickBestVideoFile(video, dims);
      if (!file) continue;
      // Retorna URL CDN direta — sem download
      console.log(`[video-library] ✓ ${opts.query} → ${file.link.split("/").pop()}`);
      return file.link;
    }
    console.warn(`[video-library] ZERO results pra "${opts.query}"`);
    return null;
  } catch (err) {
    console.error(`[video-library] Pexels search "${opts.query}" falhou: ${(err as Error).message}`);
    return null;
  }
}
