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

const SYSTEM = `Você é diretor de criação de anúncios verticais. Pra cada batida do texto, decide o VÍDEO/FOTO DE FUNDO do Pexels — query em inglês (3-6 palavras) + tags.

PRINCÍPIO 1 — CONTEXTO LITERAL (V52): a imagem precisa fazer SENTIDO direto pro texto.
NÃO use metáforas abstratas que não conectam. O lead precisa entender em 0.5s
do que se trata. Antes era abstrato demais — gerava imagens aleatórias (mulher pra
"em segundos", coisas estranhas). Corrigido:

  ✅ BOM (literal/contextual):
  - "em segundos" → "clock ticking close up" / "stopwatch dark"
  - "perfume" → "perfume bottle elegant" / "perfume mist dark"
  - "casamento" → "wedding rings close up" / "bride preparation dark"
  - "ele apertou minha mão" → "handshake business dark" / "two hands close"
  - "trabalho" → "office desk laptop" / "businessman typing"
  - "criança" → "child playing warm" / "kid laughing daylight"
  - "minha mãe" → "elderly mother portrait" / "older woman warm"

  ❌ EVITAR (abstrato demais):
  - "ele apertou minha mão" → "office hallway shadow" (sem conexão)
  - "perfume" → "smoke moody" (genérico demais)
  - "em segundos" → "woman thinking" (zero relação com tempo)

PRINCÍPIO 2 — PALETA RÍGIDA E COERENTE: TODAS as queries do MESMO anúncio devem
adicionar OS MESMOS modificadores de cor/luz no FIM. Anúncio inteiro tem que
parecer um filme só, não 10 vídeos coloridos diferentes (azul + vermelho + verde
+ cinza dá visual ruim).

  Sufixos OBRIGATÓRIOS por toneFilter:
  - "escuro" → SEMPRE termina com "dark cinematic moody" — sem exceção
  - "premium" → SEMPRE termina com "dark gold luxury cinematic"
  - "neutro" → SEMPRE termina com "soft natural light cinematic"
  - "suave" → SEMPRE termina com "soft pastel warm light"
  - "infantil" → SEMPRE termina com "warm sunlight cheerful"
  - "vintage" → SEMPRE termina com "sepia warm grain vintage"

PRINCÍPIO 3 — RECICLAGEM DE TAGS: as tags devem se REPETIR ao longo do anúncio.
Use o mesmo conjunto de 4-6 tags ambientais (ex: "dark", "moody", "shadow", "amber",
"cinematic") como base, variando só a tag específica do contexto. Isso ajuda o
sistema a baixar vídeos similares.`;

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
  // V52: SUFIXO de paleta — adicionado ao FIM de toda query, sem exceção.
  // Garante que todos os vídeos do anúncio tenham a mesma família de cor.
  const paletteSuffixByTone: Record<string, string> = {
    escuro: "dark cinematic moody",
    premium: "dark gold luxury cinematic",
    neutro: "soft natural light cinematic",
    suave: "soft pastel warm light",
    infantil: "warm sunlight cheerful",
    vintage: "sepia warm grain vintage",
  };
  const paletteSuffix = paletteSuffixByTone[tone] ?? "cinematic moody";

  return `Anúncio nº ${input.ad.number} (PADRÃO ${input.ad.padrao}).
Estratégia: ${input.ad.description || "(não informada)"}
Mood narrativo: ${input.mood} | Público: ${input.audience} | Idioma: ${input.language}
Tone filter: ${tone}
Vibe: ${vibe}

🎨 PALETA OBRIGATÓRIA (V52): TODAS as queries DEVEM TERMINAR com:
   "${paletteSuffix}"
Não invente outras cores nem misture paletas. Se for tone=escuro e a copy fala
de praia, NÃO escolha "tropical beach sunny" — escolha "ocean waves night dark
cinematic moody". Cor SEMPRE escura/coerente.

COPY COMPLETA (entenda o ARCO):
"""
${input.ad.copy.trim()}
"""

BATIDAS em ordem (${input.beats.length} no total):
${beatList}

Para cada batida — NA ORDEM, EXATAMENTE ${input.beats.length} cenas — gere:

- "query": 3-6 palavras em INGLÊS pra Pexels vertical, SEGUINDO ESTAS REGRAS:
   1. **CONTEXTO LITERAL** primeiro: a query precisa conectar diretamente com o
      texto, fazer sentido visualmente. Use o substantivo principal do texto.
   2. **2-3 palavras** de cenário/contexto literal + **paleta** ao final.
   3. SEMPRE termina com: "${paletteSuffix}"

   Exemplos com tone=${tone}:
   - texto "em segundos" → "clock ticking close ${paletteSuffix}"
   - texto "trabalho duro" → "businessman office desk ${paletteSuffix}"
   - texto "casamento" → "wedding rings hands ${paletteSuffix}"
   - texto "minha mãe" → "elderly mother portrait ${paletteSuffix}"
   - texto "perfume" → "perfume bottle elegant ${paletteSuffix}"
   - texto "celular" → "smartphone hands close ${paletteSuffix}"

- "tags": 1-3 substantivos em INGLÊS minúsculas single-word, capturando o
  contexto LITERAL (ex: ["clock","watch"], ["wedding","rings"]).

Pra CTA ("Saiba Mais"): query premium abstrata respeitando paleta:
"premium product display ${paletteSuffix}".

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
  // V52: Defesa em profundidade — se a IA não incluiu o sufixo de paleta,
  // a gente força no servidor. Garante coerência mesmo se o prompt falhar.
  const paletteSuffixByTone: Record<string, string> = {
    escuro: "dark cinematic moody",
    premium: "dark gold luxury cinematic",
    neutro: "soft natural light cinematic",
    suave: "soft pastel warm light",
    infantil: "warm sunlight cheerful",
    vintage: "sepia warm grain vintage",
  };
  const tone = input.toneFilter ?? "neutro";
  const paletteSuffix = paletteSuffixByTone[tone] ?? "cinematic moody";
  function ensurePalette(query: string): string {
    const q = query.toLowerCase().trim();
    // Se a query já contém pelo menos 2 das palavras-chave do sufixo, mantém
    const suffixWords = paletteSuffix.split(/\s+/);
    const overlap = suffixWords.filter((w) => q.includes(w)).length;
    if (overlap >= 2) return query.trim();
    // Senão, adiciona o sufixo
    return `${query.trim()} ${paletteSuffix}`;
  }
  return parsed.scenes.map((s, i) => ({
    text: input.beats[i]!.text,
    weight: input.beats[i]!.weight,
    query: ensurePalette(s.query || `cinematic ${paletteSuffix}`),
    tags: (s.tags ?? []).map((t) => t.toLowerCase().trim()).filter(Boolean),
  }));
}
