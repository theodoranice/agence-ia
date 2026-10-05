// Modèles et tarifs (USD par million de tokens). Vérifie les prix sur
// https://platform.claude.com/docs/en/about-claude/pricing — surcharge possible via les variables d'environnement.

export type Tier = "rapide" | "standard" | "approfondi";
export const TIERS: { id: Tier; label: string; hint: string }[] = [
  { id: "rapide", label: "Rapide", hint: "Haiku · réponses courtes, peu coûteuses" },
  { id: "standard", label: "Standard", hint: "Sonnet · le bon équilibre" },
  { id: "approfondi", label: "Approfondi", hint: "Opus · analyses longues et complexes" },
];

type Price = { input: number; output: number; cacheRead: number; cacheWrite: number };

function env(name: string, fallback: string) {
  return (typeof process !== "undefined" && process.env[name]) || fallback;
}

export function modelFor(tier: Tier): string {
  if (tier === "rapide") return env("MODEL_RAPIDE", "claude-haiku-4-5");
  if (tier === "approfondi") return env("MODEL_APPROFONDI", "claude-opus-5-5");
  return env("MODEL_STANDARD", "claude-sonnet-5-5");
}

const PRICES: Record<string, Price> = {
  "claude-haiku-4-5": { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
};
const FALLBACK: Price = { input: 4, output: 20, cacheRead: 0.4, cacheWrite: 5 };

export const WEB_SEARCH_USD = Number(env("WEB_SEARCH_USD", "0.01")); // 10 $ / 1 000 recherches

export function priceFor(model: string): Price {
  const key = Object.keys(PRICES).find((k) => model.startsWith(k));
  return key ? PRICES[key] : FALLBACK;
}

export type Usage = {
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  web_searches: number;
};

export function costUsd(model: string, u: Usage): number {
  const p = priceFor(model);
  return (
    (u.input_tokens * p.input +
      u.output_tokens * p.output +
      u.cache_read_tokens * p.cacheRead +
      u.cache_write_tokens * p.cacheWrite) /
      1e6 +
    u.web_searches * WEB_SEARCH_USD
  );
}

export function isTier(x: unknown): x is Tier {
  return x === "rapide" || x === "standard" || x === "approfondi";
}
