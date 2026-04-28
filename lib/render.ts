import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { promises as fs } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import type { AdProps, PageWithStyle } from "../remotion/AdComposition";
import type { AnimationKind, Format, PageStyle, ProjectStyle } from "./types";
import { getStorageRoot, storagePath } from "./storage";

const REMOTION_ENTRY = resolve(process.cwd(), "remotion/index.ts");
const OUTPUT_ROOT = storagePath("generated");
const PUBLIC_BASE_URL =
  process.env.PUBLIC_BASE_URL?.replace(/\/$/, "") ||
  `http://127.0.0.1:${process.env.PORT || 3000}`;

/**
 * Remotion only accepts http(s) URLs for video sources. Convert an absolute
 * file path inside the project into an HTTP URL served by /api/local-video/...
 */
function localPathToHttpUrl(absPath: string): string {
  if (!absPath) return "";
  // Já é URL HTTP (Pexels CDN) → passa direto pro Remotion
  if (absPath.startsWith("http://") || absPath.startsWith("https://")) {
    return absPath;
  }
  // Filepath local (client assets) → serve via /api/local-video
  const rel = relative(getStorageRoot(), absPath);
  if (rel.startsWith("..")) {
    throw new Error(`Caminho fora do storage: ${absPath}`);
  }
  const segments = rel
    .split(sep)
    .filter(Boolean)
    .map((s) => encodeURIComponent(s));
  return `${PUBLIC_BASE_URL}/api/local-video/${segments.join("/")}`;
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
  console.log(`[render] start "${input.outputName}" (${input.beats.length} beats)`);
  try {
    await renderMedia({
      composition,
      serveUrl: bundleUrl,
      codec: "h264",
      outputLocation,
      inputProps: propsForRemotion,
      // ECONOMIA TOTAL DE MEMÓRIA — pra não OOM kill no Railway:
      concurrency: 1, // 1 frame por vez
      crf: 30, // qualidade média-baixa (compressão maior)
      pixelFormat: "yuv420p",
      // JPEG em vez de PNG — frames 5x mais leves em memória
      imageFormat: "jpeg",
      jpegQuality: 80,
      // Codec ffmpeg mais leve
      videoBitrate: "1200k",
      chromiumOptions: {
        gl: "swangle",
        headless: true,
        disableWebSecurity: true,
        ignoreCertificateErrors: true,
        // Flags Chromium pra usar menos memória em container Linux
        enableMultiProcessOnLinux: false,
      },
      browserExecutable: process.env.REMOTION_BROWSER_EXECUTABLE || undefined,
      onProgress: ({ progress, renderedFrames }) => {
        if (renderedFrames % 30 === 0) {
          console.log(`[render] ${input.outputName}: ${Math.round(progress * 100)}% (${renderedFrames} frames)`);
        }
      },
      timeoutInMilliseconds: 240000, // 4min max
    });
    console.log(`[render] ✓ "${input.outputName}" → ${outputLocation}`);
    return outputLocation;
  } catch (err) {
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
