import { NextResponse } from "next/server";
import { parseSourceDoc } from "../../../lib/parser";
import { newDraftId, saveDraft } from "../../../lib/drafts";
import { defaultProjectStyle } from "../../../lib/style-defaults";
import { templateProjectOverrides } from "../../../lib/template-presets";
import { processDraftAds } from "../../../lib/process-ads";
import type {
  AdDraft,
  GenerateRequest,
  ProjectDraft,
  ToneFilter,
  Vibe,
} from "../../../lib/types";

export const runtime = "nodejs";
export const maxDuration = 60; // só pra criar skeleton + disparar worker

const PAGES_PER_AD = 40;

export async function POST(request: Request) {
  let body: GenerateRequest;
  try {
    body = (await request.json()) as GenerateRequest;
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 });
  }
  if (!body.source || body.source.trim().length < 50) {
    return NextResponse.json(
      { ok: false, error: "Cole a copy completa no campo 'source'." },
      { status: 400 },
    );
  }
  const parsed = parseSourceDoc(body.source);
  const cliente = body.cliente?.trim() || parsed.cliente || "CLIENTE";
  const nicho = body.nicho?.trim() || parsed.nicho || "NICHO";
  const nome = body.nome?.trim() || parsed.nome || "PROJETO";

  if (parsed.ads.length === 0) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Nenhum anúncio encontrado. Verifique se o doc tem cabeçalhos 'AD 01 - PADRÃO HDCPY' e marcador 'ANÚNCIO COMPLETO'.",
      },
      { status: 400 },
    );
  }

  const toneFilter: ToneFilter = body.toneFilter ?? "escuro";
  const vibe: Vibe = body.vibe ?? "cinematografico";
  const projectStyle = defaultProjectStyle({ toneFilter, vibe });
  if (body.baseColor) projectStyle.baseColor = body.baseColor;
  if (body.accentColor) projectStyle.accentColor = body.accentColor;
  if (typeof body.baseFontSize === "number") projectStyle.baseFontSize = body.baseFontSize;
  if (typeof body.baseLetterSpacing === "number") projectStyle.baseLetterSpacing = body.baseLetterSpacing;
  if (typeof body.baseLineHeight === "number") projectStyle.baseLineHeight = body.baseLineHeight;
  if (typeof body.baseShadowBlur === "number") projectStyle.baseShadowBlur = body.baseShadowBlur;
  if (typeof body.baseShadowOpacity === "number") projectStyle.baseShadowOpacity = body.baseShadowOpacity;
  if (typeof body.baseOverlayOpacity === "number") projectStyle.baseOverlayOpacity = body.baseOverlayOpacity;
  if (body.baseAlign) projectStyle.baseAlign = body.baseAlign;
  if (body.colorFilter) projectStyle.colorFilter = body.colorFilter;

  const template = body.template;
  if (template) {
    Object.assign(projectStyle, templateProjectOverrides(template));
  }

  // Cria SKELETON com ads vazios — processamento real roda em background
  const skeletonAds: AdDraft[] = parsed.ads.map((ad) => ({
    number: ad.number,
    padrao: ad.padrao,
    pages: [], // vazio — worker preenche depois
  }));

  const draft: ProjectDraft = {
    id: newDraftId(),
    cliente,
    nicho,
    nome,
    format: body.format,
    language: body.language,
    mood: body.mood,
    audience: body.audience,
    fontHook: body.fontHook,
    fontTransition: body.fontTransition,
    ...projectStyle,
    template,
    ads: skeletonAds,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    processing: {
      status: "pending",
      currentAdIndex: 0,
      totalAds: skeletonAds.length,
      source: body.source,
      pageCount: PAGES_PER_AD,
      message: "Aguardando processamento…",
    },
  };
  await saveDraft(draft);

  // Dispara worker em background — NÃO awaita.
  // O Node continua executando depois de retornar a response.
  void processDraftAds(draft.id).catch((err) => {
    console.error(`[processDraftAds ${draft.id}]`, err);
  });

  return NextResponse.json({ ok: true, draftId: draft.id });
}
