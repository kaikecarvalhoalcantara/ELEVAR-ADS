import { NextResponse } from "next/server";
import { loadDraft } from "../../../../../lib/drafts";
import { buildProjectName, renderAd } from "../../../../../lib/render";
import type { PageWithStyle } from "../../../../../remotion/AdComposition";
import type { ProjectStyle } from "../../../../../lib/types";

export const runtime = "nodejs";
export const maxDuration = 800;

interface Body {
  adNumbers?: number[]; // if omitted: render all
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let body: Body = {};
  try {
    body = (await request.json()) as Body;
  } catch {
    // empty body OK
  }
  const draft = await loadDraft(id);
  if (!draft) {
    return NextResponse.json({ ok: false, error: "Draft não encontrado" }, { status: 404 });
  }

  const wanted = body.adNumbers && body.adNumbers.length > 0
    ? draft.ads.filter((a) => body.adNumbers!.includes(a.number))
    : draft.ads;

  const projectName = buildProjectName({
    cliente: draft.cliente,
    nicho: draft.nicho,
    nome: draft.nome,
    date: new Date(draft.createdAt),
  });

  const results: { number: number; outputPath?: string; error?: string }[] = [];
  for (const ad of wanted) {
    if (ad.pages.length === 0) {
      results.push({ number: ad.number, error: "Sem páginas neste anúncio" });
      continue;
    }
    try {
      const beats: PageWithStyle[] = ad.pages.map((p) => ({
        text: p.text,
        weight: p.weight,
        fontSize: p.fontSize,
        color: p.color,
        letterSpacing: p.letterSpacing,
        lineHeight: p.lineHeight,
        textShadowBlur: p.textShadowBlur,
        textShadowOpacity: p.textShadowOpacity,
        overlayOpacity: p.overlayOpacity,
        align: p.align,
        hideText: p.hideText,
        segments: p.segments,
        iconAbove: p.iconAbove,
        iconBelow: p.iconBelow,
        iconColor: p.iconColor,
        videoZoom: p.videoZoom,
        videoFlipH: p.videoFlipH,
        videoFlipV: p.videoFlipV,
        videoTrimStart: p.videoTrimStart,
        elements: p.elements,
        videoX: p.videoX,
        videoY: p.videoY,
        videoW: p.videoW,
        videoH: p.videoH,
      }));
      const videos = ad.pages.map((p) => p.videoSrc);
      const animations = ad.pages.map((p) => p.animation);
      const projectStyle: ProjectStyle = {
        toneFilter: draft.toneFilter,
        vibe: draft.vibe,
        baseColor: draft.baseColor,
        accentColor: draft.accentColor,
        baseFontSize: draft.baseFontSize,
        baseLetterSpacing: draft.baseLetterSpacing,
        baseLineHeight: draft.baseLineHeight,
        baseShadowBlur: draft.baseShadowBlur,
        baseShadowOpacity: draft.baseShadowOpacity,
        baseOverlayOpacity: draft.baseOverlayOpacity,
        baseAlign: draft.baseAlign,
        colorFilter: draft.colorFilter ?? "neutro",
        template: draft.template,
      };
      const outputName = `${projectName} - AD ${String(ad.number).padStart(2, "0")}`;
      const outputPath = await renderAd({
        beats,
        videos,
        animations,
        format: draft.format,
        fontHook: draft.fontHook,
        fontTransition: draft.fontTransition,
        projectStyle,
        outputName,
      });
      results.push({ number: ad.number, outputPath });
    } catch (err) {
      results.push({ number: ad.number, error: (err as Error).message });
    }
  }

  return NextResponse.json({ ok: true, projectName, results });
}
