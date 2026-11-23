import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { storage } from './firebase';
import { BLUEPRINT_LIMITS, compressImageToDataUrl } from './validation';

export interface PendingVideoDraft {
  id: string;
  title: string;
  sourceType: 'url' | 'clip';
  url: string;
  clipId: string;
  durationSec: number;
  mimeType?: 'video/webm' | 'video/mp4';
  dataUrl?: string;
  isExistingClip?: boolean;
}

export type ParsedVideoEmbed =
  | { kind: 'iframe'; embedUrl: string; providerLabel: string }
  | { kind: 'video'; src: string; providerLabel: string }
  | { kind: 'external'; externalUrl: string; providerLabel: string };

export function isValidHttpUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl.trim());
    return (parsed.protocol === 'https:' || parsed.protocol === 'http:') && rawUrl.trim().length <= BLUEPRINT_LIMITS.VIDEO_URL_MAX;
  } catch {
    return false;
  }
}

export function parseVideoEmbed(rawUrl: string): ParsedVideoEmbed {
  const trimmed = rawUrl.trim();
  try {
    const u = new URL(trimmed);
    const host = u.hostname.replace(/^www\./, '').toLowerCase();

    // YouTube / YouTube Shorts
    if (host === 'youtube.com' || host === 'm.youtube.com') {
      if (u.pathname.startsWith('/shorts/')) {
        const id = u.pathname.split('/')[2];
        if (id) {
          return {
            kind: 'iframe',
            embedUrl: `https://www.youtube.com/embed/${id}`,
            providerLabel: 'YouTube Shorts',
          };
        }
      }
      if (u.pathname.startsWith('/embed/')) {
        return { kind: 'iframe', embedUrl: trimmed, providerLabel: 'YouTube' };
      }
      const v = u.searchParams.get('v');
      if (v) {
        return {
          kind: 'iframe',
          embedUrl: `https://www.youtube.com/embed/${v}`,
          providerLabel: 'YouTube',
        };
      }
    }
    if (host === 'youtu.be') {
      const id = u.pathname.slice(1).split('/')[0];
      if (id) {
        return {
          kind: 'iframe',
          embedUrl: `https://www.youtube.com/embed/${id}`,
          providerLabel: 'YouTube',
        };
      }
    }

    // Vimeo
    if (host === 'vimeo.com') {
      const id = u.pathname.split('/').filter(Boolean)[0];
      if (id && /^\d+$/.test(id)) {
        return {
          kind: 'iframe',
          embedUrl: `https://player.vimeo.com/video/${id}`,
          providerLabel: 'Vimeo',
        };
      }
    }

    // Google Drive
    if (host === 'drive.google.com') {
      const match = u.pathname.match(/\/file\/d\/([^/]+)/);
      if (match?.[1]) {
        return {
          kind: 'iframe',
          embedUrl: `https://drive.google.com/file/d/${match[1]}/preview`,
          providerLabel: 'Google Drive',
        };
      }
    }

    // Direct video file URL
    if (/\.(mp4|webm|mov|m4v)(\?.*)?$/i.test(u.pathname)) {
      return { kind: 'video', src: trimmed, providerLabel: 'Vidéo directe' };
    }

    return { kind: 'external', externalUrl: trimmed, providerLabel: host };
  } catch {
    return { kind: 'external', externalUrl: trimmed, providerLabel: 'Lien vidéo' };
  }
}

export function formatDurationLabel(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s === 0) return 'Lien vidéo';
  const mins = Math.floor(s / 60);
  const rem = s % 60;
  return mins > 0 ? `${mins} min ${rem.toString().padStart(2, '0')} s` : `${rem} s`;
}

function readBlobAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Impossible de lire le fichier vidéo.'));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(blob);
  });
}

function loadVideoMetadata(objectUrl: string): Promise<{ video: HTMLVideoElement; durationSec: number }> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    video.onloadedmetadata = () => {
      const durationSec = Number.isFinite(video.duration) && video.duration > 0 ? Math.round(video.duration) : 0;
      resolve({ video, durationSec });
    };
    video.onerror = () => reject(new Error('Format vidéo non pris en charge par ce navigateur.'));
    video.src = objectUrl;
  });
}

function pickSupportedRecorderMime(): { mimeType: string; normalized: 'video/webm' | 'video/mp4' } | null {
  if (typeof MediaRecorder === 'undefined') return null;
  const candidates: Array<{ mimeType: string; normalized: 'video/webm' | 'video/mp4' }> = [
    { mimeType: 'video/webm;codecs=vp8,opus', normalized: 'video/webm' },
    { mimeType: 'video/webm;codecs=vp8', normalized: 'video/webm' },
    { mimeType: 'video/webm', normalized: 'video/webm' },
    { mimeType: 'video/mp4', normalized: 'video/mp4' },
  ];
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c.mimeType)) return c;
  }
  return null;
}

/**
 * Processes an uploaded video file into a lightweight mobile-ready clip (< 740 KB base64).
 * Small MP4/WebM files (<= 510 KB) are embedded directly without re-encoding.
 * Larger smartphone videos are automatically transcoded to 360p (max 14s) for 3G/4G speed.
 */
export async function processVideoFileToClip(
  file: File,
  onProgress?: (pct: number) => void,
  signal?: AbortSignal,
): Promise<{ dataUrl: string; mimeType: 'video/webm' | 'video/mp4'; durationSec: number }> {
  if (!file.type.startsWith('video/')) {
    throw new Error('Veuillez sélectionner un fichier vidéo valide (MP4, WebM ou MOV).');
  }
  if (file.size > 50 * 1024 * 1024) {
    throw new Error('La vidéo dépasse 50 Mo. Veuillez choisir un extrait plus court ou utiliser un lien YouTube / Drive.');
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    onProgress?.(10);
    const { video, durationSec } = await loadVideoMetadata(objectUrl);

    // Direct fast path for already compact MP4/WebM videos
    if (file.size <= 510000 && (file.type === 'video/mp4' || file.type === 'video/webm')) {
      const directDataUrl = await readBlobAsDataUrl(file);
      if (directDataUrl.length <= BLUEPRINT_LIMITS.VIDEO_CLIP_DATA_MAX_LENGTH) {
        onProgress?.(100);
        return {
          dataUrl: directDataUrl,
          mimeType: file.type === 'video/mp4' ? 'video/mp4' : 'video/webm',
          durationSec: Math.min(BLUEPRINT_LIMITS.VIDEO_CLIP_MAX_SECONDS, durationSec || 10),
        };
      }
    }

    const mimeChoice = pickSupportedRecorderMime();
    if (!mimeChoice) {
      throw new Error(
        'Votre navigateur ne prend pas en charge la compression vidéo directe. Importez une vidéo de moins de 500 Ko ou ajoutez un lien YouTube / TikTok / Drive.',
      );
    }

    const maxClipSeconds = 12;
    const targetDuration = durationSec > 0 ? Math.min(durationSec, maxClipSeconds) : maxClipSeconds;
    const srcW = video.videoWidth || 640;
    const srcH = video.videoHeight || 360;
    const maxDim = 426;
    let targetW = srcW;
    let targetH = srcH;
    if (targetW > maxDim || targetH > maxDim) {
      if (targetW >= targetH) {
        targetH = Math.round((targetH * maxDim) / targetW);
        targetW = maxDim;
      } else {
        targetW = Math.round((targetW * maxDim) / targetH);
        targetH = maxDim;
      }
    }
    // Even dimensions for video encoders
    targetW = Math.max(2, targetW - (targetW % 2));
    targetH = Math.max(2, targetH - (targetH % 2));

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Contexte de rendu vidéo indisponible.');
    }

    const canvasStream = canvas.captureStream(20);
    const streamWithCapture = video as HTMLVideoElement & {
      captureStream?: () => MediaStream;
      mozCaptureStream?: () => MediaStream;
    };
    const sourceAudioStream =
      typeof streamWithCapture.captureStream === 'function'
        ? streamWithCapture.captureStream()
        : typeof streamWithCapture.mozCaptureStream === 'function'
          ? streamWithCapture.mozCaptureStream()
          : null;

    if (sourceAudioStream) {
      sourceAudioStream.getAudioTracks().forEach((track) => canvasStream.addTrack(track));
    }

    const recorder = new MediaRecorder(canvasStream, {
      mimeType: mimeChoice.mimeType,
      videoBitsPerSecond: 260000,
      audioBitsPerSecond: 48000,
    });

    const chunks: BlobPart[] = [];
    recorder.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) {
        chunks.push(ev.data);
      }
    };

    const recordedBlob = await new Promise<Blob>((resolve, reject) => {
      let rafId = 0;
      let timerId = 0;
      let stopped = false;

      const cleanup = () => {
        if (rafId) cancelAnimationFrame(rafId);
        if (timerId) window.clearTimeout(timerId);
        video.pause();
        canvasStream.getTracks().forEach((t) => t.stop());
      };

      const stopRecording = () => {
        if (stopped) return;
        stopped = true;
        cleanup();
        if (recorder.state !== 'inactive') {
          recorder.stop();
        }
      };

      if (signal) {
        signal.addEventListener('abort', () => {
          cleanup();
          if (recorder.state !== 'inactive') recorder.stop();
          reject(new Error('Traitement vidéo annulé.'));
        });
      }

      recorder.onerror = () => {
        cleanup();
        reject(new Error('Échec de la compression vidéo dans le navigateur.'));
      };

      recorder.onstop = () => {
        if (signal?.aborted) return;
        resolve(new Blob(chunks, { type: mimeChoice.normalized }));
      };

      const drawFrame = () => {
        if (stopped || signal?.aborted) return;
        ctx.drawImage(video, 0, 0, targetW, targetH);
        const pct = Math.min(95, 15 + Math.round((video.currentTime / targetDuration) * 80));
        onProgress?.(pct);
        if (video.currentTime >= targetDuration || video.ended) {
          stopRecording();
          return;
        }
        rafId = requestAnimationFrame(drawFrame);
      };

      video.onended = stopRecording;
      video.currentTime = 0;

      recorder.start(250);
      video
        .play()
        .then(() => {
          rafId = requestAnimationFrame(drawFrame);
          timerId = window.setTimeout(stopRecording, (targetDuration + 0.8) * 1000);
        })
        .catch(() => {
          cleanup();
          reject(new Error('Impossible de lire la vidéo pour la compresser. Essayez un lien YouTube ou Drive.'));
        });
    });

    const dataUrl = await readBlobAsDataUrl(recordedBlob);
    if (dataUrl.length > BLUEPRINT_LIMITS.VIDEO_CLIP_DATA_MAX_LENGTH) {
      throw new Error(
        'Même compressée, la vidéo reste trop lourde. Choisissez une vidéo plus courte (max 10s) ou utilisez un lien YouTube / TikTok / Drive.',
      );
    }

    onProgress?.(100);
    return {
      dataUrl,
      mimeType: mimeChoice.normalized,
      durationSec: Math.max(1, Math.round(targetDuration)),
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64] = dataUrl.split(',');
  const mimeMatch = header?.match(/data:([^;]+);base64/);
  const mime = mimeMatch?.[1] || 'image/jpeg';
  const binary = atob(base64 || '');
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime });
}

/**
 * Compresses an image file and uploads it to Firebase Storage under listings/{userId}/.
 * Falls back gracefully to the compressed JPEG Data URL if Storage is not yet activated.
 */
export async function uploadListingPhoto(file: File, userId: string): Promise<string> {
  const compressedDataUrl = await compressImageToDataUrl(file);
  if (!userId) return compressedDataUrl;

  try {
    const blob = dataUrlToBlob(compressedDataUrl);
    const randomSuffix = Math.random().toString(36).slice(2, 8);
    const storagePath = `listings/${userId}/${Date.now()}_${randomSuffix}.jpg`;
    const storageRef = ref(storage, storagePath);
    await uploadBytes(storageRef, blob, { contentType: 'image/jpeg' });
    return await getDownloadURL(storageRef);
  } catch {
    return compressedDataUrl;
  }
}

