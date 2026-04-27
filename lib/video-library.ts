import { promises as fs } from "node:fs";
import { createWriteStream } from "node:fs";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { Format } from "./types";
import { pickBestVideoFile, searchPexelsVideos } from "./pexels";
import { storagePath } from "./storage";

const CACHE_ROOT = storagePath("video-cache");
const BY_QUERY_DIR = join(CACHE_ROOT, "by-query");

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
  const slug = slugify(opts.query);
  const dir = join(BY_QUERY_DIR, slug);
  await fs.mkdir(dir, { recursive: true });

  const min = opts.minPerQuery ?? 3;
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
      perPage: 8,
    });
    for (const video of videos) {
      if ((await listMp4s(dir)).length >= min + 2) break;
      const file = pickBestVideoFile(video, dims);
      if (!file) continue;
      const dest = join(dir, `pexels_${video.id}.mp4`);
      try {
        await fs.access(dest);
        continue;
      } catch {
        // not present
      }
      try {
        await downloadTo(file.link, dest);
      } catch {
        // skip and try next
      }
    }
  } catch {
    // network failure — fall through to whatever's cached
  }
  cached = await listMp4s(dir);
  if (cached.length === 0) return null;
  return cached[Math.floor(Math.random() * cached.length)] ?? null;
}
