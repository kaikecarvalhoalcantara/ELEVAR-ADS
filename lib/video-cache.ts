import { promises as fs } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { storagePath } from "./storage";

/**
 * V64: Cache local de vídeos do Pexels CDN antes do render.
 *
 * O Remotion durante o render baixa o vídeo via Chromium HTTP. Pexels CDN
 * às vezes falha (timeout, 403, throttling) → slide vira preto no MP4.
 *
 * Solução: ANTES do render, prefetch TODOS os vídeos pra disco local com
 * retry de até 3x. Render usa filepath local via /api/local-video.
 */

const CACHE_DIR = storagePath("video-cache");

async function ensureCacheDir(): Promise<void> {
  await fs.mkdir(CACHE_DIR, { recursive: true });
}

function urlToCacheFilename(url: string): string {
  const hash = createHash("sha1").update(url).digest("hex").slice(0, 16);
  // tenta extrair extensão da URL
  const match = url.match(/\.(mp4|mov|webm|m4v|jpg|jpeg|png|webp|gif)(?:\?|$)/i);
  const ext = match ? match[1]!.toLowerCase() : "mp4";
  return `${hash}.${ext}`;
}

/**
 * Baixa um vídeo HTTP e salva localmente. Se já existe no cache, retorna
 * o path direto sem rebaixar. Retry de 3x com backoff exponencial.
 */
export async function cacheVideoLocally(url: string): Promise<string> {
  if (!url) return "";
  // Se já é path local, retorna direto
  if (!url.startsWith("http://") && !url.startsWith("https://")) return url;

  await ensureCacheDir();
  const filename = urlToCacheFilename(url);
  const filepath = join(CACHE_DIR, filename);

  // Já no cache?
  try {
    const stat = await fs.stat(filepath);
    if (stat.size > 0) {
      console.log(`[video-cache] ✓ HIT ${filename} (${url.slice(0, 60)}…)`);
      return filepath;
    }
  } catch {
    // Não existe — vamos baixar
  }

  // Retry: 3 tentativas com backoff 1s, 3s, 9s
  let lastErr: Error | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) {
      const wait = Math.pow(3, attempt) * 1000;
      console.log(
        `[video-cache] retry ${attempt + 1}/3 em ${wait}ms (${url.slice(0, 60)}…)`,
      );
      await new Promise((r) => setTimeout(r, wait));
    }
    try {
      const res = await fetch(url, {
        // Timeout de 60s pra vídeos grandes
        signal: AbortSignal.timeout(60000),
      });
      if (!res.ok) {
        lastErr = new Error(`HTTP ${res.status}`);
        continue;
      }
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.byteLength === 0) {
        lastErr = new Error("Empty body");
        continue;
      }
      await fs.writeFile(filepath, buf);
      console.log(
        `[video-cache] ✓ baixado ${filename} (${(buf.byteLength / 1024 / 1024).toFixed(1)}MB)`,
      );
      return filepath;
    } catch (err) {
      lastErr = err as Error;
      console.warn(
        `[video-cache] tentativa ${attempt + 1} falhou: ${(err as Error).message}`,
      );
    }
  }

  // Falhou todas tentativas — retorna URL original (Remotion vai usar
  // o sanitize/fallback preto do BeatScene)
  console.error(
    `[video-cache] ✗ FALHOU 3x ${url.slice(0, 80)}… último erro: ${lastErr?.message}`,
  );
  return url; // será sanitizado pra "" no render-worker se for inválido
}

/**
 * Pré-baixa N vídeos em paralelo (max 4 simultâneos pra não sobrecarregar
 * a rede) e retorna array de paths locais.
 */
export async function prefetchVideos(urls: string[]): Promise<string[]> {
  const results = new Array<string>(urls.length);
  const queue = urls.map((url, idx) => ({ url, idx }));
  const PARALLEL = 4;
  const workers = Array.from({ length: PARALLEL }, async () => {
    while (queue.length > 0) {
      const item = queue.shift();
      if (!item) break;
      results[item.idx] = await cacheVideoLocally(item.url);
    }
  });
  await Promise.all(workers);
  return results;
}
