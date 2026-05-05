import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { promises as fs } from "node:fs";
import { spawn } from "node:child_process";
import { join, resolve } from "node:path";
import type { AdProps, PageWithStyle } from "../remotion/AdComposition";
import type { AnimationKind, Format, PageStyle, ProjectStyle } from "./types";
import { storagePath } from "./storage";

const REMOTION_ENTRY = resolve(process.cwd(), "remotion/index.ts");
const OUTPUT_ROOT = storagePath("generated");

/**
 * V65: Converte filepath local em URL pro Remotion.
 *
 * MUDANÇA: antes usava HTTP via /api/local-video/... mas isso dependia
 * de PUBLIC_BASE_URL ou PORT corretos. No Railway, $PORT é variável
 * (8080 normalmente) e se não estiver setado direito, dá 404.
 *
 * Agora retorna `file://` direto. O Chromium do Remotion lê o arquivo
 * do filesystem do container — sem depender de servidor HTTP rodando
 * em porta específica. disableWebSecurity:true (já configurado) permite
 * file:// access. Bem mais robusto.
 *
 * URLs HTTP (Pexels CDN, etc) continuam passando direto.
 */
function localPathToHttpUrl(absPath: string): string {
  if (!absPath) return "";
  // Já é URL HTTP (Pexels CDN) → passa direto pro Remotion
  if (absPath.startsWith("http://") || absPath.startsWith("https://")) {
    return absPath;
  }
  // V65: filepath local → file:// direto. Encoding por path component.
  const segments = absPath
    .split(/[/\\]/)
    .filter(Boolean)
    .map((s) => encodeURIComponent(s));
  return `file:///${segments.join("/")}`;
}

let cachedBundleUrl: string | null = null;

async function getBundle(): Promise<string> {
  if (cachedBundleUrl) return cachedBundleUrl;
  cachedBundleUrl = await bundle({
    entryPoint: REMOTION_ENTRY,
    webpackOverride: (config) => config,
  });
  return cachedBundleUrl;
}

export interface RenderAdInput {
  beats: PageWithStyle[];
  videos: string[];
  animations?: AnimationKind[];
  format: Format;
  fontHook: string;
  fontTransition: string;
  projectStyle?: ProjectStyle;
  outputName: string;
  outputDir?: string;
}

// Tamanho de chunk em frames. 200 frames @ 24fps = ~8 segundos de vídeo.
// Cada chunk é renderizado num Chromium fresh — memória zera entre chunks.
const CHUNK_FRAMES = 200;

function ffmpegConcat(chunks: string[], outputPath: string): Promise<void> {
  return new Promise((resolveP, rejectP) => {
    if (chunks.length === 0) {
      rejectP(new Error("Nenhum chunk pra concatenar"));
      return;
    }
    if (chunks.length === 1) {
      // Move direto, sem concat
      fs.rename(chunks[0]!, outputPath)
        .then(() => resolveP())
        .catch(rejectP);
      return;
    }
    const listPath = `${outputPath}.concat.txt`;
    const listContent = chunks.map((c) => `file '${c.replace(/'/g, "'\\''")}'`).join("\n");
    fs.writeFile(listPath, listContent, "utf8")
      .then(() => {
        const proc = spawn("ffmpeg", [
          "-y",
          "-f",
          "concat",
          "-safe",
          "0",
          "-i",
          listPath,
          "-c",
          "copy",
          outputPath,
        ]);
        let stderr = "";
        proc.stderr.on("data", (d) => {
          stderr += d.toString();
        });
        proc.on("close", async (code) => {
          await fs.unlink(listPath).catch(() => undefined);
          if (code === 0) resolveP();
          else rejectP(new Error(`ffmpeg concat exit ${code}: ${stderr.slice(-500)}`));
        });
        proc.on("error", rejectP);
      })
      .catch(rejectP);
  });
}

export async function renderAd(input: RenderAdInput): Promise<string> {
  const bundleUrl = await getBundle();
  const httpVideos = input.videos.map((p) => localPathToHttpUrl(p));
  const inputProps: AdProps = {
    beats: input.beats,
    videos: httpVideos,
    animations: input.animations,
    format: input.format,
    fontHook: input.fontHook,
    fontTransition: input.fontTransition,
    projectStyle: input.projectStyle,
  };
  const propsForRemotion = inputProps as unknown as Record<string, unknown>;
  const composition = await selectComposition({
    serveUrl: bundleUrl,
    id: "Ad-9x16",
    inputProps: propsForRemotion,
  });
  const outDir = input.outputDir ? resolve(input.outputDir) : OUTPUT_ROOT;
  await fs.mkdir(outDir, { recursive: true });
  const outputLocation = join(outDir, `${input.outputName}.mp4`);
  const totalFrames = composition.durationInFrames;
  const chunkCount = Math.ceil(totalFrames / CHUNK_FRAMES);
  console.log(
    `[render] start "${input.outputName}" — ${totalFrames} frames em ${chunkCount} chunks`,
  );

  const chunkPaths: string[] = [];
  try {
    for (let i = 0; i < chunkCount; i++) {
      const startFrame = i * CHUNK_FRAMES;
      const endFrame = Math.min(startFrame + CHUNK_FRAMES - 1, totalFrames - 1);
      const chunkPath = `${outputLocation}.chunk-${String(i).padStart(3, "0")}.mp4`;
      console.log(
        `[render] chunk ${i + 1}/${chunkCount} (frames ${startFrame}-${endFrame})`,
      );
      await renderMedia({
        composition,
        serveUrl: bundleUrl,
        codec: "h264",
        outputLocation: chunkPath,
        inputProps: propsForRemotion,
        frameRange: [startFrame, endFrame],
        concurrency: 1,
        // CRF (qualidade variável) — mais previsível que bitrate fixo.
        // 23-26 é qualidade alta, 27-30 é boa, 30+ é compressivo.
        crf: 23,
        pixelFormat: "yuv420p",
        imageFormat: "jpeg",
        jpegQuality: 85,
        chromiumOptions: {
          gl: "swangle",
          headless: true,
          disableWebSecurity: true,
          ignoreCertificateErrors: true,
          enableMultiProcessOnLinux: false,
        },
        browserExecutable: process.env.REMOTION_BROWSER_EXECUTABLE || undefined,
        // V54: timeout aumentado de 180s pra 300s (5 min). Vídeos importados
        // grandes (Pinterest/WhatsApp) podem demorar mais que 3min pra
        // carregar via HTTP. Combinado com OffthreadVideo (que evita o
        // delayRender no carregamento inicial), elimina o erro
        // "delayRender Loading Html5Video duration not cleared after Xms".
        timeoutInMilliseconds: 300000,
      });
      chunkPaths.push(chunkPath);
      // Sugere ao Node fazer GC depois de cada chunk
      if (global.gc) global.gc();
      console.log(`[render] ✓ chunk ${i + 1}/${chunkCount}`);
    }
    // Concatena chunks num único MP4 final
    console.log(`[render] concatenando ${chunkPaths.length} chunks…`);
    await ffmpegConcat(chunkPaths, outputLocation);
    // Cleanup chunks
    for (const p of chunkPaths) {
      await fs.unlink(p).catch(() => undefined);
    }
    console.log(`[render] ✓ "${input.outputName}" → ${outputLocation}`);
    return outputLocation;
  } catch (err) {
    // Cleanup chunks parciais
    for (const p of chunkPaths) {
      await fs.unlink(p).catch(() => undefined);
    }
    console.error(`[render] ✗ "${input.outputName}" falhou: ${(err as Error).message}`);
    throw err;
  }
}

/**
 * Computa o filepath canônico do MP4 renderizado pra um ad específico.
 * Usado tanto no render quanto nas rotas de download.
 */
export function mp4PathForAd(projectName: string, adNumber: number): string {
  const filename = `${projectName} - AD ${String(adNumber).padStart(2, "0")}.mp4`;
  return join(OUTPUT_ROOT, filename);
}

export function buildProjectName(args: {
  cliente: string;
  nicho: string;
  nome: string;
  date?: Date;
}): string {
  const d = args.date ?? new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const dateStr = `${yyyy}-${mm}-${dd}`;
  const safe = (s: string) =>
    s
      .toUpperCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^A-Z0-9 ]/g, "")
      .trim()
      .replace(/\s+/g, " ");
  return `${safe(args.cliente)} - ${safe(args.nicho)} - ${safe(args.nome)} - ${dateStr}`;
}
