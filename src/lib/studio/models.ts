import "server-only";

// Identifiants des modèles fal.ai, surchargeables sans toucher au code.
const env = (k: string, d: string) => process.env[k] || d;

export const MODELS = {
  image: env("STUDIO_MODEL_IMAGE", "fal-ai/flux-2"),
  product: env("STUDIO_MODEL_PRODUCT", "fal-ai/nano-banana/edit"),
  clip: env("STUDIO_MODEL_CLIP", "fal-ai/kling-video/v2.5-turbo/standard/image-to-video"),
  avatar: env("STUDIO_MODEL_AVATAR", "fal-ai/kling-video/ai-avatar/v2/standard"),
  tts: env("STUDIO_MODEL_TTS", "fal-ai/chatterbox/text-to-speech/multilingual"),
  music: env("STUDIO_MODEL_MUSIC", "cassetteai/music-generator"),
};

export const ELEVEN_MODEL = env("ELEVENLABS_MODEL", "eleven_multilingual_v2");

export const URLS = {
  falQueue: env("FAL_QUEUE_URL", "https://queue.fal.run"),
  falRest: env("FAL_REST_URL", "https://rest.fal.ai"),
  eleven: env("ELEVENLABS_URL", "https://api.elevenlabs.io"),
};
