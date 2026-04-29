"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  Align,
  AssetBeatType,
  Audience,
  ClientAsset,
  ColorFilter,
  Format,
  GenerateRequest,
  Lang,
  Mood,
  TemplateStyle,
  ToneFilter,
  Vibe,
} from "../lib/types";
import { COLOR_FILTER_LABELS, colorFilterCss } from "../lib/color-filters";
import { buildTextShadow } from "../lib/text-utils";
import { TEMPLATES } from "../lib/template-presets";

const MOODS: Mood[] = [
  "sofisticado",
  "melancolico",
  "tenso",
  "agressivo",
  "sedutor",
  "calmo",
];
const AUDIENCES: Audience[] = ["masculino", "feminino", "geral", "infantil"];
const LANGS: { value: Lang; label: string }[] = [
  { value: "pt", label: "Português" },
  { value: "es", label: "Español" },
  { value: "en", label: "English" },
];
const FORMATS: Format[] = ["9:16", "4:5", "16:9", "1:1"];
// ============================================================
// CATÁLOGO DE FONTES — organizado por categoria com optgroup.
// Todas carregam dinamicamente do Google Fonts ao serem selecionadas.
// ============================================================

// Fontes pra GANCHO (uppercase bold, hooks de impacto)
const HOOK_FONT_GROUPS: { label: string; fonts: string[] }[] = [
  {
    label: "Impacto agressivo (recomendado)",
    fonts: [
      "Anton", "Bebas Neue", "Oswald", "Archivo Black", "Big Shoulders Display",
      "Squada One", "Russo One", "Bowlby One", "Bowlby One SC", "Staatliches",
      "Fjalla One", "Saira Condensed", "Roboto Condensed", "Yanone Kaffeesatz",
      "Asap Condensed", "Barlow Condensed", "Teko", "Khand", "Antonio",
      "Six Caps", "Oswald", "League Spartan", "Bungee",
    ],
  },
  {
    label: "Premium / Elegante (luxo, perfumaria)",
    fonts: [
      "Playfair Display", "Cormorant Garamond", "DM Serif Display", "Cinzel",
      "Cinzel Decorative", "Italiana", "Marcellus", "Bodoni Moda", "Cormorant SC",
      "Tenor Sans", "Forum", "Yeseva One", "Crimson Pro", "Libre Bodoni",
      "Prata", "Rozha One", "Cardo", "Spectral", "Sahitya", "Bellefair",
    ],
  },
  {
    label: "Suspense / Cinematográfico",
    fonts: [
      "Black Ops One", "Major Mono Display", "Faster One", "Knewave",
      "Stalinist One", "Bungee Inline", "Audiowide", "Orbitron", "Rajdhani",
      "Special Elite", "UnifrakturCook", "Nosifer", "Eater", "Creepster",
      "Metal Mania", "Pirata One", "Vampiro One",
    ],
  },
  {
    label: "Moderno / Tech",
    fonts: [
      "Archivo", "Sora", "Space Grotesk", "Outfit", "Plus Jakarta Sans",
      "Inter Tight", "Manrope", "Onest", "Albert Sans", "DM Sans",
      "Geist", "Hanken Grotesk", "Kanit",
    ],
  },
  {
    label: "Vintage / Retrô",
    fonts: [
      "Lobster", "Pacifico", "Sancreek", "Ultra", "Alfa Slab One", "Modak",
      "Lilita One", "Titan One", "Frijole", "Monoton", "Chango", "Limelight",
      "Sansita Swashed", "Press Start 2P", "VT323", "Rye",
    ],
  },
];

// Fontes pra TRANSIÇÃO (sentence-case, leitura corrida)
const TRANSITION_FONT_GROUPS: { label: string; fonts: string[] }[] = [
  {
    label: "Clean / Minimal (recomendado)",
    fonts: [
      "Inter", "Manrope", "Work Sans", "Inter Tight", "Public Sans", "DM Sans",
      "Plus Jakarta Sans", "Outfit", "Onest", "Sora", "Albert Sans",
      "Geist", "Hanken Grotesk", "IBM Plex Sans",
    ],
  },
  {
    label: "Humanist / Acolhedor",
    fonts: [
      "Lato", "Open Sans", "Source Sans 3", "Noto Sans", "Nunito", "Mulish",
      "Karla", "Cabin", "Quicksand", "Hind", "Heebo", "Fira Sans",
      "Comfortaa", "Catamaran", "Asap",
    ],
  },
  {
    label: "Geometric / Tech",
    fonts: [
      "Roboto", "Roboto Condensed", "Saira", "Kanit", "Jost", "Poppins",
      "Be Vietnam Pro", "Space Grotesk", "Rubik", "Barlow",
      "Encode Sans", "Archivo Narrow",
    ],
  },
  {
    label: "Serif legível (premium)",
    fonts: [
      "Roboto Slab", "Lora", "Merriweather", "Source Serif 4", "PT Serif",
      "Crimson Text", "EB Garamond", "Spectral", "Cardo", "Bitter",
      "Vollkorn", "Libre Caslon Text", "Cormorant", "Domine",
    ],
  },
  {
    label: "Mono (script, código, técnico)",
    fonts: [
      "JetBrains Mono", "Fira Code", "Roboto Mono", "Space Mono",
      "IBM Plex Mono", "Source Code Pro",
    ],
  },
];

// Listas planas (mantidas pra compat com generate API e defaults)
const HOOK_FONTS_ALL = HOOK_FONT_GROUPS.flatMap((g) => g.fonts);
const TRANSITION_FONTS_ALL = TRANSITION_FONT_GROUPS.flatMap((g) => g.fonts);
const TONE_FILTERS: { value: ToneFilter; label: string; desc: string }[] = [
  { value: "escuro", label: "Escuro", desc: "Filtro escuro, sombra forte, premium cinematográfico" },
  { value: "neutro", label: "Neutro", desc: "Equilibrado, sem filtro pesado" },
  { value: "suave", label: "Suave", desc: "Tons claros, sombra leve, vibe acolhedora" },
  { value: "infantil", label: "Infantil", desc: "Cores vibrantes, leveza, alegre" },
  { value: "vintage", label: "Vintage", desc: "Tons sépia/dourados, contraste retrô" },
  { value: "premium", label: "Premium luxo", desc: "Dourado/preto, sombras profundas" },
];
const VIBES: { value: Vibe; label: string; desc: string }[] = [
  { value: "cinematografico", label: "Cinematográfico", desc: "Filme, suspense, narrativo" },
  { value: "documental", label: "Documental", desc: "Real, cru, sem floreio" },
  { value: "glamour", label: "Glamour", desc: "Luxo brilhante, sedução" },
  { value: "tenso", label: "Tenso", desc: "Pressão, urgência" },
  { value: "calmo", label: "Calmo", desc: "Ar leve, contemplativo" },
  { value: "elegante", label: "Elegante", desc: "Sofisticado, espaçado" },
];
const BEAT_TYPES: AssetBeatType[] = ["any", "hook", "transition", "punch"];

type Tab = "generate" | "assets";

export default function Home() {
  const [tab, setTab] = useState<Tab>("generate");

  return (
    <main className="mx-auto max-w-6xl p-6 space-y-6">
      <header>
        <h1 className="text-3xl font-bold">Automador de Ads</h1>
        <p className="text-neutral-400 text-sm mt-1">
          Brand brief detalhado → IA gera draft personalizado → editor visual completo → MP4 pronto.
        </p>
      </header>

      <nav className="flex gap-2 border-b border-neutral-800 pb-2">
        <TabBtn active={tab === "generate"} onClick={() => setTab("generate")}>
          Brand Brief & Gerar
        </TabBtn>
        <TabBtn active={tab === "assets"} onClick={() => setTab("assets")}>
          Assets do cliente
        </TabBtn>
      </nav>

      {tab === "generate" ? <GenerateTab /> : <AssetsTab />}
    </main>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 rounded-t border-b-2 ${
        active
          ? "border-purple-500 text-white"
          : "border-transparent text-neutral-400 hover:text-neutral-200"
      }`}
    >
      {children}
    </button>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3 border border-neutral-800 rounded-lg p-4 bg-neutral-950/40">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-200">
          {title}
        </h2>
        {hint && <p className="text-xs text-neutral-500 mt-0.5">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function GenerateTab() {
  const router = useRouter();
  // identidade do cliente
  const [cliente, setCliente] = useState("");
  const [nicho, setNicho] = useState("");
  const [nome, setNome] = useState("");
  // formato
  const [format, setFormat] = useState<Format>("9:16");
  const [language, setLanguage] = useState<Lang>("pt");
  // tom & vibe
  const [toneFilter, setToneFilter] = useState<ToneFilter>("escuro");
  const [vibe, setVibe] = useState<Vibe>("cinematografico");
  const [mood, setMood] = useState<Mood>("sofisticado");
  const [audience, setAudience] = useState<Audience>("masculino");
  // tipografia
  const [fontHook, setFontHook] = useState(HOOK_FONTS_ALL[0]!);
  const [fontTransition, setFontTransition] = useState(TRANSITION_FONTS_ALL[0]!);
  // Preview do tom — usuário escolhe fundo pra enxergar sombra
  const [previewBg, setPreviewBg] = useState<"escuro" | "claro" | "checker" | "video">(
    "escuro",
  );
  // cor & estilo visual
  const [baseColor, setBaseColor] = useState("#ffffff");
  const [accentColor, setAccentColor] = useState("#d4af37");
  const [shadowBlur, setShadowBlur] = useState(14);
  const [shadowOpacity, setShadowOpacity] = useState(0.5);
  const [overlayOpacity, setOverlayOpacity] = useState(0.5);
  const [letterSpacing, setLetterSpacing] = useState(0);
  const [lineHeight, setLineHeight] = useState(1.05);
  const [align, setAlign] = useState<Align>("center");
  const [colorFilter, setColorFilter] = useState<ColorFilter>("neutro");
  // V10: template visual
  const [template, setTemplate] = useState<TemplateStyle>("classico");
  // copy
  const [source, setSource] = useState("");

  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string>("");

  // Sugestão automática de defaults conforme tone muda
  useEffect(() => {
    const presets: Record<ToneFilter, { color: string; accent: string; shadowBlur: number; shadowOpacity: number; overlay: number }> = {
      escuro: { color: "#ffffff", accent: "#d4af37", shadowBlur: 36, shadowOpacity: 0.85, overlay: 0.62 },
      neutro: { color: "#ffffff", accent: "#d4af37", shadowBlur: 30, shadowOpacity: 0.7, overlay: 0.45 },
      suave: { color: "#fafafa", accent: "#a78bfa", shadowBlur: 18, shadowOpacity: 0.45, overlay: 0.28 },
      infantil: { color: "#fff7ad", accent: "#ff7eb6", shadowBlur: 12, shadowOpacity: 0.4, overlay: 0.2 },
      vintage: { color: "#f5e9c8", accent: "#c08552", shadowBlur: 22, shadowOpacity: 0.5, overlay: 0.4 },
      premium: { color: "#ffffff", accent: "#cba135", shadowBlur: 32, shadowOpacity: 0.75, overlay: 0.55 },
    };
    const p = presets[toneFilter];
    setBaseColor(p.color);
    setAccentColor(p.accent);
    setShadowBlur(p.shadowBlur);
    setShadowOpacity(p.shadowOpacity);
    setOverlayOpacity(p.overlay);
  }, [toneFilter]);

  // Carrega fontes do Google Fonts dinamicamente quando o usuário muda
  // a seleção. Sem isso o dropdown e o preview renderizam só com fonte
  // sistema, e o usuário não vê de verdade o que escolheu.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const fonts = [fontHook, fontTransition];
    const params = fonts
      .map((f) => `family=${encodeURIComponent(f).replace(/%20/g, "+")}:wght@400;600;700;900`)
      .join("&");
    const url = `https://fonts.googleapis.com/css2?${params}&display=swap`;
    const linkId = "home-google-fonts";
    let link = document.getElementById(linkId) as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement("link");
      link.id = linkId;
      link.rel = "stylesheet";
      document.head.appendChild(link);
    }
    link.href = url;
  }, [fontHook, fontTransition]);

  async function handleGenerate() {
    setBusy(true);
    setLog("Gerando draft personalizado: parsing → IA cortando batidas → IA planejando cenas (não-óbvias) → buscando vídeos. Quando pronto, abre o editor.");
    try {
      const payload: GenerateRequest = {
        source,
        cliente: cliente.trim() || undefined,
        nicho: nicho.trim() || undefined,
        nome: nome.trim() || undefined,
        mood,
        audience,
        language,
        format,
        fontHook,
        fontTransition,
        toneFilter,
        vibe,
        baseColor,
        accentColor,
        baseLetterSpacing: letterSpacing,
        baseLineHeight: lineHeight,
        baseShadowBlur: shadowBlur,
        baseShadowOpacity: shadowOpacity,
        baseOverlayOpacity: overlayOpacity,
        baseAlign: align,
        colorFilter,
        template,
      };
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? "Erro");
      router.push(`/draft/${data.draftId}`);
    } catch (err) {
      setLog(`Falha: ${(err as Error).message}`);
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <Section
        title="1. Cliente"
        hint="Aparece no nome do projeto e no contexto da IA"
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Field label="Cliente" value={cliente} onChange={setCliente} placeholder="Cliente" />
          <Field label="Nicho" value={nicho} onChange={setNicho} placeholder="Nicho" />
          <Field label="Nome do projeto" value={nome} onChange={setNome} placeholder="Nome do projeto" />
        </div>
      </Section>

      <Section
        title="2. Template visual"
        hint="Escolhe o padrão de layout. Cada um aplica defaults coerentes nas páginas geradas — você ainda pode ajustar tudo depois no editor."
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {TEMPLATES.map((t) => (
            <button
              key={t.id}
              onClick={() => setTemplate(t.id)}
              className={`text-left rounded p-3 border transition ${
                template === t.id
                  ? "border-purple-500 bg-purple-900/20"
                  : "border-neutral-700 hover:border-neutral-500"
              }`}
            >
              <TemplateThumb id={t.id} active={template === t.id} />
              <div className="mt-2 text-sm font-semibold">{t.label}</div>
              <div className="text-xs text-neutral-400 mt-1">{t.description}</div>
              <div className="text-[10px] text-neutral-500 mt-1.5 italic">
                {t.exampleHint}
              </div>
            </button>
          ))}
        </div>
      </Section>

      <Section
        title="3. Formato e idioma"
        hint="Define proporção do vídeo e idioma da copy"
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Select label="Formato" value={format} onChange={(v) => setFormat(v as Format)} options={FORMATS} />
          <Select
            label="Idioma"
            value={language}
            onChange={(v) => setLanguage(v as Lang)}
            options={LANGS.map((l) => l.value)}
            renderLabel={(v) => LANGS.find((l) => l.value === v)?.label ?? v}
          />
        </div>
      </Section>

      <Section
        title="4. Tom & Vibe"
        hint="Define o filtro visual + sensação cinematográfica. A IA usa isso pra escolher imagens não-óbvias."
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <span className="block text-xs uppercase text-neutral-500 mb-2">Tom geral</span>
            <div className="grid grid-cols-2 gap-2">
              {TONE_FILTERS.map((t) => (
                <button
                  key={t.value}
                  onClick={() => setToneFilter(t.value)}
                  className={`text-left rounded p-2 border ${
                    toneFilter === t.value
                      ? "border-purple-500 bg-purple-900/20"
                      : "border-neutral-700 hover:border-neutral-500"
                  }`}
                >
                  <div className="text-sm font-medium">{t.label}</div>
                  <div className="text-xs text-neutral-500 mt-0.5">{t.desc}</div>
                </button>
              ))}
            </div>
          </div>
          <div>
            <span className="block text-xs uppercase text-neutral-500 mb-2">Vibe</span>
            <div className="grid grid-cols-2 gap-2">
              {VIBES.map((v) => (
                <button
                  key={v.value}
                  onClick={() => setVibe(v.value)}
                  className={`text-left rounded p-2 border ${
                    vibe === v.value
                      ? "border-purple-500 bg-purple-900/20"
                      : "border-neutral-700 hover:border-neutral-500"
                  }`}
                >
                  <div className="text-sm font-medium">{v.label}</div>
                  <div className="text-xs text-neutral-500 mt-0.5">{v.desc}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </Section>

      <Section
        title="5. Público & Mood narrativo"
        hint="Mood é a curva emocional da copy. Público guia a estética."
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Select label="Mood emocional" value={mood} onChange={(v) => setMood(v as Mood)} options={MOODS} />
          <Select label="Público" value={audience} onChange={(v) => setAudience(v as Audience)} options={AUDIENCES} />
        </div>
      </Section>

      <Section
        title="6. Tipografia"
        hint={`Default: ~60% gancho (uppercase bold), ~5% transição (sentence-case), ~35% sem texto. ${HOOK_FONTS_ALL.length}+ fontes do Google Fonts categorizadas — escolha a que combina com o cliente.`}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <FontSelect
            label="Fonte gancho (uppercase bold)"
            value={fontHook}
            onChange={setFontHook}
            groups={HOOK_FONT_GROUPS}
          />
          <FontSelect
            label="Fonte transição (sentence-case)"
            value={fontTransition}
            onChange={setFontTransition}
            groups={TRANSITION_FONT_GROUPS}
          />
        </div>
      </Section>

      <Section
        title="7. Cor & estilo visual"
        hint="Calibrado automaticamente conforme o tom acima — ajuste se quiser. Tudo é editável depois no editor."
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-3">
            <ColorField label="Cor base do texto" value={baseColor} onChange={setBaseColor} />
            <ColorField label="Cor de destaque" value={accentColor} onChange={setAccentColor} />
            <Select
              label="Filtro de cor (LUT global)"
              value={colorFilter}
              onChange={(v) => setColorFilter(v as ColorFilter)}
              options={Object.keys(COLOR_FILTER_LABELS) as ColorFilter[]}
              renderLabel={(v) => COLOR_FILTER_LABELS[v as ColorFilter]}
            />
            <RangeField
              label="Espaçamento entre letras"
              value={letterSpacing}
              onChange={setLetterSpacing}
              min={-0.05}
              max={0.1}
              step={0.005}
              format={(v) => `${v.toFixed(3)} em`}
            />
            <RangeField
              label="Altura da linha"
              value={lineHeight}
              onChange={setLineHeight}
              min={0.85}
              max={1.5}
              step={0.05}
              format={(v) => `${v.toFixed(2)}×`}
            />
            <Select
              label="Alinhamento padrão"
              value={align}
              onChange={(v) => setAlign(v as Align)}
              options={["left", "center", "right"] as Align[]}
            />
          </div>
          <div className="space-y-3">
            <RangeField
              label="Sombra do texto (intensidade do blur)"
              value={shadowBlur}
              onChange={setShadowBlur}
              min={0}
              max={80}
              step={2}
              format={(v) => `${v}px`}
            />
            <RangeField
              label="Sombra do texto (opacidade)"
              value={shadowOpacity}
              onChange={setShadowOpacity}
              min={0}
              max={1}
              step={0.05}
              format={(v) => `${Math.round(v * 100)}%`}
            />
            <RangeField
              label="Overlay escuro sobre vídeo"
              value={overlayOpacity}
              onChange={setOverlayOpacity}
              min={0}
              max={1}
              step={0.05}
              format={(v) => `${Math.round(v * 100)}%`}
            />
            <div className="rounded p-3 border border-neutral-800 bg-neutral-900">
              <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
                <div className="text-xs text-neutral-500">
                  Preview do tom (gancho + transição, sombra real do MP4)
                </div>
                <div className="flex gap-1">
                  {(
                    [
                      { v: "escuro", l: "Escuro" },
                      { v: "claro", l: "Claro" },
                      { v: "checker", l: "Xadrez" },
                      { v: "video", l: "Vídeo" },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.v}
                      onClick={() => setPreviewBg(opt.v)}
                      className={`px-2 py-0.5 text-[10px] rounded border ${
                        previewBg === opt.v
                          ? "bg-purple-600 border-purple-500 text-white"
                          : "bg-neutral-800 border-neutral-700 text-neutral-400 hover:text-neutral-200"
                      }`}
                    >
                      {opt.l}
                    </button>
                  ))}
                </div>
              </div>
              <PreviewCanvas
                bg={previewBg}
                colorFilter={colorFilter}
                overlayOpacity={overlayOpacity}
                baseColor={baseColor}
                accentColor={accentColor}
                fontHook={fontHook}
                fontTransition={fontTransition}
                letterSpacing={letterSpacing}
                lineHeight={lineHeight}
                shadowBlur={shadowBlur}
                shadowOpacity={shadowOpacity}
              />
              <div className="text-[10px] text-neutral-500 mt-1.5 leading-relaxed">
                <span className="text-neutral-400 font-semibold">Dica:</span>{" "}
                troca o fundo (Escuro/Claro/Xadrez/Vídeo) pra ver a sombra de
                ângulos diferentes. <span className="text-neutral-400">Xadrez</span>{" "}
                evidencia o blur exato — útil pra calibrar opacity. Filtro de cor
                aparece em <span className="text-neutral-400">Vídeo</span>.
              </div>
            </div>
          </div>
        </div>
      </Section>

      <Section
        title="8. Copy do anúncio"
        hint="Cole o doc inteiro com os 10 anúncios — formato 'AD 01 - PADRÃO HDCPY' / 'ANÚNCIO COMPLETO' já é reconhecido"
      >
        <textarea
          value={source}
          onChange={(e) => setSource(e.target.value)}
          rows={14}
          className="w-full rounded bg-neutral-900 border border-neutral-700 p-3 font-mono text-sm"
          placeholder={"AD 01 - PADRÃO HDCPY\n📌 Descrição: ...\nANÚNCIO COMPLETO\n\n[cole sua copy aqui]\n\nAD 02 - PADRÃO HDCPY\n..."}
        />
      </Section>

      <section className="flex gap-3 flex-wrap items-center sticky bottom-0 bg-black/80 backdrop-blur p-3 -mx-6 px-6 border-t border-neutral-800">
        <button
          disabled={busy || !source}
          onClick={handleGenerate}
          className="px-6 py-3 rounded bg-purple-600 hover:bg-purple-500 disabled:opacity-50 font-semibold"
        >
          {busy ? "Gerando draft..." : "Gerar draft + abrir editor →"}
        </button>
        <span className="text-xs text-neutral-500">
          Demora 1-5 min na 1ª vez (Pexels baixando vídeos não-óbvios). Depois é rápido.
        </span>
      </section>

      {log && (
        <div className="text-sm text-neutral-300 bg-neutral-900 border border-neutral-800 rounded p-3 whitespace-pre-wrap">
          {log}
        </div>
      )}
    </div>
  );
}

function AssetsTab() {
  const [assets, setAssets] = useState<ClientAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    setLoading(true);
    try {
      const res = await fetch("/api/client-assets");
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? "Erro");
      setAssets(data.assets as ClientAsset[]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
  }, []);

  async function handleUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.append("file", file);
        const res = await fetch("/api/upload-asset", { method: "POST", body: form });
        const data = await res.json();
        if (!data.ok) throw new Error(`${file.name}: ${data.error}`);
      }
      await reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleUpdate(id: string, patch: Partial<ClientAsset>) {
    setError(null);
    try {
      const res = await fetch(`/api/client-assets/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      setAssets((prev) => prev.map((a) => (a.id === id ? (data.asset as ClientAsset) : a)));
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Remover este asset?")) return;
    try {
      const res = await fetch(`/api/client-assets/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      setAssets((prev) => prev.filter((a) => a.id !== id));
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-neutral-400">
        Solta aqui qualquer foto ou vídeo do cliente que queira usar nos anúncios. Tags
        sugeridas automaticamente pelo nome do arquivo. Se as tags batem com o que a IA
        planeja pra uma cena, esse asset entra antes do Pexels.
      </p>

      <div
        className="border-2 border-dashed border-neutral-700 rounded p-6 text-center hover:border-purple-500 transition"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          handleUpload(e.dataTransfer.files);
        }}
      >
        <input
          id="upload"
          type="file"
          multiple
          accept="image/*,video/*"
          className="hidden"
          onChange={(e) => handleUpload(e.target.files)}
        />
        <label htmlFor="upload" className="cursor-pointer">
          <div className="text-base font-medium">
            {busy ? "Subindo…" : "Arraste arquivos aqui ou clique pra selecionar"}
          </div>
          <div className="text-xs text-neutral-500 mt-1">
            png, jpg, webp, mp4, mov, webm
          </div>
        </label>
      </div>

      {error && (
        <div className="text-sm text-red-400 bg-red-950/30 border border-red-900 rounded p-3">
          {error}
        </div>
      )}

      <div className="text-sm text-neutral-400">
        {loading ? "Carregando…" : `${assets.length} asset(s)`}
      </div>

      <ul className="space-y-2">
        {assets.map((asset) => (
          <li
            key={asset.id}
            className="bg-neutral-900 border border-neutral-800 rounded p-3 grid grid-cols-1 md:grid-cols-12 gap-3 items-center"
          >
            <div className="md:col-span-4 truncate">
              <div className="text-xs text-neutral-500">{asset.type}</div>
              <div className="text-sm font-medium truncate">{asset.filename}</div>
            </div>
            <label className="md:col-span-2">
              <span className="block text-xs text-neutral-500">AD</span>
              <select
                value={asset.ad === null ? "" : String(asset.ad)}
                onChange={(e) =>
                  handleUpdate(asset.id, {
                    ad: e.target.value === "" ? null : Number(e.target.value),
                  })
                }
                className="w-full mt-1 rounded bg-neutral-800 border border-neutral-700 px-2 py-1 text-sm"
              >
                <option value="">qualquer</option>
                {Array.from({ length: 15 }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    AD {String(n).padStart(2, "0")}
                  </option>
                ))}
              </select>
            </label>
            <label className="md:col-span-2">
              <span className="block text-xs text-neutral-500">Tipo de batida</span>
              <select
                value={asset.beatType}
                onChange={(e) =>
                  handleUpdate(asset.id, {
                    beatType: e.target.value as AssetBeatType,
                  })
                }
                className="w-full mt-1 rounded bg-neutral-800 border border-neutral-700 px-2 py-1 text-sm"
              >
                {BEAT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label className="md:col-span-3">
              <span className="block text-xs text-neutral-500">
                Tags (separa por vírgula)
              </span>
              <input
                defaultValue={asset.tags.join(", ")}
                onBlur={(e) =>
                  handleUpdate(asset.id, {
                    tags: e.target.value
                      .split(",")
                      .map((t) => t.trim())
                      .filter(Boolean),
                  })
                }
                className="w-full mt-1 rounded bg-neutral-800 border border-neutral-700 px-2 py-1 text-sm"
              />
            </label>
            <button
              onClick={() => handleDelete(asset.id)}
              className="md:col-span-1 text-xs text-red-400 hover:text-red-300"
            >
              remover
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Mini-preview visual de cada template (180×120, vertical-ish). */
function TemplateThumb({ id, active }: { id: TemplateStyle; active: boolean }) {
  const ring = active ? "ring-2 ring-purple-500" : "";
  if (id === "classico") {
    return (
      <div
        className={`relative aspect-[9/14] rounded overflow-hidden ${ring}`}
        style={{
          background:
            "linear-gradient(135deg, #3a2818 0%, #0a0a0a 100%)",
        }}
      >
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-white font-black text-[11px] tracking-tight uppercase text-center px-2 leading-tight">
            VOCÊ NÃO<br />ESTAVA PRONTO
          </span>
        </div>
      </div>
    );
  }
  if (id === "destaque") {
    return (
      <div
        className={`relative aspect-[9/14] rounded overflow-hidden ${ring}`}
        style={{
          background:
            "linear-gradient(135deg, #4a1a1a 0%, #0a0a0a 100%)",
        }}
      >
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="bg-black/65 px-2 py-1 rounded-sm shadow-lg">
            <span className="text-white font-black text-[11px] tracking-tight uppercase text-center leading-tight">
              VOCÊ NÃO<br />
              <span style={{ color: "#ff3b3b" }}>ESTAVA PRONTO</span>
            </span>
          </div>
        </div>
      </div>
    );
  }
  if (id === "cinema") {
    return (
      <div
        className={`relative aspect-[9/14] rounded overflow-hidden ${ring}`}
        style={{
          background:
            "linear-gradient(135deg, #4a3520 0%, #2a1f15 50%, #0a0a0a 100%)",
        }}
      >
        {/* gradient fade pro preto na metade inferior — sem borda dura */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.15) 38%, rgba(0,0,0,0.55) 55%, rgba(0,0,0,0.92) 72%, #000 88%)",
          }}
        />
        {/* texto centralizado bem no meio (na transição vídeo → preto) */}
        <div className="absolute inset-0 flex items-center justify-center">
          <span
            className="text-white font-black text-[11px] tracking-tight uppercase text-center px-2 leading-tight"
            style={{
              textShadow:
                "-1px 0 0 rgba(0,0,0,0.9), 1px 0 0 rgba(0,0,0,0.9), 0 -1px 0 rgba(0,0,0,0.9), 0 1px 0 rgba(0,0,0,0.9), 0 3px 8px rgba(0,0,0,0.7)",
            }}
          >
            A DIFERENÇA ENTRE
            <br />
            OS DOIS ERA UMA SÓ
          </span>
        </div>
      </div>
    );
  }
  return null;
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full rounded bg-neutral-900 border border-neutral-700 px-3 py-2"
      />
    </label>
  );
}

function Select<T extends string>({
  label,
  value,
  onChange,
  options,
  renderLabel,
}: {
  label: string;
  value: T;
  onChange: (v: string) => void;
  options: readonly T[];
  renderLabel?: (v: T) => string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded bg-neutral-900 border border-neutral-700 px-3 py-2"
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {renderLabel ? renderLabel(opt) : opt}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * Select especializado pra fontes — agrupa por categoria via <optgroup>
 * e renderiza cada opção na própria fonte (preview inline).
 */
function FontSelect({
  label,
  value,
  onChange,
  groups,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  groups: { label: string; fonts: string[] }[];
}) {
  // Pré-carrega TODAS as fontes do dropdown na 1ª render — assim cada
  // <option> aparece na própria fonte (preview inline). É um único request
  // ao Google Fonts, eficiente.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const all = groups.flatMap((g) => g.fonts);
    const params = all
      .map((f) => `family=${encodeURIComponent(f).replace(/%20/g, "+")}:wght@400;700`)
      .join("&");
    const url = `https://fonts.googleapis.com/css2?${params}&display=swap`;
    const linkId = `font-select-preload-${groups.length}-${all.length}`;
    if (document.getElementById(linkId)) return;
    const link = document.createElement("link");
    link.id = linkId;
    link.rel = "stylesheet";
    link.href = url;
    document.head.appendChild(link);
  }, [groups]);

  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded bg-neutral-900 border border-neutral-700 px-3 py-2"
        style={{ fontFamily: `"${value}", system-ui, sans-serif` }}
      >
        {groups.map((g) => (
          <optgroup key={g.label} label={g.label}>
            {g.fonts.map((f) => (
              <option
                key={f}
                value={f}
                style={{ fontFamily: `"${f}", system-ui, sans-serif` }}
              >
                {f}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  );
}

/**
 * Preview canvas — mostra hook + transição com a sombra real do MP4
 * sobre 4 fundos diferentes (escuro/claro/xadrez/vídeo) pra usuário
 * calibrar a sombra com clareza.
 */
function PreviewCanvas({
  bg,
  colorFilter,
  overlayOpacity,
  baseColor,
  accentColor: _accentColor,
  fontHook,
  fontTransition,
  letterSpacing,
  lineHeight,
  shadowBlur,
  shadowOpacity,
}: {
  bg: "escuro" | "claro" | "checker" | "video";
  colorFilter: ColorFilter;
  overlayOpacity: number;
  baseColor: string;
  accentColor: string;
  fontHook: string;
  fontTransition: string;
  letterSpacing: number;
  lineHeight: number;
  shadowBlur: number;
  shadowOpacity: number;
}) {
  const filterCss = colorFilter !== "neutro" ? colorFilterCss(colorFilter) : "none";

  // Background style por modo
  const bgStyles: Record<typeof bg, React.CSSProperties> = {
    escuro: {
      background:
        "radial-gradient(ellipse at 30% 30%, #404040 0%, #1f1f1f 45%, #050505 100%)",
    },
    claro: {
      background:
        "radial-gradient(ellipse at 30% 30%, #fafafa 0%, #d4d4d4 50%, #888 100%)",
    },
    checker: {
      backgroundImage:
        "linear-gradient(45deg, #555 25%, transparent 25%), linear-gradient(-45deg, #555 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #555 75%), linear-gradient(-45deg, transparent 75%, #555 75%)",
      backgroundSize: "20px 20px",
      backgroundPosition: "0 0, 0 10px, 10px -10px, -10px 0",
      backgroundColor: "#cbcbcb",
    },
    video: {
      // Simula um still de vídeo cinematográfico
      background:
        "linear-gradient(135deg, #4a2c1a 0%, #2a1a10 30%, #050505 70%), radial-gradient(circle at 70% 40%, rgba(255,200,150,0.15), transparent 50%)",
    },
  };

  return (
    <div
      className="h-56 rounded relative overflow-hidden flex flex-col items-center justify-center gap-3"
      style={{ ...bgStyles[bg], filter: bg === "video" ? filterCss : undefined }}
    >
      {/* Overlay escurecedor — só faz sentido sobre vídeo */}
      {bg === "video" && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: `rgba(0,0,0,${overlayOpacity})` }}
        />
      )}
      {/* Linha mediana sutil pra mostrar cor (paleta) — só nos fundos sólidos */}
      {bg !== "video" && (
        <div
          className="absolute top-2 left-2 text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded"
          style={{
            background: bg === "claro" ? "rgba(0,0,0,0.6)" : "rgba(255,255,255,0.15)",
            color: bg === "claro" ? "#fafafa" : "#aaa",
          }}
        >
          fundo {bg}
        </div>
      )}
      <div
        className="relative font-black text-3xl text-center px-4"
        style={{
          color: baseColor,
          fontFamily: `"${fontHook}", system-ui, sans-serif`,
          letterSpacing: `${letterSpacing}em`,
          lineHeight,
          textShadow: buildTextShadow({ shadowBlur, shadowOpacity, scale: 0.8 }),
          textTransform: "uppercase",
        }}
      >
        PARA DEIXAR UM
        <br />
        RASTRO REAL
      </div>
      <div
        className="relative text-base text-center px-4"
        style={{
          color: baseColor,
          fontFamily: `"${fontTransition}", system-ui, sans-serif`,
          fontWeight: 600,
          letterSpacing: `${letterSpacing}em`,
          lineHeight,
          textShadow: buildTextShadow({ shadowBlur, shadowOpacity, scale: 0.7 }),
        }}
      >
        Você precisa sair do óbvio
      </div>
    </div>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      <div className="mt-1 flex gap-2 items-center">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-12 rounded bg-neutral-900 border border-neutral-700"
        />
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 rounded bg-neutral-900 border border-neutral-700 px-3 py-2 font-mono text-sm"
        />
      </div>
    </label>
  );
}

function RangeField({
  label,
  value,
  onChange,
  min,
  max,
  step,
  format,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  format?: (v: number) => string;
}) {
  return (
    <label className="block">
      <div className="flex justify-between items-center">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-xs text-neutral-400 font-mono">
          {format ? format(value) : value}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="mt-1 w-full"
      />
    </label>
  );
}
