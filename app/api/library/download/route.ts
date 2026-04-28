import { NextResponse } from "next/server";
import { promises as fs, createWriteStream } from "node:fs";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { slugify } from "../../../../lib/video-library";
import { storagePath } from "../../../../lib/storage";

export const runtime = "nodejs";
export const maxDuration = 120;

// IMPORTANTE: usa STORAGE_ROOT (= /data no Railway) — não process.cwd()
// que aponta pra /app (read-only / não bate com /api/local-video).
const CACHE_ROOT = storagePath("video-cache");
const BY_QUERY_DIR = join(CACHE_ROOT, "by-query");

interface Body {
  fileUrl: string;
  pexelsId: number;
  query: string;
}

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 });
  }
  if (!body.fileUrl || !body.query) {
    return NextResponse.json(
      { ok: false, error: "fileUrl e query obrigatórios" },
      { status: 400 },
    );
  }
  const slug = slugify(body.query);
  const dir = join(BY_QUERY_DIR, slug);
  await fs.mkdir(dir, { recursive: true });
  const dest = join(dir, `pexels_${body.pexelsId}.mp4`);
  try {
    await fs.access(dest);
    return NextResponse.json({ ok: true, path: dest, alreadyCached: true });
  } catch {
    // not present → download
  }
  try {
    const res = await fetch(body.fileUrl);
    if (!res.ok || !res.body) {
      throw new Error(`Pexels download falhou (${res.status})`);
    }
    const stream = Readable.fromWeb(res.body as never);
    await pipeline(stream, createWriteStream(dest));
    return NextResponse.json({ ok: true, path: dest, alreadyCached: false });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 },
    );
  }
}
