import { useState } from "react";
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from "firebase/storage";

/* ─────────────────────────────────────────────────────────────
 * Optional videos + additional photos for the vehicle inspection.
 *
 * These sit BESIDE the required front/side/back photos and the
 * per-part photos — never instead of them (the pickup/return gate
 * is unchanged).
 *
 * Unlike the staged "Save All" photo slots, files here upload the
 * moment they are picked: videos are big, and holding a 200 MB
 * file in memory until a later Save is a good way to lose it. Each
 * upload goes straight to Firebase Storage (resumable, with a
 * progress bar) and only the resulting URL is sent to the backend,
 * which validates it and stores it on the before/after record.
 * ───────────────────────────────────────────────────────────── */

export const MAX_VIDEOS = 3;
export const MAX_VIDEO_MB = 250;
export const MAX_VIDEO_SECONDS = 180;
export const MAX_EXTRA_PHOTOS = 20;
const MAX_PHOTO_EDGE = 1600; // px — extra photos are shrunk in the browser before upload

// Phones/tablets only: on a desktop `capture` does nothing, so the extra "Record"/"Camera" button would just duplicate the picker.
const hasCameraButton = () => typeof window !== "undefined" && !!window.matchMedia?.("(pointer: coarse)").matches;

const fmtDuration = (sec) => {
  if (!sec && sec !== 0) return "";
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
};
const fmtSize = (bytes) => (bytes ? `${(bytes / 1048576).toFixed(bytes > 10485760 ? 0 : 1)} MB` : "");
const randomId = () => Math.random().toString(36).slice(2, 8);

/* Reads a video's length in the browser. Resolves null when the browser can't
 * decode it (e.g. an iPhone HEVC .mov on desktop Chrome) — the upload still
 * goes ahead, only the duration check and badge are skipped. */
const readVideoDuration = (file) =>
  new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    const done = (val) => { URL.revokeObjectURL(url); resolve(val); };
    v.preload = "metadata";
    v.onloadedmetadata = () => done(Number.isFinite(v.duration) ? Math.round(v.duration) : null);
    v.onerror = () => done(null);
    setTimeout(() => done(null), 8000);
    v.src = url;
  });

/* Shrinks a photo to a JPEG with its longest side <= MAX_PHOTO_EDGE. */
const shrinkToJpeg = async (file) => {
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error(
      "This photo format (likely HEIC from an iPhone) can't be processed by this browser. " +
      "Set iPhone Camera → Formats → \"Most Compatible\", or pick a JPEG."
    );
  }
  const scale = Math.min(1, MAX_PHOTO_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("JPEG encode failed"))), "image/jpeg", 0.85)
  );
};

/* Uploads a Blob/File to Storage with progress, resolves with its download URL + the storage ref. */
const uploadWithProgress = (storage, path, blob, contentType, onProgress) =>
  new Promise((resolve, reject) => {
    const fileRef = ref(storage, path);
    const task = uploadBytesResumable(fileRef, blob, { contentType });
    task.on(
      "state_changed",
      (snap) => onProgress?.(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
      reject,
      async () => {
        try { resolve({ url: await getDownloadURL(fileRef), fileRef }); } catch (e) { reject(e); }
      }
    );
  });

/* POST the uploaded file's URL to the backend. If the backend refuses it, the file
 * is deleted again so a rejected upload never leaves an orphan in Storage. */
const registerMedia = async ({ apiUrl, segment, phase, bookingID, carID, url, mimeType, sizeBytes, durationSec, fileRef }) => {
  const token = localStorage.getItem("token");
  const res = await fetch(`${apiUrl}/api/vehicle-docs/${phase}/${segment}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ bookingID, carID, url, mimeType, sizeBytes, durationSec }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.success) {
    deleteObject(fileRef).catch(() => {});
    throw new Error(json.message || "Upload failed.");
  }
  return json.data; // { item, recordID, isNewRecord, count }
};

const removeMedia = async ({ apiUrl, segment, phase, bookingID, mediaID }) => {
  const token = localStorage.getItem("token");
  const res = await fetch(
    `${apiUrl}/api/vehicle-docs/${phase}/${segment}/${encodeURIComponent(mediaID)}?bookingID=${encodeURIComponent(bookingID)}`,
    { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }
  );
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.success) throw new Error(json.message || "Could not remove it.");
};

/* ── Video tile (thumbnail comes from the video's own first frame) ── */
function VideoTile({ item, onView, onRemove, removing }) {
  return (
    <div className="relative group rounded-2xl overflow-hidden border border-gray-100 bg-black aspect-video">
      <video
        src={`${item.url}#t=0.5`}
        preload="metadata"
        muted
        playsInline
        className="w-full h-full object-cover opacity-90"
      />
      <button
        type="button"
        onClick={() => onView({ url: item.url, label: "Inspection video", type: "video" })}
        className="absolute inset-0 flex items-center justify-center"
        aria-label="Play video"
      >
        <span className="w-11 h-11 rounded-full bg-white/90 text-gray-800 flex items-center justify-center text-lg shadow">▶</span>
      </button>
      <div className="absolute bottom-1.5 left-1.5 flex gap-1">
        {item.durationSec ? <span className="px-1.5 py-0.5 rounded bg-black/70 text-white text-[10px] font-semibold">{fmtDuration(item.durationSec)}</span> : null}
        {item.sizeBytes ? <span className="px-1.5 py-0.5 rounded bg-black/70 text-white text-[10px]">{fmtSize(item.sizeBytes)}</span> : null}
      </div>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          disabled={removing}
          className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-white/90 text-red-500 text-xs font-bold shadow hover:bg-white disabled:opacity-50"
          aria-label="Remove video"
        >
          {removing ? "…" : "✕"}
        </button>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
 * Videos — up to MAX_VIDEOS. Props:
 *   storage, apiUrl, phase ("before"|"after"), bookingID, carID
 *   items            current videos from the record
 *   onAdded(item, recordID)   /   onRemoved(mediaID)
 *   onView({url,label,type})  opens the lightbox
 *   notify(msg, type)         toast
 * ───────────────────────────────────────────────────────────── */
export function InspectionVideos({ storage, apiUrl, phase, bookingID, carID, items = [], onAdded, onRemoved, onView, notify = () => {}, disabled }) {
  const [progress, setProgress] = useState(null); // null | 0-100 while one video is uploading
  const [removingID, setRemovingID] = useState(null);
  const inputID = `inspection-video-${phase}`;
  const full = items.length >= MAX_VIDEOS;
  const busy = progress !== null;

  const handlePick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("video/")) return notify("Please choose a video file.", "error");
    if (file.size > MAX_VIDEO_MB * 1048576) return notify(`That video is ${fmtSize(file.size)} — the limit is ${MAX_VIDEO_MB} MB. Record at 1080p instead of 4K.`, "error");

    const durationSec = await readVideoDuration(file);
    if (durationSec && durationSec > MAX_VIDEO_SECONDS) {
      return notify(`That video is ${fmtDuration(durationSec)} long — the limit is ${MAX_VIDEO_SECONDS / 60} minutes. Split it into two videos.`, "error");
    }

    setProgress(0);
    try {
      const ext = (file.name.split(".").pop() || "mp4").toLowerCase().replace(/[^a-z0-9]/g, "") || "mp4";
      const path = `vehicleDocs/${carID}/${bookingID}/${phase}/videos/vid_${Date.now()}_${randomId()}.${ext}`;
      const { url, fileRef } = await uploadWithProgress(storage, path, file, file.type, setProgress);
      const data = await registerMedia({
        apiUrl, segment: "videos", phase, bookingID, carID, url,
        mimeType: file.type, sizeBytes: file.size, durationSec, fileRef,
      });
      onAdded(data.item, data.recordID);
      notify("Video uploaded.");
    } catch (err) {
      console.error("[InspectionMedia] video upload failed:", err);
      notify(err.message || "Video upload failed.", "error");
    } finally {
      setProgress(null);
    }
  };

  const handleRemove = async (item) => {
    if (!window.confirm("Remove this video? The file will be deleted.")) return;
    setRemovingID(item.id);
    try {
      await removeMedia({ apiUrl, segment: "videos", phase, bookingID, mediaID: item.id });
      onRemoved(item.id);
    } catch (err) {
      notify(err.message, "error");
    } finally {
      setRemovingID(null);
    }
  };

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {items.map((item) => (
          <VideoTile key={item.id} item={item} onView={onView}
            onRemove={disabled ? null : () => handleRemove(item)} removing={removingID === item.id} />
        ))}

        {busy && (
          <div className="rounded-2xl border border-teal-200 bg-teal-50 aspect-video flex flex-col items-center justify-center gap-2 px-4">
            <p className="text-xs font-semibold text-teal-700">Uploading video… {progress}%</p>
            <div className="w-full h-1.5 rounded-full bg-teal-100 overflow-hidden">
              <div className="h-full bg-teal-600 transition-all" style={{ width: `${progress}%` }} />
            </div>
            <p className="text-[10px] text-teal-600">Keep this page open</p>
          </div>
        )}

        {!full && !busy && !disabled && (
          <div className="rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50 aspect-video flex flex-col overflow-hidden text-gray-400">
            <label htmlFor={inputID} className="cursor-pointer hover:bg-gray-100 flex-1 flex flex-col items-center justify-center gap-1">
              <span className="text-2xl leading-none">{items.length ? "＋" : "🎥"}</span>
              <span className="text-xs font-semibold">{items.length ? "Add another video" : "Add video"}</span>
              <input id={inputID} type="file" accept="video/*" className="hidden" onChange={handlePick} />
            </label>
            {hasCameraButton() && (
              <label htmlFor={`${inputID}-cam`} className="cursor-pointer border-t border-gray-200 bg-white hover:bg-teal-50 text-teal-700 text-xs font-semibold py-2 text-center">
                📹 Record now
                <input id={`${inputID}-cam`} type="file" accept="video/*" capture="environment" className="hidden" onChange={handlePick} />
              </label>
            )}
          </div>
        )}
      </div>
      <p className="text-[11px] text-gray-400">
        Optional · up to {MAX_VIDEOS} videos ({items.length}/{MAX_VIDEOS}) · max {MAX_VIDEO_SECONDS / 60} min and {MAX_VIDEO_MB} MB each — record at 1080p. One walkaround can cover the exterior and the parts.
      </p>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
 * Additional photos — up to MAX_EXTRA_PHOTOS, any number selected at once.
 * Same props as InspectionVideos.
 * ───────────────────────────────────────────────────────────── */
export function InspectionExtraPhotos({ storage, apiUrl, phase, bookingID, carID, items = [], onAdded, onRemoved, onView, notify = () => {}, disabled }) {
  const [uploadingCount, setUploadingCount] = useState(0);
  const [removingID, setRemovingID] = useState(null);
  const inputID = `inspection-extra-${phase}`;
  const full = items.length >= MAX_EXTRA_PHOTOS;
  const busy = uploadingCount > 0;

  const handlePick = async (e) => {
    const picked = Array.from(e.target.files || []);
    e.target.value = "";
    if (!picked.length) return;

    const room = MAX_EXTRA_PHOTOS - items.length;
    const files = picked.slice(0, Math.max(room, 0));
    if (picked.length > files.length) notify(`Only ${files.length} of ${picked.length} photos added — the limit is ${MAX_EXTRA_PHOTOS}.`, "error");

    setUploadingCount(files.length);
    for (const file of files) {
      try {
        if (!file.type.startsWith("image/")) throw new Error(`${file.name} is not an image.`);
        const blob = await shrinkToJpeg(file);
        const path = `vehicleDocs/${carID}/${bookingID}/${phase}/extra/img_${Date.now()}_${randomId()}.jpg`;
        const { url, fileRef } = await uploadWithProgress(storage, path, blob, "image/jpeg");
        const data = await registerMedia({
          apiUrl, segment: "extra-photos", phase, bookingID, carID, url,
          mimeType: "image/jpeg", sizeBytes: blob.size, fileRef,
        });
        onAdded(data.item, data.recordID);
      } catch (err) {
        console.error("[InspectionMedia] extra photo failed:", err);
        notify(err.message || "Photo upload failed.", "error");
      } finally {
        setUploadingCount((n) => Math.max(n - 1, 0));
      }
    }
  };

  const handleRemove = async (item) => {
    if (!window.confirm("Remove this photo? The file will be deleted.")) return;
    setRemovingID(item.id);
    try {
      await removeMedia({ apiUrl, segment: "extra-photos", phase, bookingID, mediaID: item.id });
      onRemoved(item.id);
    } catch (err) {
      notify(err.message, "error");
    } finally {
      setRemovingID(null);
    }
  };

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-3">
        {items.map((item) => (
          <div key={item.id} className="relative rounded-xl overflow-hidden border border-gray-100 bg-gray-50 aspect-square">
            <button type="button" className="w-full h-full"
              onClick={() => onView({ url: item.url, label: "Additional photo", type: "image" })}>
              <img src={item.url} alt="Additional" loading="lazy" className="w-full h-full object-cover" />
            </button>
            {!disabled && (
              <button type="button" onClick={() => handleRemove(item)} disabled={removingID === item.id}
                className="absolute top-1 right-1 w-5 h-5 rounded-full bg-white/90 text-red-500 text-[10px] font-bold shadow hover:bg-white disabled:opacity-50"
                aria-label="Remove photo">
                {removingID === item.id ? "…" : "✕"}
              </button>
            )}
          </div>
        ))}

        {busy && (
          <div className="rounded-xl border border-teal-200 bg-teal-50 aspect-square flex items-center justify-center text-center px-2">
            <p className="text-[11px] font-semibold text-teal-700">Uploading {uploadingCount}…</p>
          </div>
        )}

        {!full && !busy && !disabled && (
          <div className="rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 aspect-square flex flex-col overflow-hidden text-gray-400">
            <label htmlFor={inputID} className="cursor-pointer hover:bg-gray-100 flex-1 flex flex-col items-center justify-center gap-1">
              <span className="text-2xl leading-none">＋</span>
              <span className="text-[11px] font-semibold">Add photos</span>
              <input id={inputID} type="file" accept="image/*" multiple className="hidden" onChange={handlePick} />
            </label>
            {hasCameraButton() && (
              <label htmlFor={`${inputID}-cam`} className="cursor-pointer border-t border-gray-200 bg-white hover:bg-teal-50 text-teal-700 text-[11px] font-semibold py-1.5 text-center">
                📷 Camera
                <input id={`${inputID}-cam`} type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePick} />
              </label>
            )}
          </div>
        )}
      </div>
      <p className="text-[11px] text-gray-400">
        Optional · anything else worth showing ({items.length}/{MAX_EXTRA_PHOTOS}) · photos are resized automatically.
      </p>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
 * Read-only gallery for Past Trips / archives: shows a record's videos and
 * additional photos (renders nothing when it has neither).
 * ───────────────────────────────────────────────────────────── */
export const hasInspectionMedia = (doc) =>
  !!(doc && ((Array.isArray(doc.videos) && doc.videos.length) || (Array.isArray(doc.extraPhotos) && doc.extraPhotos.length)));

export function InspectionMediaGallery({ doc, onView }) {
  if (!hasInspectionMedia(doc)) return null;
  const videos = Array.isArray(doc.videos) ? doc.videos : [];
  const photos = Array.isArray(doc.extraPhotos) ? doc.extraPhotos : [];
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-3 space-y-3">
      {videos.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Videos ({videos.length})</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {videos.map((v) => <VideoTile key={v.id} item={v} onView={onView} />)}
          </div>
        </div>
      )}
      {photos.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Additional photos ({photos.length})</p>
          <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
            {photos.map((p) => (
              <button key={p.id} type="button" className="rounded-lg overflow-hidden border border-gray-100 aspect-square"
                onClick={() => onView({ url: p.url, label: "Additional photo", type: "image" })}>
                <img src={p.url} alt="Additional" loading="lazy" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}