import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Trash2, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ACCEPTED_VIDEO_TYPES,
  resolveVideoType,
  MAX_VIDEO_BYTES,
  MAX_VIDEO_SECONDS,
  deleteVideo,
  saveVideo,
  videoDuration,
  videoUrl,
} from "@/lib/video-store";
import { uid } from "@/lib/store";

function useVideoUrl(traineeId: string | null | undefined, videoId: string | null | undefined) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!videoId || !traineeId) {
      setUrl(null);
      return;
    }
    videoUrl(traineeId, videoId).then((signedUrl) => {
      if (!cancelled) setUrl(signedUrl);
    });
    return () => {
      cancelled = true;
    };
  }, [traineeId, videoId]);
  return url;
}

export function SetVideoPlayer({
  traineeId,
  videoId,
}: {
  traineeId: string | null | undefined;
  videoId: string | null | undefined;
}) {
  const url = useVideoUrl(traineeId, videoId);
  if (!videoId) return null;
  return (
    <div className="mt-2 space-y-1">
      <p className="text-xs text-muted-foreground">📹 סרטון מהמתאמן</p>
      {url ? (
        <video src={url} controls className="w-full max-w-sm rounded-xl border border-border" />
      ) : (
        <p className="text-xs text-muted-foreground">טוען סרטון…</p>
      )}
    </div>
  );
}

export function SetVideoField({
  traineeId,
  videoId,
  disabled,
  onChange,
}: {
  traineeId: string;
  videoId: string | null | undefined;
  disabled?: boolean;
  onChange: (videoId: string | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const url = useVideoUrl(traineeId, videoId);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    if (!resolveVideoType(file)) {
      toast.error("פורמט לא נתמך — MP4 / WebM / MOV בלבד");
      return;
    }
    if (file.size > MAX_VIDEO_BYTES) {
      toast.error(`הקובץ גדול מ-100MB (${Math.round(file.size / 1024 / 1024)}MB)`);
      return;
    }
    setBusy(true);
    try {
      const duration = await videoDuration(file);
      if (duration > MAX_VIDEO_SECONDS) {
        toast.error("הסרטון ארוך מ-5 דקות");
        return;
      }
      const prevVideoId = videoId;
      const newVideoId = await saveVideo(traineeId, uid(), file);
      onChange(newVideoId);
      if (prevVideoId) await deleteVideo(traineeId, prevVideoId);
      toast.success("הסרטון הועלה");
    } catch (err) {
      // Show the real reason (storage/policy message) instead of a generic failure.
      console.error("video upload failed", err);
      const reason = err instanceof Error ? err.message : "";
      toast.error(`העלאת הסרטון נכשלה${reason ? `: ${reason}` : ""}`);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (videoId) await deleteVideo(traineeId, videoId);
    onChange(null);
  };

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_VIDEO_TYPES}
        className="hidden"
        onChange={(e) => {
          void handleFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {videoId ? (
        <div className="rounded-xl border border-border p-2">
          {url ? (
            <video src={url} controls className="w-full rounded-lg" />
          ) : (
            <p className="text-xs text-muted-foreground">טוען סרטון…</p>
          )}
          {!disabled && (
            <Button size="sm" variant="ghost" className="mt-1" onClick={() => void remove()}>
              <Trash2 className="size-4 text-destructive" /> מחק סרטון
            </Button>
          )}
        </div>
      ) : (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (!disabled) void handleFile(e.dataTransfer.files?.[0]);
          }}
          className="rounded-xl border border-dashed border-border p-3 text-center"
        >
          <Button
            size="sm"
            variant="outline"
            disabled={disabled || busy}
            onClick={() => inputRef.current?.click()}
          >
            <Video className="size-4" /> {busy ? "מעלה…" : "+ העלה סרטון"}
          </Button>
          <p className="mt-1 text-xs text-muted-foreground">אופציונלי · גם בגרירת קובץ · עד 100MB / 5 דק'</p>
        </div>
      )}
    </div>
  );
}
