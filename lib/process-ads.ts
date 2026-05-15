import { cutIntoBeats } from "./beats";
import { planScenes } from "./scene-planner";
import { findBestAssetFor, listClientAssets } from "./client-assets";
import { findSemanticAssetMatch } from "./asset-matcher";
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

// V56: Rotação focada nas animações ESTILO CANVA — palavra/letra/linha por
// vez, com stagger spring. Antes incluía "teclado" e "bloco" que são menos
// dinâmicos. Agora prioriza "subir", "deslocar", "letra", "linha", "fade".
// Cada slide vai variar entre essas 5 — visual rítmico mas legível.
const ANIMATION_ROTATION: AnimationKind[] = [
  "subir",     // palavra por palavra subindo
  "deslocar",  // palavra por palavra vindo da esquerda
  "letra",     // letra por letra (mais dramático)
  "linha",     // linha inteira de uma vez (clean)
  "fade",      // fade da frase inteira (suave)
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

/**
 * V92: Cascata de escolha de mídia pro slide.
 *
 * 1. MATCH SEMÂNTICO via Claude IA (NOVO) — pega TODOS os assets do
 *    cliente e pergunta pra IA qual ilustra melhor a frase do slide.
 *    Acerta muito mais que palavras-chave.
 *
 * 2. MATCH POR TAGS (legado) — se IA falar "nenhum combina" ou falhar,
 *    cai pro match clássico baseado em tags+ad number.
 *
 * 3. PEXELS — último recurso, busca online.
 */
async function videoForScene(args: {
  adNumber: number;
  scene: ScenePlan;
  format: Format;
}): Promise<string> {
  // V92: Tenta IA primeiro
  try {
    const allAssets = await listClientAssets();
    // Filtra por ad number se houver, mas inclui os "any" também
    const candidates = allAssets.filter(
      (a) => a.ad === null || a.ad === args.adNumber,
    );
    if (candidates.length > 0) {
      const iaMatch = await findSemanticAssetMatch({
        sceneText: args.scene.text,
        query: args.scene.query,
        assets: candidates,
        preferType: "video", // prefere vídeo, mas aceita imagem
      });
      if (iaMatch.asset && iaMatch.confidence !== "none") {
        console.log(
          `[videoForScene] 🎯 IA escolheu "${iaMatch.asset.filename}" (${iaMatch.confidence}) — ${iaMatch.reason}`,
        );
        return iaMatch.asset.filepath;
      }
      if (iaMatch.reason) {
        console.log(
          `[videoForScene] IA passou (${iaMatch.confidence}): ${iaMatch.reason}`,
        );
      }
    }
  } catch (err) {
    // IA falhou: cai pra cascata clássica sem quebrar
    console.warn(
      `[videoForScene] match IA falhou: ${(err as Error).message}`,
    );
  }

  // V92 fallback: match clássico por tags
  const asset = await findBestAssetFor({
    adNumber: args.adNumber,
    weight: args.scene.weight,
    tags: args.scene.tags,
  });
  if (asset && asset.type === "video") {
    console.log(`[videoForScene] 🏷️ tag match "${asset.filename}"`);
    return asset.filepath;
  }

  // V92 fallback final: Pexels
  const v = await findOrFetchVideoForQuery({
    query: args.scene.query,
    format: args.format,
  });
  return v ?? "";
}

/**
 * V76: Processa UM ad — extraído do loop pra permitir retry. Recebe o
 * ad e devolve as pages geradas + contagem de vídeos OK.
 */
async function processSingleAd(args: {
  draftId: string;
  parsedAd: ParsedAd;
  adDraft: { number: number };
  draft: { mood: import("./types").Mood; audience: import("./types").Audience; language: import("./types").Lang; toneFilter?: import("./types").ToneFilter; vibe?: import("./types").Vibe; format: Format; template?: import("./types").TemplateStyle; accentColor: string };
  pageCount: number;
  attempt: number;
}): Promise<{ pages: PageDraft[]; videosOk: number; videosErr: number }> {
  const { draftId, parsedAd, adDraft, draft, pageCount, attempt } = args;
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
    ad: parsedAd,
    beats,
    mood: draft.mood,
    audience: draft.audience,
    language: draft.language,
    toneFilter: draft.toneFilter,
    vibe: draft.vibe,
  });
  console.log(
    `[worker ${draftId}] scenes=${scenes.length}, baixando vídeos (attempt ${attempt})…`,
  );
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
      if (videoSrc) videosOk++;
      else videosErr++;
    } catch (err) {
      console.error(
        `[worker ${draftId}] videoForScene p${j + 1} falhou: ${(err as Error).message}`,
      );
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
  return { pages, videosOk, videosErr };
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

    // V76: throttle entre ADs — pausa pra não bater rate limit do Pexels.
    // V89: reduzido de 5s pra 2s — com o cache de queries + retry expo
    // implementados na lib/pexels.ts, dá pra ir mais rápido. O retry
    // detecta 429 e espera 2s/4s/8s automaticamente, então não precisa
    // mais a margem grande aqui.
    if (i > 0) {
      console.log(`[worker ${draftId}] aguardando 2s antes do próximo AD…`);
      await new Promise((r) => setTimeout(r, 2000));
    }

    // V76: retry de até 2 tentativas. Se a 1ª resultar em <50% dos vídeos
    // preenchidos (sintoma típico de Pexels rate-limit), tenta de novo.
    let pages: PageDraft[] = [];
    let attempts = 0;
    const MAX_ATTEMPTS = 2;
    while (attempts < MAX_ATTEMPTS) {
      attempts++;
      try {
        const result = await processSingleAd({
          draftId,
          parsedAd: parsedAd as ParsedAd,
          adDraft,
          draft,
          pageCount,
          attempt: attempts,
        });
        pages = result.pages;
        const ratio = result.videosOk / Math.max(1, pages.length);
        console.log(
          `[worker ${draftId}] AD ${i+1} attempt ${attempts}: ${result.videosOk}/${pages.length} vídeos preenchidos (${Math.round(ratio * 100)}%)`,
        );
        // Se >50% dos vídeos OK, aceita. Senão tenta de novo.
        if (ratio >= 0.5 || attempts >= MAX_ATTEMPTS) break;
        console.warn(
          `[worker ${draftId}] AD ${i+1} attempt ${attempts}: cobertura baixa ${Math.round(ratio * 100)}%, retry em 8s…`,
        );
        await new Promise((r) => setTimeout(r, 8000));
      } catch (err) {
        const msg = `AD ${adDraft.number} attempt ${attempts}: ${(err as Error).message}`;
        console.error(`[worker ${draftId}] ${msg}`);
        if (attempts >= MAX_ATTEMPTS) {
          const cur = await loadDraft(draftId);
          if (cur && cur.processing) {
            cur.processing.errors = [...(cur.processing.errors ?? []), msg];
            await saveDraft(cur);
          }
          break;
        }
        // Espera mais tempo no retry após erro
        await new Promise((r) => setTimeout(r, 10000));
      }
    }

    if (pages.length > 0) {
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
