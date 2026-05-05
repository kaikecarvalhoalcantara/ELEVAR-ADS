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

  let requestCount = 0;
  const server: Server = createServer(async (req, res) => {
    const id = ++requestCount;
    const method = req.method ?? "GET";
    const reqUrl = req.url ?? "/";
    // V69: Log COMPACTO de cada request — assim a gente vê EXATAMENTE
    // o que Remotion pede.
    const logLine = `[static-server] #${id} ${method} ${reqUrl.slice(0, 80)}`;
    try {
      // Decode + normalize. Bloqueia path traversal (../).
      const decoded = decodeURIComponent(reqUrl.split("?")[0]!);
      const requested = normalize(decoded).replace(/^[/\\]+/, "");
      const fullPath = resolve(root, requested);
      if (!fullPath.startsWith(root)) {
        console.log(`${logLine} → 403 forbidden`);
        res.writeHead(403);
        res.end("forbidden");
        return;
      }
      let stat;
      try {
        stat = await fs.stat(fullPath);
      } catch {
        console.log(`${logLine} → 404 not found (${fullPath})`);
        res.writeHead(404);
        res.end("not found");
        return;
      }
      if (!stat.isFile()) {
        console.log(`${logLine} → 404 not a file`);
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

      // V69: HEAD request — retorna headers sem body
      if (method === "HEAD") {
        res.writeHead(200, {
          "Content-Type": ct,
          "Content-Length": String(stat.size),
          "Accept-Ranges": "bytes",
        });
        res.end();
        console.log(`${logLine} → 200 HEAD ${ct} ${stat.size}b`);
        return;
      }

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
            console.log(`${logLine} → 416 invalid range ${range}`);
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
          console.log(`${logLine} → 206 ${range} ${end - start + 1}b`);
          return;
        }
      }
      res.writeHead(200, {
        "Content-Type": ct,
        "Content-Length": String(stat.size),
        "Accept-Ranges": "bytes",
      });
      createReadStream(fullPath).pipe(res);
      console.log(`${logLine} → 200 ${ct} ${stat.size}b`);
    } catch (err) {
      console.log(`${logLine} → 500 ${(err as Error).message}`);
      res.writeHead(500);
      res.end(`internal: ${(err as Error).message}`);
    }
  });

  // V68: Listen em 0.0.0.0 (todas interfaces) em porta efêmera.
  // 127.0.0.1 falhava em alguns casos no Railway/Chromium subprocess.
  await new Promise<void>((resolveP, rejectP) => {
    server.listen(0, "0.0.0.0", () => resolveP());
    server.on("error", rejectP);
  });
  const addr = server.address();
  if (!addr || typeof addr === "string") {
    server.close();
    throw new Error("Não consegui pegar porta do servidor estático");
  }
  // URL pra Chromium acessar — usa 127.0.0.1 (mesma máquina) na porta exposta
  const baseUrl = `http://127.0.0.1:${addr.port}`;
  console.log(
    `[static-server] ✓ rodando em ${baseUrl} (listen 0.0.0.0:${addr.port}) → ${root}`,
  );

  // Sanity check: faz um fetch interno pra confirmar que o servidor responde
  try {
    const testRes = await fetch(`${baseUrl}/__healthcheck__`, {
      signal: AbortSignal.timeout(3000),
    });
    console.log(
      `[static-server] healthcheck status=${testRes.status} (esperado 404 = OK, servidor responde)`,
    );
  } catch (err) {
    console.error(
      `[static-server] ✗ healthcheck falhou: ${(err as Error).message}`,
    );
  }

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
