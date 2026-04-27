import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { slugify } from "../../../../lib/video-library";
import { storagePath } from "../../../../lib/storage";

export const runtime = "nodejs";

const CACHE_ROOT = storagePath("video-cache");
const BY_QUERY_DIR = join(CACHE_ROOT, "by-query");

async function listMp4s(dir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dir);
    return entries.filter((e) => e.toLowerCase().endsWith(".mp4")).map((e) =>
      join(dir, e),
    );
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = url.searchParams.get("query");
  if (!query) {
    return NextResponse.json({ ok: false, error: "query ausente" }, { status: 400 });
  }
  const slug = slugify(query);
  const dir = join(BY_QUERY_DIR, slug);
  const files = await listMp4s(dir);
  return NextResponse.json({
    ok: true,
    query,
    slug,
    videos: files.map((f) => ({
      path: f,
      filename: f.split(/[/\\]/).pop(),
    })),
  });
}
