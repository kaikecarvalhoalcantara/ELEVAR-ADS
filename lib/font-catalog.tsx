"use client";

import { useEffect } from "react";

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
 * Select especializado pra fontes — agrupa por categoria via <optgroup>
 * e renderiza cada opção na própria fonte (preview inline).
 *
 * Pré-carrega TODAS as fontes do dropdown na 1ª render — assim cada
 * <option> aparece na própria fonte. Único request ao Google Fonts.
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
