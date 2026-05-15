import { NextResponse } from "next/server";
import { listClientAssets } from "../../../lib/client-assets";
import { findSemanticAssetMatch } from "../../../lib/asset-matcher";
import { searchPexelsVideos, pickBestVideoFile } from "../../../lib/pexels";
import { dimensionsFor } from "../../../lib/video-library";
import type { Format } from "../../../lib/types";
import { localPathToHttpUrl } from "../../../lib/http-utils";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * V93: Quick-swap options — retorna ate 6 client-assets (priorizados
 * pela IA semantica) + 6 videos do Pexels (variedade) pra mostrar no
 * modal de troca rapida.
 *
 * Body: { sceneText, query, format, currentSrc, adNumber }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const sceneText = String(body.sceneText ?? "");
    const query = String(body.query ?? "");
    const format = (body.format ?? "9:16") as Format;
    const currentSrc = String(body.currentSrc ?? "");
    const adNumber = Number(body.adNumber ?? 1);

    // 1) Top 6 client-assets via IA semantica
    const allAssets = await listClientAssets();
    const eligible = allAssets.filter(
      (a) => a.type === "video" && (a.ad === null || a.ad === adNumber),
    );
    let clientAssets = eligible;
    if (eligible.length > 6 && (sceneText || query)) {
      // Pede pra IA escolher os 6 melhores
      const picks: typeof eligible = [];
      const pool = [...eligible];
      for (let i = 0; i < 6 && pool.length > 0; i++) {
        const match = await findSemanticAssetMatch({
          sceneText: sceneText || query,
          query,
          assets: pool,
          preferType: "video",
        });
        if (match.asset) {
          picks.push(match.asset);
          // Remove o escolhido pra próxima iteração pegar outro
          const idx = pool.findIndex((p) => p.id === match.asset!.id);
          if (idx >= 0) pool.splice(idx, 1);
        } else {
          // IA disse nenhum: para de iterar
          break;
        }
      }
      // Se IA pegou poucos, completa com os mais recentes do pool
      if (picks.length < 6) {
        const recent = pool.sort((a, b) => b.uploadedAt - a.uploadedAt);
        picks.push(...recent.slice(0, 6 - picks.length));
      }
      clientAssets = picks;
    } else {
      clientAssets = eligible
        .sort((a, b) => b.uploadedAt - a.uploadedAt)
        .slice(0, 6);
    }

    const clientFormatted = clientAssets.map((a) => ({
      type: "client" as const,
      id: a.id,
      filename: a.filename,
      filepath: a.filepath,
      url: localPathToHttpUrl(a.filepath),
      thumbnail: localPathToHttpUrl(a.filepath), // mesmo arquivo, browser usa <video> com poster
    }));

    // 2) Top 6 do Pexels — pra ter variedade alem dos meus
    const dims = dimensionsFor(format);
    const orientation: "portrait" | "landscape" | "square" =
      format === "9:16"
        ? "portrait"
        : format === "16:9"
          ? "landscape"
          : "square";
    let pexelsFormatted: Array<{
      type: "pexels";
      id: string;
      url: string;
      thumbnail: string;
    }> = [];
    if (query) {
      try {
        const videos = await searchPexelsVideos({
          query,
          orientation,
          perPage: 12,
        });
        const seen = new Set<string>();
        for (const v of videos) {
          if (pexelsFormatted.length >= 6) break;
          const file = pickBestVideoFile(v, dims);
          if (!file) continue;
          if (file.link === currentSrc) continue; // pula o atual
          if (seen.has(file.link)) continue;
          seen.add(file.link);
          pexelsFormatted.push({
            type: "pexels",
            id: String(v.id),
            url: file.link,
            thumbnail: v.image,
          });
        }
      } catch (err) {
        console.warn(`[quick-swap] Pexels falhou: ${(err as Error).message}`);
      }
    }

    return NextResponse.json({
      ok: true,
      clientAssets: clientFormatted,
      pexelsVideos: pexelsFormatted,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 },
    );
  }
}
