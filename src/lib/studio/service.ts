import "server-only";
import { one, q } from "../db";
import type { User } from "../auth";
import { friendlyApiError } from "../claude";
import { estimateCost, FORMAT_BY_ID } from "./config";
import { avatarReady, getProfile } from "./profile";
import { generateStoryboard } from "./storyboard";
import type { Storyboard, VideoRow } from "./types";

const scripting = new Set<string>();
export const isScripting = (id: string) => scripting.has(id);

export async function getOwnedVideo(id: string, userId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  return one<VideoRow>("SELECT * FROM studio_videos WHERE id=$1 AND user_id=$2", [id, userId]);
}

/** Écrit (ou réécrit) le storyboard en tâche de fond. */
export async function scriptVideo(videoId: string, user: Pick<User, "id" | "company_context">) {
  if (scripting.has(videoId)) return;
  scripting.add(videoId);
  try {
    await q("UPDATE studio_videos SET status='scripting', error=NULL, progress=$2, updated_at=now() WHERE id=$1", [
      videoId,
      JSON.stringify({ phase: "script", label: "Écriture du scénario", startedAt: Date.now() }),
    ]);
    const video = await one<VideoRow>("SELECT * FROM studio_videos WHERE id=$1", [videoId]);
    if (!video) return;
    const profile = await getProfile(user.id);
    const sb = await generateStoryboard(video, { avatarOk: avatarReady(profile), companyContext: user.company_context });
    await q("UPDATE studio_videos SET storyboard=$2, title=$3, status='ready', estimate_usd=$4, progress='{}', updated_at=now() WHERE id=$1", [
      videoId,
      JSON.stringify(sb),
      sb.title,
      estimateFor(video, sb, profile?.voice_provider ?? "chatterbox").total,
    ]);
  } catch (e) {
    console.error("[studio] scénario", videoId, e);
    await q("UPDATE studio_videos SET status='failed', error=$2, updated_at=now() WHERE id=$1", [videoId, friendlyApiError(e)]).catch(() => {});
  } finally {
    scripting.delete(videoId);
  }
}

export function estimateFor(video: Pick<VideoRow, "format" | "brief">, sb: Storyboard, voiceProvider: "chatterbox" | "elevenlabs") {
  return estimateCost({ format: FORMAT_BY_ID[video.format], scenes: sb.scenes, voiceProvider, music: !!video.brief.music });
}
