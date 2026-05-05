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

PRINCÍPIO 1 — CONTEXTO LITERAL: a imagem precisa fazer SENTIDO direto pro texto.
NÃO use metáforas abstratas que não conectam. O lead precisa entender em 0.5s.

  ✅ BOM (literal/contextual):
  - "em segundos" → "clock ticking close up" / "stopwatch dark"
  - "perfume" → "perfume bottle elegant" / "perfume mist dark"
  - "casamento" → "wedding rings close up" / "bride preparation dark"
  - "trabalho" → "office desk laptop" / "businessman typing"

PRINCÍPIO 2 — PALETA RÍGIDA: TODAS as queries do MESMO anúncio terminam com o
MESMO sufixo de cor/luz. Anúncio inteiro = 1 filme só.

  Sufixos OBRIGATÓRIOS por toneFilter:
  - "escuro" → "dark cinematic moody"
  - "premium" → "dark gold luxury cinematic"
  - "neutro" → "soft natural light cinematic"
  - "suave" → "soft pastel warm light"
  - "infantil" → "warm sunlight cheerful"
  - "vintage" → "sepia warm grain vintage"

PRINCÍPIO 3 — V64: DIVERSIFIQUE referências semânticas.
Não fixe num único substantivo — explore o tema. Variações de gênero, idade,
contexto físico ajudam a criar visual rico.

  Exemplos de diversificação:
  - tema "tristeza" (em 5 slides do mesmo anúncio):
    Slide 1: "sad woman crying close" (mulher chorando)
    Slide 2: "lonely man window" (homem sozinho)
    Slide 3: "rain dark window" (ambiente)
    Slide 4: "broken heart close" (objeto simbólico)
    Slide 5: "silhouette empty room" (cena vazia)
    → 5 ângulos diferentes do mesmo tema, NÃO 5 mulheres chorando.

  - tema "medo":
    Slide 1: "scared face close up"
    Slide 2: "horror dark corridor"
    Slide 3: "shadow figure walking"
    Slide 4: "person hiding fear"
    Slide 5: "dark room alone"

  - tema "dinheiro":
    Slide 1: "cash hands counting"
    Slide 2: "wallet open empty"
    Slide 3: "bank notes falling"
    Slide 4: "businessman counting money"
    Slide 5: "credit card payment"

  - tema "trabalho":
    Slide 1: "businessman office desk"
    Slide 2: "woman typing laptop"
    Slide 3: "tired person computer"
    Slide 4: "office building night"
    Slide 5: "hands keyboard close"

  REGRA: pra cada conceito, GERE 3-5 ângulos diferentes ao longo do anúncio.
  Mistura gênero (homem/mulher), distância (close-up/wide), contexto
  (pessoa/objeto/ambiente). Visual rico > visual monotemático.

PRINCÍPIO 4 — RECICLAGEM DE TAGS ambientais (não dos substantivos):
Tags como "dark", "moody", "shadow", "cinematic" repetem. Tags do CONTEXTO
específico variam. Ex: ["sad","woman","dark"], ["lonely","man","dark"],
["rain","window","dark"] — todas têm "dark" mas substantivo varia.`;

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
