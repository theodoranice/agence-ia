import type { FormatId, Visual } from "./config";

export type WordTime = { word: string; start: number; end: number };

export type Scene = {
  id: string;
  narration: string;
  visual: Visual;
  prompt: string; // description visuelle (anglais) pour les modèles d'image
  motion?: string; // mouvement pour les plans vidéo IA
  on_screen?: string; // texte court affiché en haut de l'écran
  // Rempli pendant la génération :
  audio?: string;
  audio_key?: string;
  words?: WordTime[];
  duration?: number;
  asset?: string;
  asset_key?: string;
  remote_image?: string;
};

export type Storyboard = {
  title: string;
  caption: string;
  hashtags: string[];
  style: string; // direction artistique commune à toutes les images
  music_prompt: string;
  scenes: Scene[];
  music?: string;
  music_key?: string;
};

export type Brief = {
  topic: string;
  audience?: string;
  goal?: string;
  cta?: string;
  tone?: string;
  language: "fr" | "en";
  duration: number;
  avatar: boolean;
  clips: number;
  music: boolean;
  notes?: string;
  product?: { name?: string; price?: string; description?: string };
  product_images?: string[]; // chemins relatifs dans MEDIA_DIR
  product_remote?: string[];
  example_urls?: string[]; // vidéos de référence données par l'utilisateur
};

export type Progress = {
  phase?: "script" | "voice" | "visuals" | "music" | "compose" | "done";
  label?: string;
  done?: number;
  total?: number;
  startedAt?: number;
  updatedAt?: number;
};

export type VideoRow = {
  id: string;
  user_id: string;
  project_id: string | null;
  run_id: string | null;
  format: FormatId;
  title: string;
  brief: Brief;
  storyboard: Storyboard | null;
  status: "scripting" | "ready" | "rendering" | "done" | "failed" | "cancelled";
  progress: Progress;
  output_path: string | null;
  thumb_path: string | null;
  estimate_usd: string;
  cost_usd: string;
  error: string | null;
  created_at: string;
  updated_at: string;
};
