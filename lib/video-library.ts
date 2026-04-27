import { promises as fs } from "node:fs";
import { createWriteStream } from "node:fs";
import { join, resolve } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { Format } from "./types";
import { pickBestVideoFile, searchPexelsVideos } from "./pexels";
import { storagePath } from "./storage";

let CACHE_ROOT = storagePath("video-cache");
let BY_QUERY_DIR = join(CACHE_ROOT, "by-query");

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

async function tryMkdir(dir: string): Promise<boolean> {
  try {
    await fs.mkdir(dir, { recursive: true });
    return true;
  } catch (err) {
    console.error(`[video-library] mkdir ${dir} falhou: ${(err as Error).message}`);
    return false;
  }
}

/**
 * Garante que CACHE_ROOT seja escrevível em runtime.
 * Mesmo padrão do drafts.ts — se /data falhar, fallback pra /tmp.
 */
async function ensureCacheRoot(): Promise<void> {
  const ok = await tryMkdir(BY_QUERY_DIR);
  if (ok) return;
  const tmpRoot = resolve("/tmp/elevar-storage/video-cache");
  const tmpByQuery = join(tmpRoot, "by-query");
  console.warn(`[video-library] FALLBACK runtime — mudando CACHE_ROOT pra ${tmpRoot}`);
  const ok2 = await tryMkdir(tmpByQuery);
  if (!ok2) throw new Error(`Storage de vídeo indisponível`);
  CACHE_ROOT = tmpRoot;
  BY_QUERY_DIR = tmpByQuery;
}

async function listMp4s(dir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dir);
    return entries
      .filter((e) => e.toLowerCase().endsWith(".mp4"))
      .map((e) => join(dir, e));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

async function downloadTo(url: string, dest: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok || !res.body) {
    throw new Error(`Download falhou (${res.status}) ${url}`);
  }
  const file = createWriteStream(dest);
  const stream = Readable.fromWeb(res.body as never);
  await pipeline(stream, file);
}

export interface FetchOptions {
  query: string;
  format: Format;
  minPerQuery?: number;
}

export async function findOrFetchVideoForQuery(
  opts: FetchOptions,
): Promise<string | null> {
  await ensureCacheRoot();
  const slug = slugify(opts.query);
  const dir = join(BY_QUERY_DIR, slug);
  const mkOk = await tryMkdir(dir);
  if (!mkOk) {
    console.error(`[video-library] não consegui criar pasta da query: ${slug}`);
    return null;
  }

  // ECONOMIA DE MEMÓRIA: baixa só 1 vídeo por query — suficiente pra ter
  // o vídeo na cena. Com 40 queries por ad x 10 ads = 400 vídeos no MAX,
  // mas a maioria das queries se repete (cache hit), então fica em ~60-100
  // downloads totais.
  const min = opts.minPerQuery ?? 1;
  let cached = await listMp4s(dir);
  if (cached.length >= min) {
    return cached[Math.floor(Math.random() * cached.length)] ?? null;
  }

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
      perPage: 3, // só pega 3 results pra escolher
    });
    console.log(`[video-library] Pexels q="${opts.query}" → ${videos.length} results`);
    // Baixa só 1 vídeo (o primeiro válido)
    for (const video of videos) {
      const file = pickBestVideoFile(video, dims);
      if (!file) continue;
      const dest = join(dir, `pexels_${video.id}.mp4`);
      try {
        await fs.access(dest);
        // já cached, retorna ele
        return dest;
      } catch {
        // not present — baixa
      }
      try {
        await downloadTo(file.link, dest);
        console.log(`[video-library] ↓ ${slug}/pexels_${video.id}.mp4`);
        return dest;
      } catch (err) {
        console.error(`[video-library] download ${video.id} falhou: ${(err as Error).message}`);
      }
    }
  } catch (err) {
    console.error(`[video-library] Pexels search "${opts.query}" falhou: ${(err as Error).message}`);
  }
  cached = await listMp4s(dir);
  if (cached.length === 0) {
    console.warn(`[video-library] ZERO vídeos pra "${opts.query}"`);
    return null;
  }
  return cached[Math.floor(Math.random() * cached.length)] ?? null;
}
