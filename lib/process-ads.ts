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
  console.log(`[worker ${draftId}] iniciado`);
  let draft = await loadDraft(draftId);
  if (!draft) {
    console.error(`[worker ${draftId}] draft NÃO ENCONTRADO no início`);
    return;
  }
  if (!draft.processing) {
    console.error(`[worker ${draftId}] draft sem processing state`);
    return;
  }
  if (draft.processing.status === "complete") {
    console.log(`[worker ${draftId}] já complete, saindo`);
    return;
  }

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
    // Recarrega draft a cada ad pra pegar mudanças concorrentes
    const fresh1 = await loadDraft(draftId);
    if (!fresh1) {
      console.error(`[worker ${draftId}] draft sumiu mid-process (ad ${i})`);
      return;
    }
    draft = fresh1;
    const adDraft = draft.ads[i]!;
    if (adDraft.pages.length > 0) {
      console.log(`[worker ${draftId}] ad ${i+1} já processado, skip`);
      continue;
    }

    draft.processing!.currentAdIndex = i;
    draft.processing!.message = `Processando AD ${String(adDraft.number).padStart(2, "0")} (${i + 1}/${draft.ads.length})…`;
    await saveDraft(draft);
    console.log(`[worker ${draftId}] ▶ AD ${i+1}/${draft.ads.length} (n=${adDraft.number})`);

    const parsedAd = parsed.ads.find((a) => a.number === adDraft.number);
    if (!parsedAd) {
      draft.processing!.errors = [
        ...(draft.processing!.errors ?? []),
        `AD ${adDraft.number}: não encontrado no source`,
      ];
      await saveDraft(draft);
      continue;
    }

    try {
      console.log(`[worker ${draftId}] cutIntoBeats…`);
      const beats = await cutIntoBeats({
        copy: parsedAd.copy,
        pageCount,
        mood: draft.mood,
        audience: draft.audience,
        language: draft.language,
      });
      console.log(`[worker ${draftId}] beats=${beats.length}, planScenes…`);
      const scenes = await planScenes({
        ad: parsedAd as ParsedAd,
        beats,
        mood: draft.mood,
        audience: draft.audience,
        language: draft.language,
        toneFilter: draft.toneFilter,
        vibe: draft.vibe,
      });
      console.log(`[worker ${draftId}] scenes=${scenes.length}, baixando vídeos…`);
      const wordlessIndices = pickWordlessIndices(scenes.length);
      const pages: PageDraft[] = [];
      let videosOk = 0;
      let videosErr = 0;
      for (let j = 0; j < scenes.length; j++) {
        const scene = scenes[j]!;
        let videoSrc = "";
        try {
          videoSrc = await videoForScene({
            adNumber: adDraft.number,
            scene,
            format: draft.format,
          });
          if (videoSrc) videosOk++; else videosErr++;
        } catch (err) {
          console.error(`[worker ${draftId}] videoForScene ad${i+1} p${j+1} falhou: ${(err as Error).message}`);
          videosErr++;
        }
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
      console.log(`[worker ${draftId}] AD ${i+1} pronto — videos: ${videosOk} ok / ${videosErr} sem`);
      // Atualiza o ad e salva imediatamente
      const fresh = await loadDraft(draftId);
      if (!fresh) {
        console.error(`[worker ${draftId}] draft sumiu antes de salvar AD ${i+1}`);
        return;
      }
      fresh.ads[i] = { ...adDraft, pages };
      fresh.processing = draft.processing;
      await saveDraft(fresh);
      draft = fresh;
    } catch (err) {
      const msg = `AD ${adDraft.number}: ${(err as Error).message}`;
      console.error(`[worker ${draftId}] ${msg}`);
      const cur = await loadDraft(draftId);
      if (cur && cur.processing) {
        cur.processing.errors = [...(cur.processing.errors ?? []), msg];
        await saveDraft(cur);
      }
    }
  }

  // Marca completo
  const final = await loadDraft(draftId);
  if (final && final.processing) {
    final.processing.status = "complete";
    final.processing.message = "Concluído";
    final.processing.currentAdIndex = final.ads.length;
    await saveDraft(final);
    console.log(`[worker ${draftId}] ✓ COMPLETO`);
  } else {
    console.error(`[worker ${draftId}] ✗ não pude marcar complete (draft sumiu)`);
  }
}
