import { cutIntoBeats } from "./beats";
import { planScenes } from "./scene-planner";
import { findBestAssetFor } from "./client-assets";
import { findOrFetchVideoForQuery } from "./video-library";
import { loadDraft, saveDraft } from "./drafts";
import { parseSourceDoc } from "./parser";
import { enrichPageWithTemplate } from "./template-presets";
import type {
  AnimationKind,
  Format,
  PageDraft,
  ParsedAd,
  ScenePlan,
} from "./types";

const ANIMATION_ROTATION: AnimationKind[] = [
  "teclado",
  "subir",
  "deslocar",
  "mesclar",
  "bloco",
];

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
  format: Format;
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

/**
 * Processa todos os ads pendentes de um draft, salvando o estado a cada
 * passo. Pode ser chamado várias vezes (idempotente — só processa o
 * próximo ad com pages.length === 0).
 *
 * Não joga exceções; erros são salvos em processing.errors.
 */
export async function processDraftAds(draftId: string): Promise<void> {
  const draft = await loadDraft(draftId);
  if (!draft) return;
  if (!draft.processing) return;
  if (draft.processing.status === "complete") return;

  const source = draft.processing.source;
  const pageCount = draft.processing.pageCount ?? 40;
  if (!source) {
    draft.processing.status = "error";
    draft.processing.errors = [...(draft.processing.errors ?? []), "source ausente"];
    await saveDraft(draft);
    return;
  }

  const parsed = parseSourceDoc(source);
  draft.processing.status = "in_progress";
  await saveDraft(draft);

  for (let i = 0; i < draft.ads.length; i++) {
    const adDraft = draft.ads[i]!;
    if (adDraft.pages.length > 0) continue; // já processado

    draft.processing.currentAdIndex = i;
    draft.processing.message = `Processando AD ${String(adDraft.number).padStart(2, "0")} (${i + 1}/${draft.ads.length})…`;
    await saveDraft(draft);

    const parsedAd = parsed.ads.find((a) => a.number === adDraft.number);
    if (!parsedAd) {
      draft.processing.errors = [
        ...(draft.processing.errors ?? []),
        `AD ${adDraft.number}: não encontrado no source`,
      ];
      continue;
    }

    try {
      const beats = await cutIntoBeats({
        copy: parsedAd.copy,
        pageCount,
        mood: draft.mood,
        audience: draft.audience,
        language: draft.language,
      });
      const scenes = await planScenes({
        ad: parsedAd as ParsedAd,
        beats,
        mood: draft.mood,
        audience: draft.audience,
        language: draft.language,
        toneFilter: draft.toneFilter,
        vibe: draft.vibe,
      });
      const wordlessIndices = pickWordlessIndices(scenes.length);
      const pages: PageDraft[] = [];
      for (let j = 0; j < scenes.length; j++) {
        const scene = scenes[j]!;
        const videoSrc = await videoForScene({
          adNumber: adDraft.number,
          scene,
          format: draft.format,
        });
        const trimmedText = scene.text.split(" / ").slice(0, 2).join(" / ");
        const basePage: PageDraft = {
          text: trimmedText,
          weight: scene.weight,
          query: scene.query,
          tags: scene.tags,
          videoSrc,
          animation: ANIMATION_ROTATION[j % ANIMATION_ROTATION.length]!,
          hideText: wordlessIndices.has(j),
        };
        const enriched = enrichPageWithTemplate(basePage, draft.template, {
          accentColor: draft.accentColor,
        });
        pages.push(enriched);
      }
      // Atualiza o ad e salva imediatamente
      const fresh = await loadDraft(draftId);
      if (!fresh) return;
      fresh.ads[i] = { ...adDraft, pages };
      fresh.processing = draft.processing;
      await saveDraft(fresh);
      draft.ads[i] = fresh.ads[i]!;
    } catch (err) {
      draft.processing.errors = [
        ...(draft.processing.errors ?? []),
        `AD ${adDraft.number}: ${(err as Error).message}`,
      ];
      await saveDraft(draft);
    }
  }

  // Marca completo
  const final = await loadDraft(draftId);
  if (final && final.processing) {
    final.processing.status = "complete";
    final.processing.message = "Concluído";
    final.processing.currentAdIndex = final.ads.length;
    await saveDraft(final);
  }
}
