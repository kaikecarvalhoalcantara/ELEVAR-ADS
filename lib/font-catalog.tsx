"use client";

import { useEffect, useMemo, useRef, useState } from "react";

// ============================================================
// CATÁLOGO DE FONTES — compartilhado entre home (brand brief)
// e editor (sidebar TIPOGRAFIA). Single source of truth.
// Todas carregam dinamicamente do Google Fonts ao serem selecionadas.
// ============================================================

// Fontes pra GANCHO (uppercase bold, hooks de impacto)
export const HOOK_FONT_GROUPS: { label: string; fonts: string[] }[] = [
  {
    label: "Impacto agressivo (recomendado)",
    fonts: [
      "Anton", "Bebas Neue", "Oswald", "Archivo Black", "Big Shoulders Display",
      "Big Shoulders Inline Display", "Big Shoulders Stencil Display",
      "Squada One", "Russo One", "Bowlby One", "Bowlby One SC", "Staatliches",
      "Fjalla One", "Saira Condensed", "Saira Stencil One", "Roboto Condensed",
      "Yanone Kaffeesatz", "Asap Condensed", "Barlow Condensed", "Teko", "Khand",
      "Antonio", "Six Caps", "League Spartan", "Bungee",
      "Fugaz One", "Notable", "Goldman", "Plaster", "Diplomata", "Erica One",
      "Kavoon", "Ribeye", "Sirin Stencil", "Ranchers", "Stardos Stencil",
      "Sigmar", "Sigmar One", "Allerta Stencil", "Black Han Sans",
      "Changa One", "Concert One", "Holtwood One SC",
    ],
  },
  {
    label: "Premium / Elegante (luxo, perfumaria)",
    fonts: [
      "Playfair Display", "Cormorant Garamond", "DM Serif Display",
      "DM Serif Text", "Cinzel", "Cinzel Decorative", "Italiana", "Italianno",
      "Marcellus", "Marcellus SC", "Bodoni Moda", "Cormorant SC",
      "Cormorant Infant", "Cormorant Upright", "Tenor Sans", "Forum",
      "Yeseva One", "Crimson Pro", "Libre Bodoni", "Libre Caslon Display",
      "Prata", "Rozha One", "Cardo", "Spectral", "Spectral SC", "Sahitya",
      "Bellefair", "Abril Fatface", "Della Respira", "Berkshire Swash",
      "Lustria", "Old Standard TT", "Volkhov",
      "Inknut Antiqua", "Allura", "Great Vibes", "Pinyon Script",
      "Tangerine", "Sacramento", "Parisienne", "Petit Formal Script",
      "Mrs Saint Delafield", "Mr De Haviland", "Monsieur La Doulaise",
    ],
  },
  {
    label: "Suspense / Cinematográfico",
    fonts: [
      "Black Ops One", "Major Mono Display", "Faster One", "Knewave",
      "Stalinist One", "Bungee Inline", "Bungee Outline", "Bungee Shade",
      "Audiowide", "Orbitron", "Rajdhani", "Special Elite", "UnifrakturCook",
      "UnifrakturMaguntia", "Nosifer", "Eater", "Creepster", "Metal Mania",
      "Pirata One", "Vampiro One", "New Rocker", "Iceland", "Iceberg",
      "Mystery Quest", "Wallpoet", "Megrim", "Henny Penny", "Goblin One",
      "Codystar", "Plaster", "Jolly Lodger", "Nova Cut", "Nova Flat",
      "Nova Square", "Old London", "Fascinate", "Fascinate Inline",
      "Tilt Prism", "Tilt Warp", "Tilt Neon", "Foldit", "Rubik Glitch",
      "Rubik Burned", "Rubik Distressed", "Rubik Storm", "Rubik Wet Paint",
      "Rubik Spray Paint", "Rubik Beastly",
    ],
  },
  {
    label: "Moderno / Tech",
    fonts: [
      "Archivo", "Archivo Narrow", "Sora", "Space Grotesk", "Outfit",
      "Plus Jakarta Sans", "Inter Tight", "Manrope", "Onest", "Albert Sans",
      "DM Sans", "Geist", "Hanken Grotesk", "Kanit", "Michroma", "Quantico",
      "Rubik Mono One", "Syne", "Syne Mono",
      "Syncopate", "Familjen Grotesk", "Sofia Sans",
      "Sofia Sans Extra Condensed", "Truculenta", "Recursive", "Mona Sans",
      "Bricolage Grotesque", "Wix Madefor Display",
      "Wix Madefor Text",
    ],
  },
  {
    label: "Vintage / Retrô",
    fonts: [
      "Lobster", "Lobster Two", "Pacifico", "Sancreek", "Ultra", "Alfa Slab One",
      "Modak", "Lilita One", "Titan One", "Frijole", "Monoton", "Chango",
      "Limelight", "Sansita Swashed", "Press Start 2P", "VT323", "Rye",
      "Caesar Dressing", "Carter One", "Cherry Cream Soda", "Chewy",
      "Engagement", "Fontdiner Swanky", "Gluten",
      "Gochi Hand", "Graduate", "Kavivanar", "Lakki Reddy", "Leckerli One",
      "Lemon", "Macondo", "Mate SC", "Original Surfer", "Overlock",
      "Pattaya", "Permanent Marker", "Playball", "Pompiere",
      "Princess Sofia", "Pursue", "Reenie Beanie", "Rochester", "Rock Salt",
      "Rouge Script", "Sail", "Salsa", "Satisfy", "Schoolbell",
      "Shadows Into Light", "Shadows Into Light Two", "Slackey", "Smokum",
      "Sniglet", "Spicy Rice", "Stalemate", "Sue Ellen Francisco",
      "Sunshiney", "Swanky and Moo Moo", "Trade Winds", "Yellowtail",
      "Zeyada", "Bonbon", "Akronim", "Amatic SC", "Ballet",
    ],
  },
  {
    label: "Manuscrita / Caligrafia",
    fonts: [
      "Caveat", "Caveat Brush", "Dancing Script", "Pacifico", "Great Vibes",
      "Allura", "Sacramento", "Tangerine", "Parisienne", "Pinyon Script",
      "Petit Formal Script", "Mrs Saint Delafield", "Mr De Haviland",
      "Monsieur La Doulaise", "Ms Madi", "Patrick Hand", "Patrick Hand SC",
      "Architects Daughter", "Indie Flower", "Kalam", "Yellowtail",
      "Homemade Apple", "Bilbo", "Bilbo Swash Caps", "Italianno",
      "Marck Script", "Lily Script One", "League Script",
      "Mr Bedfort", "Mr Dafoe", "Niconne", "Nothing You Could Do",
      "Over the Rainbow", "Sansita Swashed", "Stalemate",
    ],
  },
  {
    label: "Decorativa / Especial",
    fonts: [
      "Bungee Outline", "Bungee Shade", "Faster One", "Bungee Inline",
      "Plaster", "Akronim", "Bonheur Royale", "Borel", "Bilbo Swash Caps",
      "Cabin Sketch", "Codystar", "Combo", "Diplomata", "Diplomata SC",
      "Engagement", "Erica One", "Fascinate", "Fascinate Inline",
      "Finger Paint", "Fontdiner Swanky",
      "Gluten", "Goblin One", "Goldman", "Gugi", "Henny Penny",
      "Holtwood One SC", "Iceberg", "Iceland", "Joti One", "Knewave",
      "Krona One", "Kumar One", "Kumar One Outline", "Lacquer", "Limelight",
      "Megrim", "Metamorphous", "Michroma", "Miltonian", "Miltonian Tattoo",
      "Miniver", "Nabla", "Nova Cut", "Nova Flat", "Nova Mono", "Nova Oval",
      "Nova Round", "Nova Script", "Nova Slim", "Nova Square", "Original Surfer",
      "Protest Guerrilla", "Protest Riot", "Protest Strike",
      "Protest Revolution", "Rampart One", "Rubik Beastly", "Rubik Bubbles",
      "Rubik Glitch", "Rubik Iso", "Rubik Lines", "Rubik Maps",
      "Rubik Marker Hatched", "Rubik Maze", "Rubik Microbe", "Rubik Mono One",
      "Rubik Moonrocks", "Rubik Pixels", "Rubik Puddles", "Rubik Spray Paint",
      "Rubik Storm", "Rubik Vinyl", "Rubik Wet Paint", "Sirin Stencil",
      "Sniglet", "Spicy Rice", "Stardos Stencil", "Tilt Neon", "Tilt Prism",
      "Tilt Warp", "Tourney", "Trade Winds", "Vibur",
    ],
  },
];

// Fontes pra TRANSIÇÃO (sentence-case, leitura corrida)
export const TRANSITION_FONT_GROUPS: { label: string; fonts: string[] }[] = [
  {
    label: "Clean / Minimal (recomendado)",
    fonts: [
      "Inter", "Manrope", "Work Sans", "Inter Tight", "Public Sans", "DM Sans",
      "Plus Jakarta Sans", "Outfit", "Onest", "Sora", "Albert Sans",
      "Geist", "Hanken Grotesk", "IBM Plex Sans", "Figtree", "Mona Sans",
      "Recursive", "Sofia Sans", "Truculenta", "Bricolage Grotesque",
      "Wix Madefor Text", "Wix Madefor Display", "Familjen Grotesk",
      "Lexend", "Lexend Deca", "Sofia Sans Condensed",
      "Sofia Sans Extra Condensed", "Sofia Sans Semi Condensed",
      "Saira Semi Condensed", "Saira Extra Condensed",
    ],
  },
  {
    label: "Humanist / Acolhedor",
    fonts: [
      "Lato", "Open Sans", "Source Sans 3", "Noto Sans", "Nunito", "Mulish",
      "Karla", "Cabin", "Quicksand", "Hind", "Heebo", "Fira Sans",
      "Comfortaa", "Catamaran", "Asap", "Ubuntu", "Yantramanav",
      "Hind Madurai", "Hind Siliguri", "Hind Vadodara", "Hind Guntur",
      "Mukta", "Mukta Mahee", "Mukta Malar", "Mukta Vaani", "Sintony",
      "Sniglet", "Spinnaker", "Sumana", "Sunflower", "Bellota", "Bellota Text",
      "Boogaloo", "Padauk", "Pavanam", "Pridi", "Quattrocento Sans",
      "Reem Kufi", "Rosario", "Ropa Sans", "Saira",
    ],
  },
  {
    label: "Geometric / Tech",
    fonts: [
      "Roboto", "Roboto Condensed", "Roboto Flex", "Saira", "Kanit", "Jost",
      "Poppins", "Be Vietnam Pro", "Space Grotesk", "Rubik", "Barlow",
      "Encode Sans", "Encode Sans Condensed", "Encode Sans Expanded",
      "Encode Sans SC", "Archivo Narrow", "Archivo SC", "Big Shoulders Text",
      "Big Shoulders Inline Text", "Big Shoulders Stencil Text",
      "Big Shoulders", "Sansita", "Saira Stencil One", "Sintony",
      "Spinnaker", "Stick No Bills", "Sunflower", "Sumana",
      "Yantramanav", "Mukta", "Sansita Swashed",
    ],
  },
  {
    label: "Serif legível (premium)",
    fonts: [
      "Roboto Slab", "Lora", "Merriweather", "Source Serif 4", "PT Serif",
      "Crimson Text", "EB Garamond", "Spectral", "Cardo", "Bitter",
      "Vollkorn", "Libre Caslon Text", "Cormorant", "Domine",
      "Abhaya Libre", "Adamina", "Aleo", "Alegreya", "Alegreya SC",
      "Almendra", "Andada Pro", "Antic Slab", "Arapey", "Arvo",
      "Bellota", "BhuTuka Expanded One", "Bonheur Royale", "Cormorant Garamond",
      "Cormorant Infant", "Cormorant SC", "Cormorant Upright",
      "Crimson Pro", "DM Serif Text", "Dosis",
      "Fenix", "Frank Ruhl Libre", "Gelasio", "Gentium Plus",
      "Glegoo", "Gloock", "Halant", "IBM Plex Serif", "Inknut Antiqua",
      "Instrument Serif", "Italiana", "Josefin Slab",
      "Kameron", "Lateef", "Libre Baskerville",
      "Marcellus", "Marko One", "Martel", "Merriweather Sans",
      "Neuton", "Newsreader", "Noticia Text", "Noto Serif", "Old Standard TT",
      "Palanquin", "Petrona", "Piazzolla", "Playfair", "Playfair Display SC",
      "Prata", "Quattrocento", "Radley", "Rosarivo",
      "Rufina", "Sahitya", "Source Serif Pro", "Spectral SC",
      "STIX Two Text", "Sumana", "Tinos", "Trirong",
      "Volkhov", "Yeseva One", "Young Serif",
    ],
  },
  {
    label: "Mono (script, código, técnico)",
    fonts: [
      "JetBrains Mono", "Fira Code", "Roboto Mono", "Space Mono",
      "IBM Plex Mono", "Source Code Pro", "Anonymous Pro", "Azeret Mono",
      "B612 Mono", "Courier Prime", "Cousine", "Cutive Mono", "DM Mono",
      "Fira Mono", "Inconsolata", "Major Mono Display", "Martian Mono",
      "Nanum Gothic Coding", "Nova Mono", "Office Code Pro",
      "Overpass Mono", "Oxygen Mono", "Red Hat Mono", "Share Tech Mono",
      "Sometype Mono", "Spline Sans Mono", "Sudo", "Syne Mono",
      "Ubuntu Mono", "VT323", "Victor Mono", "Recursive Mono Casual",
      "Recursive Mono Linear",
    ],
  },
  {
    label: "Display fina (capas, manchete)",
    fonts: [
      "Abril Fatface", "Alegreya Sans SC", "Antic Didone", "Arapey",
      "Bellefair", "Bona Nova", "Bona Nova SC", "Castoro", "Castoro Titling",
      "DM Serif Display", "Della Respira", "Eczar", "Encode Sans Expanded",
      "Forum", "Holtwood One SC", "Italiana", "Lustria", "Marcellus SC",
      "Mate SC", "Newsreader", "Old Standard TT", "Petrona", "Playfair",
      "Playfair Display SC", "Prata", "Rozha One", "Sansita",
      "Sansita Swashed", "Spectral", "Spectral SC", "Tenor Sans",
      "Trirong", "Volkhov", "Yeseva One",
    ],
  },
];

// Listas planas (compat e defaults)
export const HOOK_FONTS_ALL = HOOK_FONT_GROUPS.flatMap((g) => g.fonts);
export const TRANSITION_FONTS_ALL = TRANSITION_FONT_GROUPS.flatMap((g) => g.fonts);

/**
 * V25: Lista UNIFICADA de fontes — combina hook + transition pra que
 * ambos os selectors mostrem TODAS as fontes (estética agora flexível).
 * User pode usar fonte de hook em transição e vice-versa.
 */
export const ALL_FONT_GROUPS: { label: string; fonts: string[] }[] = (() => {
  const seen = new Set<string>();
  const out: { label: string; fonts: string[] }[] = [];
  for (const group of [...HOOK_FONT_GROUPS, ...TRANSITION_FONT_GROUPS]) {
    const dedupedFonts = group.fonts.filter((f) => {
      if (seen.has(f)) return false;
      seen.add(f);
      return true;
    });
    if (dedupedFonts.length === 0) continue;
    // Verifica se já tem grupo com esse label e mescla
    const existing = out.find((g) => g.label === group.label);
    if (existing) {
      existing.fonts.push(...dedupedFonts);
    } else {
      out.push({ label: group.label, fonts: dedupedFonts });
    }
  }
  return out;
})();

/**
 * Select especializado pra fontes — dropdown CUSTOM com:
 * - Search box no topo (filtragem em tempo real)
 * - Grupos por categoria (Impacto, Premium, etc)
 * - Cada opção renderizada na própria fonte (preview inline)
 *
 * Substituiu o <select> nativo pra dar UX melhor (busca + categorias
 * com fontes dela só). Pré-carrega todas as fontes na 1ª render.
 */
export function FontSelect({
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
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Pré-carrega TODAS as fontes
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

  // Click fora fecha o dropdown
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  // Filtragem
  const filteredGroups = useMemo(() => {
    if (!query.trim()) return groups;
    const q = query.toLowerCase().trim();
    return groups
      .map((g) => ({
        ...g,
        fonts: g.fonts.filter((f) => f.toLowerCase().includes(q)),
      }))
      .filter((g) => g.fonts.length > 0);
  }, [groups, query]);

  const totalFiltered = filteredGroups.reduce((n, g) => n + g.fonts.length, 0);

  return (
    <div className="block" ref={containerRef}>
      <span className="text-sm font-medium">{label}</span>
      <button
        onClick={(e) => {
          e.preventDefault();
          setOpen((v) => !v);
        }}
        className="mt-1 w-full rounded bg-neutral-900 border border-neutral-700 px-3 py-2 text-left flex items-center justify-between"
        style={{ fontFamily: `"${value}", system-ui, sans-serif` }}
      >
        <span className="truncate">{value}</span>
        <span className="text-neutral-500 text-xs ml-2">{open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <div className="relative">
          <div className="absolute z-50 left-0 right-0 mt-1 bg-neutral-900 border border-neutral-700 rounded-lg shadow-2xl overflow-hidden">
            <div className="p-2 border-b border-neutral-800">
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="🔍 Buscar fonte..."
                className="w-full rounded bg-neutral-800 border border-neutral-700 px-2 py-1.5 text-sm outline-none focus:border-purple-500"
                onKeyDown={(e) => {
                  if (e.key === "Escape") setOpen(false);
                }}
              />
              {query && (
                <div className="text-[10px] text-neutral-500 mt-1">
                  {totalFiltered} fonte{totalFiltered === 1 ? "" : "s"} encontrada{totalFiltered === 1 ? "" : "s"}
                </div>
              )}
            </div>
            <div
              className="max-h-80 overflow-y-auto"
              style={{ overscrollBehavior: "contain" }}
              onWheel={(e) => {
                // V30: trap scroll wheel pra não vazar pra página/sidebar.
                // overscroll-behavior CSS já cuida do bounce/refresh, mas
                // alguns browsers ainda propagam o wheel. stopPropagation
                // garante que só o dropdown consome.
                e.stopPropagation();
              }}
            >
              {filteredGroups.length === 0 ? (
                <div className="px-3 py-6 text-center text-xs text-neutral-500">
                  Nenhuma fonte com &quot;{query}&quot;
                </div>
              ) : (
                filteredGroups.map((g) => (
                  <div key={g.label}>
                    <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-purple-300 bg-neutral-950 sticky top-0 border-b border-neutral-800">
                      {g.label}
                    </div>
                    {g.fonts.map((f) => (
                      <button
                        key={f}
                        onClick={() => {
                          onChange(f);
                          setOpen(false);
                          setQuery("");
                        }}
                        className={`w-full text-left px-3 py-1.5 text-sm hover:bg-purple-900/30 ${
                          f === value ? "bg-purple-900/40 text-purple-200" : ""
                        }`}
                        style={{ fontFamily: `"${f}", system-ui, sans-serif` }}
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
