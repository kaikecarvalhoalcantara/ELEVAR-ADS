import { createServer, type Server } from "node:http";
import { promises as fs, createReadStream } from "node:fs";
import { resolve, normalize } from "node:path";

/**
 * V67: Servidor HTTP simples spawnado SOMENTE durante o render.
 *
 * Por que? O Remotion exige URLs http(s):// e antes a gente apontava
 * pro próprio Next.js (http://127.0.0.1:$PORT/api/local-video/...).
 * Mas no Railway $PORT às vezes não é o que esperamos, ou o servidor
 * tá atrás de proxy que bloqueia 127.0.0.1.
 *
 * Solução: subir um http.Server local DEDICADO em uma porta efêmera
 * (port=0 → SO escolhe), servir os arquivos do storage diretamente,
 * passar a URL gerada pro Remotion. Após o render, fechar o servidor.
 *
 * Sem dependência de PORT, sem proxy, sem 404 — controle total.
 */
export interface StaticServerHandle {
  baseUrl: string; // ex: "http://127.0.0.1:54321"
  stop: () => Promise<void>;
}

export async function startStaticServer(
  rootDir: string,
): Promise<StaticServerHandle> {
  const root = resolve(rootDir);

  const server: Server = createServer(async (req, res) => {
    try {
      const reqUrl = req.url ?? "/";
      // Decode + normalize. Bloqueia path traversal (../).
      const decoded = decodeURIComponent(reqUrl.split("?")[0]!);
      const requested = normalize(decoded).replace(/^[/\\]+/, "");
      const fullPath = resolve(root, requested);
      if (!fullPath.startsWith(root)) {
        res.writeHead(403);
        res.end("forbidden");
        return;
      }
      let stat;
      try {
        stat = await fs.stat(fullPath);
      } catch {
        res.writeHead(404);
        res.end("not found");
        return;
      }
      if (!stat.isFile()) {
        res.writeHead(404);
        res.end("not a file");
        return;
      }

      const ext = fullPath.toLowerCase().match(/\.[^.]+$/)?.[0] ?? "";
      const ct =
        ext === ".mp4"
          ? "video/mp4"
          : ext === ".mov"
            ? "video/quicktime"
            : ext === ".webm"
              ? "video/webm"
              : ext === ".png"
                ? "image/png"
                : ext === ".jpg" || ext === ".jpeg"
                  ? "image/jpeg"
                  : ext === ".webp"
                    ? "image/webp"
                    : ext === ".gif"
                      ? "image/gif"
                      : "application/octet-stream";

      // Suporte a Range request — Remotion/Chromium pede ranges
      const range = req.headers.range;
      if (range) {
        const m = /bytes=(\d+)-(\d+)?/.exec(range);
        if (m) {
          const start = parseInt(m[1]!, 10);
          const end = m[2] !== undefined ? parseInt(m[2], 10) : stat.size - 1;
          if (
            isNaN(start) ||
            isNaN(end) ||
            start > end ||
            end >= stat.size
          ) {
            res.writeHead(416, {
              "Content-Range": `bytes */${stat.size}`,
            });
            res.end();
            return;
          }
          res.writeHead(206, {
            "Content-Type": ct,
            "Content-Length": String(end - start + 1),
            "Content-Range": `bytes ${start}-${end}/${stat.size}`,
            "Accept-Ranges": "bytes",
          });
          createReadStream(fullPath, { start, end }).pipe(res);
          return;
        }
      }
      res.writeHead(200, {
        "Content-Type": ct,
        "Content-Length": String(stat.size),
        "Accept-Ranges": "bytes",
      });
      createReadStream(fullPath).pipe(res);
    } catch (err) {
      res.writeHead(500);
      res.end(`internal: ${(err as Error).message}`);
    }
  });

  // Listen em porta efêmera (0 = SO escolhe)
  await new Promise<void>((resolveP, rejectP) => {
    server.listen(0, "127.0.0.1", () => resolveP());
    server.on("error", rejectP);
  });
  const addr = server.address();
  if (!addr || typeof addr === "string") {
    server.close();
    throw new Error("Não consegui pegar porta do servidor estático");
  }
  const baseUrl = `http://127.0.0.1:${addr.port}`;
  console.log(`[static-server] ✓ rodando em ${baseUrl} → ${root}`);

  return {
    baseUrl,
    stop: async () => {
      await new Promise<void>((resolveP) => {
        server.close(() => resolveP());
      });
      console.log(`[static-server] parado (${baseUrl})`);
    },
  };
}
