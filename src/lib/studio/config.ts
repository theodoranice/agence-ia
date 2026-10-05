// Studio vidéo — formats, modèles et tarifs (USD). Partagé entre serveur et interface.
// Les identifiants et prix sont surchargeables par variables d'environnement côté serveur.
// Tarifs vérifiés sur fal.ai en octobre 2026 : à revérifier de temps en temps.

export type FormatId = "short_vente" | "short_edu" | "long_narration";
export type Visual = "avatar" | "image" | "product" | "clip" | "text";

export type Format = {
  id: FormatId;
  label: string;
  hint: string;
  aspect: "9:16" | "16:9";
  width: number;
  height: number;
  minSec: number;
  maxSec: number;
  defaultSec: number;
  avatarDefault: boolean;
  maxClips: number;
  captionWords: number; // mots par sous-titre
};

export const FORMATS: Format[] = [
  {
    id: "short_vente", label: "Short de vente", hint: "Présenter et vendre un produit sur TikTok, Reels ou Shorts",
    aspect: "9:16", width: 1080, height: 1920, minSec: 15, maxSec: 60, defaultSec: 35, avatarDefault: true, maxClips: 3, captionWords: 3,
  },
  {
    id: "short_edu", label: "Short éducatif", hint: "Expliquer, donner une astuce ou raconter en moins d'une minute",
    aspect: "9:16", width: 1080, height: 1920, minSec: 20, maxSec: 90, defaultSec: 45, avatarDefault: true, maxClips: 3, captionWords: 3,
  },
  {
    id: "long_narration", label: "Vidéo longue narrée", hint: "Format YouTube horizontal type Mythoria : voix off, images, musique",
    aspect: "16:9", width: 1920, height: 1080, minSec: 60, maxSec: 900, defaultSec: 480, avatarDefault: false, maxClips: 6, captionWords: 7,
  },
];
export const FORMAT_BY_ID = Object.fromEntries(FORMATS.map((f) => [f.id, f])) as Record<FormatId, Format>;

export const VISUALS: { id: Visual; label: string; hint: string }[] = [
  { id: "avatar", label: "Mon avatar", hint: "Toi qui parles face caméra (photo + voix animées)" },
  { id: "image", label: "Image", hint: "Illustration générée, animée par un zoom lent" },
  { id: "product", label: "Produit", hint: "Ta photo produit mise en scène" },
  { id: "clip", label: "Plan vidéo IA", hint: "Image animée par un vrai mouvement (plus cher)" },
  { id: "text", label: "Carton texte", hint: "Grand texte sur fond uni, gratuit" },
];

// Débit de parole moyen pour estimer la durée d'un texte.
export const CHARS_PER_SEC = 15;

export const PRICES = {
  imagePerMp: 0.012, // FLUX 2
  productImage: 0.039, // Nano Banana edit
  clip5s: 0.21, // Kling 2.5 Turbo standard, 5 s
  clipExtraSec: 0.042,
  avatarPerSec: 0.0562, // Kling AI Avatar v2 standard
  ttsPer1kChars: 0.025, // Chatterbox multilingue
  musicPerMin: 0.02, // CassetteAI
};

export type SceneLike = { narration: string; visual: Visual };

/** Estimation du coût de génération d'un storyboard (hors scénario, déjà payé). */
export function estimateCost(opts: {
  format: Format;
  scenes: SceneLike[];
  voiceProvider: "chatterbox" | "elevenlabs";
  music: boolean;
}) {
  const { format, scenes } = opts;
  const mp = (format.width === 1080 ? 864 * 1536 : 1536 * 864) / 1e6;
  let images = 0, product = 0, clips = 0, avatar = 0, chars = 0, seconds = 0;
  for (const s of scenes) {
    const sec = Math.max(1.5, s.narration.length / CHARS_PER_SEC);
    seconds += sec;
    chars += s.narration.length;
    if (s.visual === "image") images += 1;
    if (s.visual === "product") product += 1;
    if (s.visual === "clip") {
      images += 1;
      clips += sec > 5.5 ? PRICES.clip5s + 5 * PRICES.clipExtraSec : PRICES.clip5s;
    }
    if (s.visual === "avatar") avatar += sec;
  }
  const lines = {
    voix: opts.voiceProvider === "chatterbox" ? (chars / 1000) * PRICES.ttsPer1kChars : 0,
    images: images * mp * PRICES.imagePerMp,
    produit: product * PRICES.productImage,
    plans: clips,
    avatar: avatar * PRICES.avatarPerSec,
    musique: opts.music ? Math.max(10, seconds) / 60 * PRICES.musicPerMin : 0,
  };
  const total = Object.values(lines).reduce((a, b) => a + b, 0);
  return { total, lines, seconds: Math.round(seconds), avatarSeconds: Math.round(avatar) };
}
