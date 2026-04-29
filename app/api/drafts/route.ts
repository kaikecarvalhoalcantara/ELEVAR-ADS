import { NextResponse } from "next/server";
import { listDrafts } from "../../../lib/drafts";
import { localPathToHttpUrl } from "../../../lib/http-utils";

export const runtime = "nodejs";

/**
 * V28: Lista todos os projetos salvos pra aba "Projetos salvos" da home.
 * Retorna versão enxuta (sem o conteúdo pesado de cada page) — só metadata
 * + 1 thumbnail por anúncio (videoUrl da primeira página) pra preview.
 */
export async function GET() {
  try {
    const drafts = await listDrafts();
    // Versão enxuta — ignora detalhes de cada page, só mantém metadata + 1 thumb
    const summary = drafts.map((d) => {
      const firstAd = d.ads?.[0];
      const firstPage = firstAd?.pages?.[0];
      const thumbnailUrl = firstPage?.videoSrc
        ? localPathToHttpUrl(firstPage.videoSrc)
        : null;
      return {
        id: d.id,
        cliente: d.cliente,
        nicho: d.nicho,
        nome: d.nome,
        format: d.format,
        adsCount: d.ads?.length ?? 0,
        pagesCount:
          d.ads?.reduce((n, a) => n + (a.pages?.length ?? 0), 0) ?? 0,
        thumbnailUrl,
        createdAt: d.createdAt,
        updatedAt: d.updatedAt,
        processingStatus: d.processing?.status ?? "complete",
        renderingStatus: d.rendering?.status ?? "idle",
        completedAdsCount: d.rendering?.completedAdNumbers?.length ?? 0,
      };
    });
    return NextResponse.json({ ok: true, drafts: summary });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 },
    );
  }
}
