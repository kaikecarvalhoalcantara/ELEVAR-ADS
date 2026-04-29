import { promises as fs } from "node:fs";
import { resolve } from "node:path";
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
  // V27: range aberto (bytes=N-) → vai até o final. Antes parseInt(undefined)
  // dava NaN e retornávamos null, fazendo o servidor mandar arquivo INTEIRO
  // em vez de partial content. Quebrava range requests do Chromium.
  const end = m[2] !== undefined ? parseInt(m[2], 10) : size - 1;
  if (isNaN(start) || isNaN(end)) return null;
  if (start > end || end >= size) return null;
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

/**
 * Lê o arquivo INTEIRO em memória via Buffer e retorna.
 * Tradeoff: usa mais RAM mas elimina race conditions com streams Web
 * (ERR_INVALID_STATE / Controller is already closed). Vídeos do Pexels
 * são geralmente 3-15MB — cabe em memória sem stress.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  try {
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

    // Lê tudo em memória — evita streams flaky com Remotion's Chromium
    const buffer = await fs.readFile(fullPath);

    if (range) {
      const sliced = buffer.subarray(range.start, range.end + 1);
      return new Response(sliced, {
        status: 206,
        headers: {
          "Content-Type": ct,
          "Content-Length": String(sliced.length),
          "Content-Range": `bytes ${range.start}-${range.end}/${stat.size}`,
          "Accept-Ranges": "bytes",
          "Cache-Control": "public, max-age=3600",
        },
      });
    }
    return new Response(buffer, {
      headers: {
        "Content-Type": ct,
        "Content-Length": String(buffer.length),
        "Accept-Ranges": "bytes",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (err) {
    console.error("[local-video] erro:", err);
    return new Response(`Internal: ${(err as Error).message}`, { status: 500 });
  }
}

export async function HEAD(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  try {
    const { path } = await params;
    const fullPath = safeJoin(path);
    if (!fullPath) return new Response(null, { status: 403 });
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
