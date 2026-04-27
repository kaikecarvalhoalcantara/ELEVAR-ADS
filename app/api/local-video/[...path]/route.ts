import { promises as fs, createReadStream } from "node:fs";
import { resolve } from "node:path";
import { Readable } from "node:stream";
import { getStorageRoot } from "../../../../lib/storage";

export const runtime = "nodejs";

function safeJoin(parts: string[]): string | null {
  const root = getStorageRoot();
  const decoded = parts.map((p) => decodeURIComponent(p));
  const full = resolve(root, ...decoded);
  if (!full.startsWith(root)) return null;
  return full;
}

function parseRange(
  header: string | null,
  size: number,
): { start: number; end: number } | null {
  if (!header) return null;
  const m = /bytes=(\d+)-(\d+)?/.exec(header);
  if (!m) return null;
  const start = parseInt(m[1]!, 10);
  const end = m[2] ? parseInt(m[2]!, 10) : size - 1;
  if (isNaN(start) || isNaN(end) || start > end || end >= size) return null;
  return { start, end };
}

const MIME: Record<string, string> = {
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".m4v": "video/mp4",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

function mimeFor(path: string): string {
  const m = /\.[^.]+$/.exec(path);
  return (m && MIME[m[0].toLowerCase()]) || "application/octet-stream";
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const fullPath = safeJoin(path);
  if (!fullPath) {
    return new Response("forbidden", { status: 403 });
  }
  let stat;
  try {
    stat = await fs.stat(fullPath);
  } catch {
    return new Response("not found", { status: 404 });
  }
  const ct = mimeFor(fullPath);
  const range = parseRange(request.headers.get("range"), stat.size);
  if (range) {
    const stream = createReadStream(fullPath, { start: range.start, end: range.end });
    return new Response(Readable.toWeb(stream) as ReadableStream, {
      status: 206,
      headers: {
        "Content-Type": ct,
        "Content-Length": String(range.end - range.start + 1),
        "Content-Range": `bytes ${range.start}-${range.end}/${stat.size}`,
        "Accept-Ranges": "bytes",
      },
    });
  }
  const stream = createReadStream(fullPath);
  return new Response(Readable.toWeb(stream) as ReadableStream, {
    headers: {
      "Content-Type": ct,
      "Content-Length": String(stat.size),
      "Accept-Ranges": "bytes",
    },
  });
}

export async function HEAD(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const fullPath = safeJoin(path);
  if (!fullPath) return new Response(null, { status: 403 });
  try {
    const stat = await fs.stat(fullPath);
    return new Response(null, {
      headers: {
        "Content-Type": mimeFor(fullPath),
        "Content-Length": String(stat.size),
        "Accept-Ranges": "bytes",
      },
    });
  } catch {
    return new Response(null, { status: 404 });
  }
}
