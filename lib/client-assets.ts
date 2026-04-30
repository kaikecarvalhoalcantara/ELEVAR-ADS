import { promises as fs } from "node:fs";
import { createHash } from "node:crypto";
import { extname, join } from "node:path";
import type {
  AssetBeatType,
  AssetKind,
  BeatWeight,
  ClientAsset,
} from "./types";
import { storagePath } from "./storage";

const ASSETS_ROOT = storagePath("client-assets");
const RAW_DIR = join(ASSETS_ROOT, "raw");
const META_FILE = join(ASSETS_ROOT, "metadata.json");

// V28: lista expandida de formatos — cobre Pinterest, TikTok, Instagram,
// YouTube downloads, etc. (mkv, avi, etc raramente funcionam no Remotion
// sem conversão, mas vamos aceitar; Chromium roda mp4/webm com mais
// confiança).
const VIDEO_EXT = new Set([
  ".mp4", ".mov", ".webm", ".m4v", ".mkv", ".avi", ".ogv", ".3gp",
]);
const IMAGE_EXT = new Set([
  ".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif", ".bmp", ".heic",
]);

const STOP_WORDS = new Set([
  "the", "of", "and", "a", "an", "to", "in", "on", "for", "with", "by",
  "do", "da", "de", "no", "na", "o", "a", "e", "os", "as", "para",
  "img", "image", "video", "vid", "clip", "final", "edit", "v1", "v2", "raw",
  "copy", "copia", "test", "teste",
]);

function sha1(input: string): string {
  return createHash("sha1").update(input).digest("hex").slice(0, 12);
}

function inferType(filename: string): AssetKind | null {
  const ext = extname(filename).toLowerCase();
  if (VIDEO_EXT.has(ext)) return "video";
  if (IMAGE_EXT.has(ext)) return "image";
  return null;
}

export function autoTag(filename: string): string[] {
  const base = filename.replace(/\.[^.]+$/, "");
  const tokens = base
    .toLowerCase()
    .split(/[\s_\-.]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && !STOP_WORDS.has(t) && !/^\d+$/.test(t));
  return Array.from(new Set(tokens)).slice(0, 6);
}

async function ensureDirs(): Promise<void> {
  await fs.mkdir(RAW_DIR, { recursive: true });
}

async function loadMetaMap(): Promise<Record<string, ClientAsset>> {
  await ensureDirs();
  try {
    const raw = await fs.readFile(META_FILE, "utf8");
    return JSON.parse(raw) as Record<string, ClientAsset>;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw err;
  }
}

async function saveMetaMap(map: Record<string, ClientAsset>): Promise<void> {
  await ensureDirs();
  await fs.writeFile(META_FILE, JSON.stringify(map, null, 2), "utf8");
}

export async function listClientAssets(): Promise<ClientAsset[]> {
  const map = await loadMetaMap();
  return Object.values(map).sort((a, b) => b.uploadedAt - a.uploadedAt);
}

export async function saveUploadedFile(args: {
  originalName: string;
  bytes: ArrayBuffer | Uint8Array;
}): Promise<ClientAsset> {
  const type = inferType(args.originalName);
  if (!type) {
    throw new Error(`Tipo de arquivo não suportado: ${args.originalName}`);
  }
  await ensureDirs();
  const id = sha1(`${args.originalName}-${Date.now()}-${Math.random()}`);
  const safeName = args.originalName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const stored = `${id}-${safeName}`;
  const filepath = join(RAW_DIR, stored);
  const buf = Buffer.from(args.bytes as ArrayBuffer);
  await fs.writeFile(filepath, buf);
  const asset: ClientAsset = {
    id,
    filename: args.originalName,
    filepath,
    type,
    ad: null,
    beatType: "any",
    tags: autoTag(args.originalName),
    uploadedAt: Date.now(),
  };
  const map = await loadMetaMap();
  map[id] = asset;
  await saveMetaMap(map);
  return asset;
}

export interface AssetUpdate {
  ad?: number | null;
  beatType?: AssetBeatType;
  tags?: string[];
}

export async function updateAsset(id: string, patch: AssetUpdate): Promise<ClientAsset> {
  const map = await loadMetaMap();
  const cur = map[id];
  if (!cur) throw new Error(`Asset não encontrado: ${id}`);
  const updated: ClientAsset = {
    ...cur,
    ad: patch.ad === undefined ? cur.ad : patch.ad,
    beatType: patch.beatType ?? cur.beatType,
    tags: patch.tags
      ? patch.tags.map((t) => t.toLowerCase().trim()).filter(Boolean)
      : cur.tags,
  };
  map[id] = updated;
  await saveMetaMap(map);
  return updated;
}

export async function deleteAsset(id: string): Promise<void> {
  const map = await loadMetaMap();
  const cur = map[id];
  if (!cur) return;
  try {
    await fs.unlink(cur.filepath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
  delete map[id];
  await saveMetaMap(map);
}

export interface AssetMatchInput {
  adNumber: number;
  weight: BeatWeight;
  tags: string[];
}

export async function findBestAssetFor(
  input: AssetMatchInput,
): Promise<ClientAsset | null> {
  const all = await listClientAssets();
  const candidates = all.filter((a) => {
    if (a.ad !== null && a.ad !== input.adNumber) return false;
    if (a.beatType !== "any" && a.beatType !== input.weight) return false;
    return true;
  });
  if (candidates.length === 0) return null;
  let best: ClientAsset | null = null;
  let bestScore = 0;
  for (const c of candidates) {
    const overlap = c.tags.filter((t) => input.tags.includes(t)).length;
    const adBonus = c.ad === input.adNumber ? 2 : 0;
    const weightBonus = c.beatType === input.weight ? 1 : 0;
    const score = overlap * 3 + adBonus + weightBonus;
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  // require at least one tag match OR a specific ad assignment
  return bestScore >= 1 ? best : null;
}
