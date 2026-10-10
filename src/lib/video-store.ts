// Set videos are uploaded to Supabase Storage so both the trainee and their coach
// (on separate devices) can access them — local-only storage would never sync across devices.
import { supabase } from "@/integrations/supabase/client";

const BUCKET = "set-videos";
const SIGNED_URL_TTL_SECONDS = 60 * 60;

export const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
export const MAX_VIDEO_SECONDS = 5 * 60;
export const ACCEPTED_VIDEO_TYPES = "video/mp4,video/webm,video/quicktime";

const EXT_BY_TYPE: Record<string, string> = {
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
};

const TYPE_BY_EXT: Record<string, string> = {
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
};

/**
 * Browsers report an empty MIME type for some videos (commonly .mov picked from a phone or
 * Windows), so fall back to the file extension. Returns null when the format isn't supported.
 */
export function resolveVideoType(file: File): string | null {
  if (EXT_BY_TYPE[file.type]) return file.type;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return TYPE_BY_EXT[ext] ?? null;
}

/** Uploads the video to the trainee's storage folder and returns the videoId to store on the set. */
export async function saveVideo(traineeId: string, id: string, file: File): Promise<string> {
  const contentType = resolveVideoType(file);
  if (!contentType) throw new Error("unsupported video format");
  const ext = EXT_BY_TYPE[contentType];
  const videoId = `${id}.${ext}`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(`${traineeId}/${videoId}`, file, { contentType, upsert: false });
  if (error) throw error;
  return videoId;
}

/** Returns a temporary signed URL for playback, or null if the video is missing/inaccessible. */
export async function videoUrl(traineeId: string, videoId: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(`${traineeId}/${videoId}`, SIGNED_URL_TTL_SECONDS);
  if (error || !data) return null;
  return data.signedUrl;
}

export async function deleteVideo(traineeId: string, videoId: string): Promise<void> {
  await supabase.storage.from(BUCKET).remove([`${traineeId}/${videoId}`]);
}

export function videoDuration(file: Blob): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const el = document.createElement("video");
    el.preload = "metadata";
    el.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(el.duration || 0);
    };
    el.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(0);
    };
    el.src = url;
  });
}
