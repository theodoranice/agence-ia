import "server-only";
import { createHash } from "crypto";
import { readFile, writeFile } from "fs/promises";
import path from "path";
import { one, q } from "../db";
import { recordUsage } from "../missions";
import { FORMAT_BY_ID, PRICES, type Format } from "./config";
import { MODELS } from "./models";
import { download, falRun, falUpload, fileUrl, ProviderError } from "./fal";
import { speak } from "./eleven";
import { abs, duration, exists, ffmpeg, FONTS_DIR, rel, videoDir } from "./media";
import { getProfile, LANG_NAME, remotePhoto, remoteVoice, type Profile } from "./profile";
import type { Progress, Scene, Storyboard, VideoRow, WordTime } from "./types";

// ---------------------------------------------------------------- état des rendus en cours
const active = new Map<string, AbortController>();
export const isRendering = (id: string) => active.has(id);
export function cancelRender(id: string) {
  active.get(id)?.abort();
}

const hash = (parts: unknown[]) => createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 16);

type Ctx = {
  video: VideoRow;
  sb: Storyboard;
  format: Format;
  dir: string;
  signal: AbortSignal;
  profile: Profile | null;
  voice: { provider: "chatterbox" | "elevenlabs"; ref: string | null; elevenId: string | null };
  lang: string;
  productRemote: string[];
};

async function setProgress(id: string, p: Progress) {
  await q("UPDATE studio_videos SET progress=$2, updated_at=now() WHERE id=$1", [id, JSON.stringify({ ...p, updatedAt: Date.now() })]);
}

let saveChain = Promise.resolve();
function saveStoryboard(ctx: Ctx) {
  // écritures en série pour ne pas mélanger des versions
  saveChain = saveChain.then(() => q("UPDATE studio_videos SET storyboard=$2, updated_at=now() WHERE id=$1", [ctx.video.id, JSON.stringify(ctx.sb)]).then(() => undefined));
  return saveChain;
}

async function charge(ctx: Ctx, model: string, cost: number) {
  if (cost <= 0) return;
  await recordUsage({
    userId: ctx.video.user_id,
    videoId: ctx.video.id,
    kind: "video",
    model,
    usage: { input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_write_tokens: 0, web_searches: 0 },
    cost,
  });
  await q("UPDATE studio_videos SET cost_usd = cost_usd + $2 WHERE id=$1", [ctx.video.id, cost]);
}

async function pool<T>(items: T[], size: number, fn: (x: T, i: number) => Promise<void>, signal: AbortSignal) {
  let next = 0;
  const workers = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) {
      if (signal.aborted) throw new Error("Génération annulée.");
      const i = next++;
      await fn(items[i], i);
    }
  });
  await Promise.all(workers);
}

// ---------------------------------------------------------------- voix
function splitText(text: string, max = 280): string[] {
  const sentences = text.match(/[^.!?…]+[.!?…]*\s*/g) ?? [text];
  const out: string[] = [];
  let cur = "";
  for (const s of sentences) {
    if ((cur + s).length <= max) cur += s;
    else {
      if (cur.trim()) out.push(cur.trim());
      if (s.length <= max) cur = s;
      else {
        // phrase trop longue : coupe aux virgules, puis aux espaces
        let rest = s;
        while (rest.length > max) {
          let cut = rest.lastIndexOf(",", max);
          if (cut < max / 2) cut = rest.lastIndexOf(" ", max);
          if (cut <= 0) cut = max;
          out.push(rest.slice(0, cut + 1).trim());
          rest = rest.slice(cut + 1);
        }
        cur = rest;
      }
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** Répartit les mots d'un texte sur une durée, proportionnellement à leur longueur. */
function distribute(text: string, offset: number, dur: number): WordTime[] {
  const words = text.split(/\s+/).filter(Boolean);
  const weights = words.map((w) => w.length + 1.5);
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  let t = offset;
  return words.map((w, i) => {
    const d = (weights[i] / total) * dur;
    const r = { word: w, start: t, end: t + d };
    t += d;
    return r;
  });
}

async function makeVoice(ctx: Ctx, s: Scene) {
  const key = hash([s.narration, ctx.voice.provider, ctx.voice.ref, ctx.voice.elevenId, ctx.lang]);
  if (s.audio && s.audio_key === key && (await exists(abs(s.audio)))) return;
  const out = path.join(ctx.dir, `voix_${s.id}.wav`);

  if (!s.narration) {
    await ffmpeg(["-f", "lavfi", "-i", "anullsrc=r=48000:cl=mono", "-t", "2", out], { signal: ctx.signal });
    s.words = [];
  } else if (ctx.voice.provider === "elevenlabs" && ctx.voice.elevenId) {
    const mp3 = path.join(ctx.dir, `voix_${s.id}.mp3`);
    s.words = await speak(ctx.voice.elevenId, s.narration, mp3, ctx.signal);
    await ffmpeg(["-i", mp3, "-ar", "48000", "-ac", "1", out], { signal: ctx.signal });
    if (!s.words.length) s.words = distribute(s.narration, 0, await duration(out));
  } else {
    const parts: string[] = [];
    const words: WordTime[] = [];
    let offset = 0;
    for (const [k, chunk] of splitText(s.narration).entries()) {
      const input: Record<string, unknown> = {
        text: chunk,
        voice: ctx.voice.ref ?? LANG_NAME[ctx.lang] ?? "french",
        exaggeration: 0.5,
        temperature: 0.7,
      };
      if (ctx.voice.ref) input.custom_audio_language = LANG_NAME[ctx.lang] ?? "french";
      const res = await falRun(MODELS.tts, input, { signal: ctx.signal, timeoutMs: 5 * 60_000 });
      const raw = path.join(ctx.dir, `tts_${s.id}_${k}_raw`);
      await download(fileUrl(res, "audio"), raw, ctx.signal);
      const clean = path.join(ctx.dir, `tts_${s.id}_${k}.wav`);
      // retire les silences en début et fin de morceau
      await ffmpeg(
        ["-i", raw, "-af", "silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse", "-ar", "48000", "-ac", "1", clean],
        { signal: ctx.signal },
      );
      const d = await duration(clean);
      words.push(...distribute(chunk, offset, d));
      offset += d + 0.12;
      parts.push(clean);
      await charge(ctx, MODELS.tts, (chunk.length / 1000) * PRICES.ttsPer1kChars);
    }
    if (parts.length === 1) {
      await ffmpeg(["-i", parts[0], out], { signal: ctx.signal });
    } else {
      const inputs = parts.flatMap((p) => ["-i", p]);
      const filt = parts.map((_, i) => `[${i}:a]apad=pad_dur=0.12[a${i}]`).join(";") + ";" + parts.map((_, i) => `[a${i}]`).join("") + `concat=n=${parts.length}:v=0:a=1[o]`;
      await ffmpeg([...inputs, "-filter_complex", filt, "-map", "[o]", "-ar", "48000", "-ac", "1", out], { signal: ctx.signal });
    }
    s.words = words;
  }
  s.audio = rel(out);
  s.audio_key = key;
  s.duration = Math.round((await duration(out)) * 1000) / 1000;
}

// ---------------------------------------------------------------- visuels
function imageSize(f: Format) {
  return f.aspect === "9:16" ? { width: 864, height: 1536 } : { width: 1536, height: 864 };
}

async function genImage(ctx: Ctx, s: Scene): Promise<{ url: string; file: string }> {
  const size = imageSize(ctx.format);
  const framing = ctx.format.aspect === "9:16" ? "vertical 9:16 composition, subject centered, space at the bottom for captions" : "horizontal 16:9 cinematic composition";
  const res = await falRun(MODELS.image, {
    prompt: [ctx.sb.style, s.prompt, framing].filter(Boolean).join(". "),
    image_size: size,
    num_images: 1,
    output_format: "jpeg",
  }, { signal: ctx.signal });
  const url = fileUrl(res, "image");
  const file = path.join(ctx.dir, `image_${s.id}.jpg`);
  await download(url, file, ctx.signal);
  await charge(ctx, MODELS.image, ((size.width * size.height) / 1e6) * PRICES.imagePerMp);
  return { url, file };
}

async function makeVisual(ctx: Ctx, s: Scene) {
  if (s.visual === "text") {
    s.asset = undefined;
    s.asset_key = undefined;
    return;
  }
  const key = hash([
    s.visual, s.prompt, s.motion, ctx.sb.style, ctx.format.aspect,
    s.visual === "avatar" ? [s.audio_key, ctx.profile?.photo_path] : null,
    s.visual === "product" ? ctx.video.brief.product_images : null,
    s.visual === "clip" ? (s.duration ?? 0) > 5.5 : null,
  ]);
  if (s.asset && s.asset_key === key && (await exists(abs(s.asset)))) return;

  if (s.visual === "image") {
    const img = await genImage(ctx, s);
    s.remote_image = img.url;
    s.asset = rel(img.file);
  } else if (s.visual === "product") {
    if (!ctx.productRemote.length) throw new ProviderError("studio", "Aucune photo produit pour une scène « Produit ».");
    const res = await falRun(MODELS.product, {
      prompt: [ctx.sb.style, s.prompt, "Keep the product exactly as in the reference photo: same shape, colors, label and text."].filter(Boolean).join(". "),
      image_urls: ctx.productRemote.slice(0, 3),
      aspect_ratio: ctx.format.aspect,
      num_images: 1,
      output_format: "jpeg",
    }, { signal: ctx.signal });
    const file = path.join(ctx.dir, `produit_${s.id}.jpg`);
    await download(fileUrl(res, "image"), file, ctx.signal);
    await charge(ctx, MODELS.product, PRICES.productImage);
    s.asset = rel(file);
  } else if (s.visual === "clip") {
    const img = await genImage(ctx, s);
    const long = (s.duration ?? 0) > 5.5;
    const res = await falRun(MODELS.clip, {
      prompt: s.motion || s.prompt || "slow cinematic camera movement",
      image_url: img.url,
      duration: long ? "10" : "5",
    }, { signal: ctx.signal, timeoutMs: 20 * 60_000 });
    const file = path.join(ctx.dir, `plan_${s.id}.mp4`);
    await download(fileUrl(res, "video"), file, ctx.signal);
    await charge(ctx, MODELS.clip, PRICES.clip5s + (long ? 5 * PRICES.clipExtraSec : 0));
    s.asset = rel(file);
  } else if (s.visual === "avatar") {
    if (!ctx.profile) throw new ProviderError("studio", "Avatar non configuré : ajoute ta photo dans Studio > Mon avatar.");
    if (!s.audio) throw new ProviderError("studio", "La voix de la scène avatar n'a pas été générée.");
    const mp3 = path.join(ctx.dir, `voix_${s.id}.avatar.mp3`);
    await ffmpeg(["-i", abs(s.audio), "-ar", "44100", "-ac", "1", "-b:a", "128k", mp3], { signal: ctx.signal });
    const audioUrl = await falUpload(await readFile(mp3), "audio/mpeg", `voix_${s.id}.mp3`);
    const res = await falRun(MODELS.avatar, {
      image_url: await remotePhoto(ctx.profile),
      audio_url: audioUrl,
      prompt: "The person speaks naturally to the camera with subtle head movements and natural blinking.",
    }, { signal: ctx.signal, timeoutMs: 25 * 60_000 });
    const file = path.join(ctx.dir, `avatar_${s.id}.mp4`);
    await download(fileUrl(res, "video"), file, ctx.signal);
    await charge(ctx, MODELS.avatar, (s.duration ?? 0) * PRICES.avatarPerSec);
    s.asset = rel(file);
  }
  s.asset_key = key;
}

async function makeMusic(ctx: Ctx, total: number) {
  const dur = Math.min(180, Math.max(10, Math.ceil(total)));
  const prompt = ctx.sb.music_prompt || "soft modern instrumental background music, no vocals";
  const key = hash([prompt, dur]);
  if (ctx.sb.music && ctx.sb.music_key === key && (await exists(abs(ctx.sb.music)))) return;
  const res = await falRun(MODELS.music, { prompt: `${prompt}, instrumental, no vocals`, duration: dur }, { signal: ctx.signal });
  const file = path.join(ctx.dir, "musique.wav");
  await download(fileUrl(res, "audio"), file, ctx.signal);
  await charge(ctx, MODELS.music, (dur / 60) * PRICES.musicPerMin);
  ctx.sb.music = rel(file);
  ctx.sb.music_key = key;
}

// ---------------------------------------------------------------- sous-titres
const assTime = (t: number) => {
  const cs = Math.max(0, Math.round(t * 100));
  const h = Math.floor(cs / 360000), m = Math.floor((cs % 360000) / 6000), s = Math.floor((cs % 6000) / 100), c = cs % 100;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(c).padStart(2, "0")}`;
};
const assText = (s: string) => s.replace(/\\/g, "/").replace(/[{}]/g, "").replace(/\n/g, " ");

function buildAss(f: Format, timeline: { s: Scene; start: number; d: number }[]) {
  const vertical = f.aspect === "9:16";
  const W = f.width, H = f.height;
  const styles = vertical
    ? [
        `Style: Cap,Montserrat ExtraBold,84,&H00FFFFFF,&H000000FF,&H00000000,&H78000000,0,0,0,0,100,100,0,0,1,7,3,2,70,70,${Math.round(H * 0.27)},1`,
        `Style: Top,Montserrat ExtraBold,68,&H00FFFFFF,&H000000FF,&H00487A3D,&H00000000,0,0,0,0,100,100,0,0,3,20,0,8,90,90,${Math.round(H * 0.11)},1`,
        `Style: Title,Montserrat ExtraBold,104,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,5,90,90,0,1`,
      ]
    : [
        `Style: Cap,Montserrat SemiBold,54,&H00FFFFFF,&H000000FF,&H00000000,&H96000000,0,0,0,0,100,100,0,0,1,3,1,2,160,160,64,1`,
        `Style: Top,Montserrat ExtraBold,56,&H00FFFFFF,&H000000FF,&H00487A3D,&H00000000,0,0,0,0,100,100,0,0,3,16,0,8,120,120,70,1`,
        `Style: Title,Montserrat ExtraBold,96,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,5,160,160,0,1`,
      ];
  const ev: string[] = [];
  const HL = "&H004DE1FF&"; // jaune doux pour le mot prononcé
  for (const { s, start, d } of timeline) {
    const end = start + d;
    if (s.visual === "text") {
      const title = s.on_screen || s.narration;
      ev.push(`Dialogue: 1,${assTime(start)},${assTime(end)},Title,,0,0,0,,{\\fad(250,250)\\fscx92\\fscy92\\t(0,400,\\fscx100\\fscy100)}${assText(title)}`);
      continue;
    }
    if (s.on_screen) ev.push(`Dialogue: 1,${assTime(start)},${assTime(end)},Top,,0,0,0,,{\\fad(150,150)}${assText(s.on_screen)}`);
    const words = (s.words ?? []).map((w) => ({ ...w, start: start + w.start, end: start + w.end }));
    if (!words.length) continue;
    const n = f.captionWords;
    for (let i = 0; i < words.length; i += n) {
      const chunk = words.slice(i, i + n);
      const chunkEnd = Math.min(end, (words[i + n]?.start ?? chunk[chunk.length - 1].end + 0.25));
      if (vertical) {
        chunk.forEach((w, j) => {
          const a = j === 0 ? chunk[0].start : w.start;
          const b = j === chunk.length - 1 ? chunkEnd : chunk[j + 1].start;
          if (b <= a) return;
          const pop = j === 0 ? "{\\fscx88\\fscy88\\t(0,90,\\fscx100\\fscy100)}" : "";
          const txt = chunk.map((x, k) => (k === j ? `{\\c${HL}}${assText(x.word)}{\\c&H00FFFFFF&}` : assText(x.word))).join(" ");
          ev.push(`Dialogue: 0,${assTime(a)},${assTime(b)},Cap,,0,0,0,,${pop}${txt}`);
        });
      } else {
        ev.push(`Dialogue: 0,${assTime(chunk[0].start)},${assTime(chunkEnd)},Cap,,0,0,0,,${assText(chunk.map((x) => x.word).join(" "))}`);
      }
    }
  }
  return `[Script Info]
ScriptType: v4.00+
PlayResX: ${W}
PlayResY: ${H}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
${styles.join("\n")}

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${ev.join("\n")}
`;
}

// ---------------------------------------------------------------- montage
async function compose(ctx: Ctx) {
  const f = ctx.format;
  const W = f.width, H = f.height, FPS = 30;
  const gap = f.id === "long_narration" ? 0.45 : 0.12;
  const timeline: { s: Scene; start: number; d: number }[] = [];
  let t = 0;
  for (const s of ctx.sb.scenes) {
    // durée arrondie à l'image près pour garder le son et l'image synchronisés
    const d = Math.max(1, Math.round(((s.duration ?? 2) + gap) * FPS)) / FPS;
    timeline.push({ s, start: t, d });
    t += d;
  }
  const total = t;
  const segs: string[] = [];
  const auds: string[] = [];
  for (const [i, { s, d }] of timeline.entries()) {
    await setProgress(ctx.video.id, { phase: "compose", label: `Montage de la scène ${i + 1} sur ${timeline.length}`, done: i, total: timeline.length + 2, startedAt: Date.now() });
    const seg = path.join(ctx.dir, `seg_${String(i).padStart(3, "0")}.mp4`);
    const frames = Math.round(d * FPS);
    const enc = ["-r", String(FPS), "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-an"];
    const asset = s.asset ? abs(s.asset) : null;
    if (asset && (s.visual === "image" || s.visual === "product") && (await exists(asset))) {
      const bw = Math.round((W * 1.25) / 2) * 2, bh = Math.round((H * 1.25) / 2) * 2;
      const step = (0.1 / frames).toFixed(6);
      const z = i % 2 === 0 ? `min(1+${step}*on,1.1)` : `max(1.1-${step}*on,1)`;
      const xs = ["iw/2-(iw/zoom/2)", "(iw-iw/zoom)*on/" + frames, "(iw-iw/zoom)*(1-on/" + frames + ")"][i % 3];
      await ffmpeg([
        "-loop", "1", "-framerate", String(FPS), "-t", String(d), "-i", asset,
        "-vf", `scale=${bw}:${bh}:force_original_aspect_ratio=increase,crop=${bw}:${bh},zoompan=z='${z}':x='${xs}':y='ih/2-(ih/zoom/2)':d=1:s=${W}x${H}:fps=${FPS},format=yuv420p`,
        "-frames:v", String(frames), ...enc, seg,
      ], { signal: ctx.signal, cwd: ctx.dir });
    } else if (asset && (s.visual === "clip" || s.visual === "avatar") && (await exists(asset))) {
      await ffmpeg([
        "-i", asset,
        "-vf", `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},fps=${FPS},tpad=stop_mode=clone:stop_duration=${d},format=yuv420p`,
        "-t", String(d), "-frames:v", String(frames), ...enc, seg,
      ], { signal: ctx.signal });
    } else {
      // carton : fond dégradé sombre
      await ffmpeg([
        "-f", "lavfi", "-i", `gradients=s=${W}x${H}:c0=0x101914:c1=0x21352b:x0=0:y0=0:x1=${W}:y1=${H}:d=${d}:r=${FPS}:speed=0.002`,
        "-frames:v", String(frames), ...enc, seg,
      ], { signal: ctx.signal });
    }
    segs.push(seg);
    const a = path.join(ctx.dir, `aud_${String(i).padStart(3, "0")}.wav`);
    if (s.audio) await ffmpeg(["-i", abs(s.audio), "-af", `apad=whole_dur=${d}`, "-t", String(d), "-ar", "48000", "-ac", "2", "-c:a", "pcm_s16le", a], { signal: ctx.signal });
    else await ffmpeg(["-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo", "-t", String(d), "-c:a", "pcm_s16le", a], { signal: ctx.signal });
    auds.push(a);
  }

  await setProgress(ctx.video.id, { phase: "compose", label: "Assemblage, mixage et sous-titres", done: timeline.length, total: timeline.length + 2, startedAt: Date.now() });
  await writeFile(path.join(ctx.dir, "segments.txt"), segs.map((p) => `file '${path.basename(p)}'`).join("\n"));
  await writeFile(path.join(ctx.dir, "audios.txt"), auds.map((p) => `file '${path.basename(p)}'`).join("\n"));
  await ffmpeg(["-f", "concat", "-safe", "0", "-i", "segments.txt", "-c", "copy", "video.mp4"], { cwd: ctx.dir, signal: ctx.signal });
  await ffmpeg(["-f", "concat", "-safe", "0", "-i", "audios.txt", "-c", "copy", "narration.wav"], { cwd: ctx.dir, signal: ctx.signal });

  const fadeOut = Math.max(0, total - 1.2).toFixed(2);
  if (ctx.sb.music && (await exists(abs(ctx.sb.music)))) {
    await ffmpeg([
      "-i", "narration.wav", "-stream_loop", "-1", "-i", abs(ctx.sb.music),
      "-filter_complex",
      `[1:a]aformat=sample_rates=48000:channel_layouts=stereo,atrim=0:${total.toFixed(2)},asetpts=N/SR/TB,volume=0.32,afade=t=in:d=1,afade=t=out:st=${fadeOut}:d=1.2[m];` +
        `[0:a]asplit=2[v][sc];[m][sc]sidechaincompress=threshold=0.02:ratio=10:attack=15:release=450[md];` +
        `[v][md]amix=inputs=2:normalize=0:duration=first,loudnorm=I=-14:TP=-1.5:LRA=11[o]`,
      "-map", "[o]", "-ar", "48000", "-ac", "2", "audio.wav",
    ], { cwd: ctx.dir, signal: ctx.signal });
  } else {
    await ffmpeg(["-i", "narration.wav", "-af", "loudnorm=I=-14:TP=-1.5:LRA=11", "-ar", "48000", "-ac", "2", "audio.wav"], { cwd: ctx.dir, signal: ctx.signal });
  }

  await writeFile(path.join(ctx.dir, "sous-titres.ass"), buildAss(f, timeline));
  await ffmpeg([
    "-i", "video.mp4", "-i", "audio.wav",
    "-vf", `subtitles=sous-titres.ass:fontsdir=${FONTS_DIR}`,
    "-map", "0:v", "-map", "1:a", "-c:v", "libx264", "-preset", "medium", "-crf", "21", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "160k", "-shortest", "-movflags", "+faststart", "final.mp4",
  ], { cwd: ctx.dir, signal: ctx.signal });
  await ffmpeg(["-ss", String(Math.min(1.2, total / 3)), "-i", "final.mp4", "-frames:v", "1", "-q:v", "3", "miniature.jpg"], { cwd: ctx.dir, signal: ctx.signal });
  return { total };
}

// ---------------------------------------------------------------- orchestration
export async function renderVideo(videoId: string) {
  if (active.has(videoId)) return;
  const ctl = new AbortController();
  active.set(videoId, ctl);
  let t0 = Date.now();
  try {
    const video = await one<VideoRow>("SELECT * FROM studio_videos WHERE id=$1", [videoId]);
    if (!video || !video.storyboard) return;
    t0 = video.progress?.startedAt ?? t0;
    const profile = await getProfile(video.user_id);
    const sb = video.storyboard;
    const format = FORMAT_BY_ID[video.format];
    const dir = await videoDir(video.id);
    const usesClone = !!profile?.consent_at;
    const voice =
      usesClone && profile?.voice_provider === "elevenlabs" && profile.eleven_voice_id
        ? { provider: "elevenlabs" as const, ref: null, elevenId: profile.eleven_voice_id }
        : { provider: "chatterbox" as const, ref: usesClone && profile?.voice_sample_path ? await remoteVoice(profile) : null, elevenId: null };
    const ctx: Ctx = { video, sb, format, dir, signal: ctl.signal, profile, voice, lang: video.brief.language || "fr", productRemote: [] };

    await q("UPDATE studio_videos SET status='rendering', error=NULL, output_path=NULL, thumb_path=NULL, updated_at=now() WHERE id=$1", [videoId]);

    // 1. voix
    let done = 0;
    await setProgress(videoId, { phase: "voice", label: "Enregistrement de la voix", done: 0, total: sb.scenes.length, startedAt: t0 });
    await pool(sb.scenes, ctx.voice.provider === "elevenlabs" ? 2 : 3, async (s) => {
      await makeVoice(ctx, s);
      done += 1;
      await saveStoryboard(ctx);
      await setProgress(videoId, { phase: "voice", label: `Voix : scène ${done} sur ${sb.scenes.length}`, done, total: sb.scenes.length, startedAt: t0 });
    }, ctl.signal);

    // 2. visuels (images, produit, plans vidéo, avatar)
    const needs = sb.scenes.filter((s) => s.visual !== "text");
    if (needs.some((s) => s.visual === "product")) {
      ctx.productRemote = await Promise.all(
        (video.brief.product_images ?? []).slice(0, 3).map(async (p, i) => falUpload(await readFile(abs(p)), "image/jpeg", `produit_${i}.jpg`)),
      );
    }
    done = 0;
    const label = (s: Scene) => ({ image: "Image", product: "Mise en scène du produit", clip: "Plan vidéo IA", avatar: "Avatar parlant", text: "Carton" })[s.visual];
    await setProgress(videoId, { phase: "visuals", label: "Création des visuels", done: 0, total: needs.length, startedAt: t0 });
    await pool(needs, 3, async (s) => {
      await makeVisual(ctx, s);
      done += 1;
      await saveStoryboard(ctx);
      await setProgress(videoId, { phase: "visuals", label: `${label(s)} prêt (${done} sur ${needs.length})`, done, total: needs.length, startedAt: t0 });
    }, ctl.signal);

    // 3. musique
    const total = sb.scenes.reduce((a, s) => a + (s.duration ?? 2), 0);
    if (video.brief.music) {
      await setProgress(videoId, { phase: "music", label: "Composition de la musique", done: 0, total: 1, startedAt: t0 });
      await makeMusic(ctx, total);
      await saveStoryboard(ctx);
    }

    // 4. montage
    await compose(ctx);
    await saveStoryboard(ctx);
    await q(
      "UPDATE studio_videos SET status='done', output_path=$2, thumb_path=$3, progress=$4, updated_at=now() WHERE id=$1",
      [videoId, rel(path.join(dir, "final.mp4")), rel(path.join(dir, "miniature.jpg")), JSON.stringify({ phase: "done", label: "Vidéo prête", startedAt: t0, updatedAt: Date.now() })],
    );
  } catch (e) {
    const msg = ctl.signal.aborted ? "Génération annulée." : e instanceof Error ? e.message : "Erreur inconnue.";
    console.error("[studio] rendu", videoId, e);
    await q("UPDATE studio_videos SET status=$2, error=$3, updated_at=now() WHERE id=$1", [videoId, ctl.signal.aborted ? "cancelled" : "failed", msg]).catch(() => {});
  } finally {
    active.delete(videoId);
  }
}
