import { NextResponse } from "next/server";
import { parseSourceDoc } from "../../../lib/parser";
import { cutIntoBeats } from "../../../lib/beats";
import { planScenes } from "../../../lib/scene-planner";
import { findBestAssetFor } from "../../../lib/client-assets";
import { findOrFetchVideoForQuery } from "../../../lib/video-library";
import { newDraftId, saveDraft } from "../../../lib/drafts";
import { defaultProjectStyle } from "../../../lib/style-defaults";
import type {
  AdDraft,
  AnimationKind,
  GenerateRequest,
  PageDraft,
  ProjectDraft,
  ScenePlan,
  ToneFilter,
  Vibe,
} from "../../../lib/types";

export const runtime = "nodejs";
export const maxDuration = 800;

const PAGES_PER_AD = 40; // alvo aproximado — cortes rápidos efeito dopamina
const ANIMATION_ROTATION: AnimationKind[] = [
  "teclado",
  "subir",
  "deslocar",
  "mesclar",
  "bloco",
];

/**
 * Escolhe ~35% das páginas pra serem "wordless" (sem texto, vídeo fala por
 * si só). Exclui as 2 primeiras (gancho) e as 2 últimas (CTA), e tenta não
 * deixar 2 wordless consecutivas pra manter o pulso visual.
 */
function pickWordlessIndices(total: number): Set<number> {
  const result = new Set<number>();
  if (total < 8) return result;
  const targetCount = Math.max(1, Math.floor((total - 4) * 0.35));
  const pool: number[] = [];
  for (let i = 2; i < total - 2; i++) pool.push(i);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  for (const idx of pool) {
    if (result.size >= targetCount) break;
    if (result.has(idx - 1) || result.has(idx + 1)) continue;
    result.add(idx);
  }
  return result;
}

async function videoForScene(args: {
  adNumber: number;
  scene: ScenePlan;
  format: GenerateRequest["format"];
}): Promise<string> {
  const asset = await findBestAssetFor({
    adNumber: args.adNumber,
    weight: args.scene.weight,
    tags: args.scene.tags,
  });
  if (asset && asset.type === "video") return asset.filepath;
  const v = await findOrFetchVideoForQuery({
    query: args.scene.query,
    format: args.format,
  });
  return v ?? "";
}

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

  const ads: AdDraft[] = [];
  for (const ad of parsed.ads) {
    try {
      const beats = await cutIntoBeats({
        copy: ad.copy,
        pageCount: PAGES_PER_AD,
        mood: body.mood,
        audience: body.audience,
        language: body.language,
      });
      const scenes = await planScenes({
        ad,
        beats,
        mood: body.mood,
        audience: body.audience,
        language: body.language,
        toneFilter,
        vibe,
      });
      const pages: PageDraft[] = [];
      // 20% das páginas viram "wordless" (vídeo fala por si só).
      // Excluímos primeiras 2 (gancho) e últimas 2 (CTA) — esses sempre têm texto.
      const wordlessIndices = pickWordlessIndices(scenes.length);
      for (let i = 0; i < scenes.length; i++) {
        const scene = scenes[i]!;
        const videoSrc = await videoForScene({
          adNumber: ad.number,
          scene,
          format: body.format,
        });
        const trimmedText = scene.text.split(" / ").slice(0, 2).join(" / ");
        pages.push({
          text: trimmedText,
          weight: scene.weight,
          query: scene.query,
          tags: scene.tags,
          videoSrc,
          animation: ANIMATION_ROTATION[i % ANIMATION_ROTATION.length]!,
          hideText: wordlessIndices.has(i),
        });
      }
      ads.push({ number: ad.number, padrao: ad.padrao, pages });
    } catch (err) {
      ads.push({ number: ad.number, padrao: ad.padrao, pages: [] });
      console.error(`Erro montando AD ${ad.number}: ${(err as Error).message}`);
    }
  }

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
    ads,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  await saveDraft(draft);
  return NextResponse.json({ ok: true, draftId: draft.id });
}
