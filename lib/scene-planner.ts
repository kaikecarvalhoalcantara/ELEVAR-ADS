import Anthropic from "@anthropic-ai/sdk";
import type {
  Audience,
  Beat,
  Lang,
  Mood,
  ParsedAd,
  ScenePlan,
} from "./types";

const client = new Anthropic({ apiKey: process.env.CLAUDE_KEY });

const SYSTEM = `Você é um diretor de criação de anúncios cinematográficos. Recebe uma copy e suas batidas (texto que aparece página por página). Pra cada batida, decide o VÍDEO DE FUNDO — uma query do Pexels (3-5 palavras em inglês) e 1-3 tags.

PRINCÍPIO 1 — NÃO LITERAL: não escolha imagem que mostra exatamente o que o texto diz. O objetivo é fazer o lead prestar atenção no que ele NÃO está vendo. Atmosfera/metáfora/ambiente > ilustração direta.
- "ele apertou minha mão" → ❌ "handshake" → ✅ "office hallway shadow" / "watch ticking dark"
- "perfume" → ❌ "perfume bottle" → ✅ "smoke moody dark" / "elegant man portrait"
- "minha mãe morrendo" → ❌ "elderly hospital" → ✅ "sunset window curtain" / "empty rocking chair"

PRINCÍPIO 2 — COERÊNCIA DE COR: o anúncio inteiro deve ter UMA paleta consistente, ditada pelo tone do projeto. Você adiciona modificadores de cor a TODAS as queries:
- toneFilter "escuro" / "premium" → sempre adiciona "dark moody" + cor escura específica (ex: "dark amber tones", "deep red shadow", "dark navy mood"). Nunca vídeos saturados/coloridos.
- toneFilter "suave" → "soft pastel", "warm light"
- toneFilter "infantil" → "warm sunlight", "vibrant cheerful"
- toneFilter "vintage" → "sepia tones", "warm grain"

REGRA: dentro do mesmo anúncio, mantém a MESMA família de cor (todos escuros âmbar, todos pastel, etc). Não mistura um vermelho com um azul claro no mesmo anúncio.`;

interface PlanInput {
  ad: ParsedAd;
  beats: Beat[];
  mood: Mood;
  audience: Audience;
  language: Lang;
  toneFilter?: string;
  vibe?: string;
}

function buildPrompt(input: PlanInput): string {
  const beatList = input.beats
    .map((b, i) => `${i + 1}. "${b.text.replace(/\n/g, " / ")}" (weight: ${b.weight})`)
    .join("\n");
  const tone = input.toneFilter ?? "neutro";
  const vibe = input.vibe ?? "cinematografico";
  const colorHintByTone: Record<string, string> = {
    escuro: "dark amber/red/navy moody — evite saturação. Prefira: 'dark amber bokeh', 'deep red shadow', 'dark navy mood', 'black gold smoke'",
    premium: "dark with gold accents — 'dark gold luxury', 'black silk moody', 'amber glow dark'",
    neutro: "balanced moody, slight warmth",
    suave: "soft pastel light, warm rose/cream tones",
    infantil: "warm sunlight, cheerful vibrant — yellow/orange/soft blue",
    vintage: "sepia warm grain, faded amber/tan",
  };
  const colorRule = colorHintByTone[tone] ?? "moody cinematic";

  return `Anúncio nº ${input.ad.number} (PADRÃO ${input.ad.padrao}).
Estratégia: ${input.ad.description || "(não informada)"}
Mood narrativo: ${input.mood} | Público: ${input.audience} | Idioma: ${input.language}
Tone filter (DITAR PALETA): ${tone} → ${colorRule}
Vibe: ${vibe}

COPY COMPLETA (entenda o ARCO):
"""
${input.ad.copy.trim()}
"""

BATIDAS em ordem (${input.beats.length} no total):
${beatList}

Para cada batida — NA ORDEM, EXATAMENTE ${input.beats.length} cenas — gere:
- "query": 3-6 palavras em INGLÊS pra Pexels vertical. **NÃO literal** + **paleta coerente com tone "${tone}"**. Sempre inclua um modificador de cor/luz: ${colorRule}. Ex: texto fala "casamento" tone=escuro → "dark wine glass bokeh"; texto "trabalho" tone=escuro → "city window night dark"; texto "criança" tone=infantil → "warm sunlight kid laughing".
- "tags": 1-3 substantivos em INGLÊS minúsculas single-word, capturando o SUBSTRATO. Ex: ["smoke","window"], ["candle","bokeh"].

Pra CTA ("Saiba Mais"): query premium abstrata respeitando paleta — ex tone=escuro: "dark gold smoke flow"; tone=infantil: "warm sunlight pastel".

Responda SOMENTE JSON válido sem markdown:
{"scenes":[{"text":"...","weight":"hook","query":"...","tags":["..."]}, ...]}`;
}

export async function planScenes(input: PlanInput): Promise<ScenePlan[]> {
  if (!process.env.CLAUDE_KEY) {
    throw new Error("CLAUDE_KEY ausente no .env.local");
  }
  const response = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 4096,
    system: SYSTEM,
    messages: [{ role: "user", content: buildPrompt(input) }],
  });
  const block = response.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") {
    throw new Error("Resposta da IA sem bloco de texto (planScenes)");
  }
  const raw = block.text.trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end < 0) {
    throw new Error(`JSON ausente (planScenes): ${raw.slice(0, 200)}`);
  }
  const parsed = JSON.parse(raw.slice(start, end + 1)) as { scenes: ScenePlan[] };
  if (!Array.isArray(parsed.scenes) || parsed.scenes.length !== input.beats.length) {
    throw new Error(
      `Cenas invalidas: esperado ${input.beats.length}, veio ${parsed.scenes?.length}`,
    );
  }
  return parsed.scenes.map((s, i) => ({
    text: input.beats[i]!.text,
    weight: input.beats[i]!.weight,
    query: (s.query || "cinematic moody").trim(),
    tags: (s.tags ?? []).map((t) => t.toLowerCase().trim()).filter(Boolean),
  }));
}
