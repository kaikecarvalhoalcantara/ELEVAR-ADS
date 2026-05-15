/**
 * V92: Match SEMÂNTICO de assets via Claude IA.
 *
 * Antes: o app fazia match de assets do cliente por palavras-chave (tags).
 * Se o nome do arquivo fosse genérico (IMG_4823.jpg), perdia. E mesmo
 * com nomes bons, palavras-chave erram bastante (ex: "vergonha de tirar
 * a camisa" → query "shame man" → match com qualquer asset de homem).
 *
 * Agora: pega a FRASE do slide + lista de assets do cliente, manda pra
 * Claude IA, e a IA escolhe o asset que MELHOR ilustra o conteúdo.
 * Se nenhum combina razoavelmente, retorna null e o sistema cai pro
 * Pexels (fallback).
 *
 * Cache em memória — mesma combinação (texto + assets) não chama IA
 * de novo. Custo: ~$0.001 por chamada (Haiku é barato).
 */
import Anthropic from "@anthropic-ai/sdk";
import type { ClientAsset } from "./types";

const client = new Anthropic({ apiKey: process.env.CLAUDE_KEY });

export interface AssetMatchResult {
  asset: ClientAsset | null;
  reason: string;
  confidence: "high" | "medium" | "low" | "none";
}

// Cache em memória: chave = sceneText + IDs ordenados
const MATCH_CACHE = new Map<string, AssetMatchResult>();
const MATCH_CACHE_TTL_MS = 60 * 60 * 1000; // 1h
const MATCH_CACHE_TS = new Map<string, number>();

function cacheKey(sceneText: string, assets: ClientAsset[]): string {
  const ids = assets
    .map((a) => a.id)
    .sort()
    .join(",");
  return `${sceneText}|${ids}`;
}

/**
 * Limita o tamanho do contexto que vai pra IA. Se o user tem 500 assets,
 * passar todos quebraria o context window e ficaria caro. Pegamos 50
 * por chamada — os mais recentes primeiro, depois shuffle pra ter variedade.
 */
const MAX_ASSETS_PER_CALL = 50;

function pickAssetsToConsider(assets: ClientAsset[]): ClientAsset[] {
  if (assets.length <= MAX_ASSETS_PER_CALL) return assets;
  // Pega os 30 mais recentes + 20 aleatórios do resto
  const sorted = [...assets].sort((a, b) => b.uploadedAt - a.uploadedAt);
  const recent = sorted.slice(0, 30);
  const restPool = sorted.slice(30);
  for (let i = restPool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [restPool[i], restPool[j]] = [restPool[j]!, restPool[i]!];
  }
  return [...recent, ...restPool.slice(0, 20)];
}

function buildPrompt(args: {
  sceneText: string;
  query: string;
  assets: ClientAsset[];
}): string {
  const lines = args.assets
    .map((a, idx) => {
      const tags = a.tags && a.tags.length > 0 ? a.tags.join(", ") : "—";
      return `${idx + 1}. [${a.type}] "${a.filename}" — tags: ${tags}`;
    })
    .join("\n");
  return `Você é um diretor de arte escolhendo a melhor mídia pra ilustrar um slide de anúncio.

SLIDE: "${args.sceneText}"
QUERY (orientação visual): "${args.query}"

OPÇÕES DISPONÍVEIS (do banco do cliente):
${lines}

Escolha a opção que MELHOR ilustra o conteúdo do slide. Considere:
- Se a mídia ajuda o espectador a SENTIR o que o slide diz
- Se combina com o tom emocional da frase
- Match temático, não literal

Se NENHUMA opção combina razoavelmente bem, responda choice=null (deixa o sistema buscar online).

Responda APENAS com JSON puro neste formato:
{"choice": <número ou null>, "reason": "<frase curta>", "confidence": "high"|"medium"|"low"|"none"}`;
}

function tryParseJson(raw: string): {
  choice: number | null;
  reason?: string;
  confidence?: "high" | "medium" | "low" | "none";
} | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end < 0) return null;
  const slice = raw.slice(start, end + 1);
  try {
    return JSON.parse(slice);
  } catch {
    try {
      // Remove vírgulas trailing
      return JSON.parse(slice.replace(/,(\s*[}\]])/g, "$1"));
    } catch {
      return null;
    }
  }
}

export async function findSemanticAssetMatch(args: {
  sceneText: string;
  query: string;
  assets: ClientAsset[];
  preferType?: "video" | "image"; // se quiser forçar tipo
}): Promise<AssetMatchResult> {
  // Sem assets: nada pra escolher
  if (!args.assets || args.assets.length === 0) {
    return { asset: null, reason: "nenhum asset disponível", confidence: "none" };
  }

  // Filtra por tipo preferido se especificado
  let assets = args.assets;
  if (args.preferType) {
    const filtered = assets.filter((a) => a.type === args.preferType);
    if (filtered.length > 0) assets = filtered;
  }

  // Só 1 asset: usa direto (sem chamar IA pra economizar)
  if (assets.length === 1) {
    return {
      asset: assets[0]!,
      reason: "único asset disponível",
      confidence: "low",
    };
  }

  // Cache hit?
  const key = cacheKey(args.sceneText, assets);
  const cached = MATCH_CACHE.get(key);
  const ts = MATCH_CACHE_TS.get(key);
  if (cached && ts && Date.now() - ts < MATCH_CACHE_TTL_MS) {
    return cached;
  }

  // Sem CLAUDE_KEY: fallback graceful — sem IA, retorna null
  if (!process.env.CLAUDE_KEY) {
    console.warn(
      `[asset-matcher] CLAUDE_KEY ausente — pulando match IA, cai pro Pexels`,
    );
    return {
      asset: null,
      reason: "CLAUDE_KEY ausente",
      confidence: "none",
    };
  }

  const consider = pickAssetsToConsider(assets);

  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 200,
      messages: [
        {
          role: "user",
          content: buildPrompt({
            sceneText: args.sceneText,
            query: args.query,
            assets: consider,
          }),
        },
      ],
    });
    const block = response.content.find((b) => b.type === "text");
    if (!block || block.type !== "text") {
      throw new Error("Resposta sem texto");
    }
    const parsed = tryParseJson(block.text);
    if (!parsed) {
      throw new Error(`JSON inválido: ${block.text.slice(0, 100)}`);
    }
    if (parsed.choice === null || parsed.choice === undefined) {
      const result: AssetMatchResult = {
        asset: null,
        reason: parsed.reason ?? "IA achou que nenhum combina",
        confidence: "none",
      };
      MATCH_CACHE.set(key, result);
      MATCH_CACHE_TS.set(key, Date.now());
      return result;
    }
    const idx = parsed.choice - 1;
    if (idx < 0 || idx >= consider.length) {
      throw new Error(`Índice inválido: ${parsed.choice}`);
    }
    const result: AssetMatchResult = {
      asset: consider[idx]!,
      reason: parsed.reason ?? "IA escolheu",
      confidence: parsed.confidence ?? "medium",
    };
    MATCH_CACHE.set(key, result);
    MATCH_CACHE_TS.set(key, Date.now());
    return result;
  } catch (err) {
    console.error(
      `[asset-matcher] IA falhou: ${(err as Error).message} — fallback Pexels`,
    );
    return {
      asset: null,
      reason: `IA falhou: ${(err as Error).message}`,
      confidence: "none",
    };
  }
}
