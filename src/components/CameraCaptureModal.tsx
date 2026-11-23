import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Camera,
  Check,
  RefreshCw,
  RotateCcw,
  Square,
  Video,
  X,
} from 'lucide-react';
import { processVideoFileToClip } from '../lib/mediaUtils';
import { BLUEPRINT_LIMITS } from '../lib/validation';

interface CameraCaptureModalProps {
  open: boolean;
  initialMode: 'photo' | 'video';
  canAddPhoto: boolean;
  canAddVideo: boolean;
  onClose: () => void;
  onCapturePhoto: (dataUrl: string) => void;
  onCaptureVideo: (clip: {
    dataUrl: string;
    mimeType: 'video/webm' | 'video/mp4';
    durationSec: number;
  }) => void;
}

const MAX_RECORD_SECONDS = 14;

function pickLiveRecorderMime(): { mimeType: string; normalized: 'video/webm' | 'video/mp4' } | null {
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

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Impossible de lire la capture enregistrée.'));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(blob);
  });
}

export function CameraCaptureModal({
  open,
  initialMode,
  canAddPhoto,
  canAddVideo,
  onClose,
  onCapturePhoto,
  onCaptureVideo,
}: CameraCaptureModalProps) {
  const [mode, setMode] = useState<'photo' | 'video'>(initialMode);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [processingVideo, setProcessingVideo] = useState(false);

  const [previewPhoto, setPreviewPhoto] = useState<string | null>(null);
  const [previewVideo, setPreviewVideo] = useState<{
    dataUrl: string;
    mimeType: 'video/webm' | 'video/mp4';
    durationSec: number;
  } | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<number | null>(null);
  const startedAtRef = useRef<number>(0);
  const cancelledStopRef = useRef(false);

  const stopStream = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      cancelledStopRef.current = true;
      try {
        recorderRef.current.stop();
      } catch {
        // Ignore stop errors on unmount
      }
    }
    recorderRef.current = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCameraReady(false);
    setIsRecording(false);
  }, []);

  const startStream = useCallback(async () => {
    stopStream();
    setCameraError(null);

    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices ||
      !navigator.mediaDevices.getUserMedia
    ) {
      setCameraError(
        'Votre navigateur ne permet pas la capture directe par caméra. Utilisez les boutons « Importer » ou « Caméra appareil ».',
      );
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 960 },
          height: { ideal: 720 },
        },
        audio: mode === 'video',
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
      setCameraReady(true);
    } catch {
      if (mode === 'video') {
        // Retry without microphone if audio permission was blocked
        try {
          const videoOnlyStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: facingMode }, width: { ideal: 960 }, height: { ideal: 720 } },
            audio: false,
          });
          streamRef.current = videoOnlyStream;
          if (videoRef.current) {
            videoRef.current.srcObject = videoOnlyStream;
            await videoRef.current.play().catch(() => undefined);
          }
          setCameraReady(true);
          return;
        } catch {
          // Fall through to error message
        }
      }
      setCameraError(
        'Accès à la caméra refusé ou aucun capteur détecté. Autorisez la caméra dans votre navigateur ou importez un fichier depuis votre galerie.',
      );
    }
  }, [facingMode, mode, stopStream]);

  useEffect(() => {
    if (!open) {
      stopStream();
      setPreviewPhoto(null);
      setPreviewVideo(null);
      setRecordSeconds(0);
      setCameraError(null);
      return;
    }
    setMode(initialMode);
  }, [open, initialMode, stopStream]);

  useEffect(() => {
    if (!open) return;
    if (previewPhoto || previewVideo) {
      stopStream();
      return;
    }
    void startStream();
    return () => {
      stopStream();
    };
  }, [open, mode, facingMode, previewPhoto, previewVideo, startStream, stopStream]);

  if (!open) return null;

  const handleTakePhoto = () => {
    const videoEl = videoRef.current;
    if (!videoEl || videoEl.videoWidth === 0 || videoEl.videoHeight === 0) return;

    const maxDim = 720;
    let w = videoEl.videoWidth;
    let h = videoEl.videoHeight;
    if (w > maxDim || h > maxDim) {
      if (w >= h) {
        h = Math.round((h * maxDim) / w);
        w = maxDim;
      } else {
        w = Math.round((w * maxDim) / h);
        h = maxDim;
      }
    }

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(videoEl, 0, 0, w, h);
    let dataUrl = canvas.toDataURL('image/jpeg', 0.76);
    if (dataUrl.length > BLUEPRINT_LIMITS.PHOTO_DATA_MAX_LENGTH) {
      dataUrl = canvas.toDataURL('image/jpeg', 0.54);
    }
    if (dataUrl.length > BLUEPRINT_LIMITS.PHOTO_DATA_MAX_LENGTH) {
      dataUrl = canvas.toDataURL('image/jpeg', 0.38);
    }
    setPreviewPhoto(dataUrl);
  };

  const handleStopRecording = () => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    }
    setIsRecording(false);
  };

  const handleStartRecording = () => {
    if (!streamRef.current) return;
    setCameraError(null);
    const mimeChoice = pickLiveRecorderMime();
    if (!mimeChoice) {
      setCameraError(
        'L’enregistrement vidéo en direct n’est pas pris en charge par ce navigateur. Utilisez « Filmer avec l’appareil ».',
      );
      return;
    }

    chunksRef.current = [];
    startedAtRef.current = Date.now();
    cancelledStopRef.current = false;
    setRecordSeconds(0);

    try {
      const recorder = new MediaRecorder(streamRef.current, {
        mimeType: mimeChoice.mimeType,
        videoBitsPerSecond: 260000,
        audioBitsPerSecond: 48000,
      });
      recorderRef.current = recorder;

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) {
          chunksRef.current.push(ev.data);
        }
      };

      recorder.onstop = async () => {
        if (cancelledStopRef.current) {
          cancelledStopRef.current = false;
          return;
        }
        const elapsed = Math.max(
          1,
          Math.min(MAX_RECORD_SECONDS, Math.round((Date.now() - startedAtRef.current) / 1000)),
        );
        const blob = new Blob(chunksRef.current, { type: mimeChoice.normalized });
        if (blob.size === 0) return;

        setProcessingVideo(true);
        try {
          const directUrl = await blobToDataUrl(blob);
          if (directUrl.length <= BLUEPRINT_LIMITS.VIDEO_CLIP_DATA_MAX_LENGTH) {
            setPreviewVideo({
              dataUrl: directUrl,
              mimeType: mimeChoice.normalized,
              durationSec: elapsed,
            });
          } else {
            const tempFile = new File(
              [blob],
              `visite-chambre.${mimeChoice.normalized === 'video/mp4' ? 'mp4' : 'webm'}`,
              { type: mimeChoice.normalized },
            );
            const compressed = await processVideoFileToClip(tempFile);
            setPreviewVideo(compressed);
          }
        } catch (err) {
          setCameraError(
            err instanceof Error ? err.message : 'Erreur lors du traitement de la vidéo filmée.',
          );
        } finally {
          setProcessingVideo(false);
        }
      };

      recorder.start(250);
      setIsRecording(true);
      timerRef.current = window.setInterval(() => {
        const secs = Math.round((Date.now() - startedAtRef.current) / 1000);
        setRecordSeconds(secs);
        if (secs >= MAX_RECORD_SECONDS) {
          handleStopRecording();
        }
      }, 400);
    } catch {
      setCameraError('Impossible de démarrer l’enregistrement vidéo sur cet appareil.');
    }
  };

  const handleConfirmCapture = () => {
    if (previewPhoto) {
      onCapturePhoto(previewPhoto);
      setPreviewPhoto(null);
      onClose();
      return;
    }
    if (previewVideo) {
      onCaptureVideo(previewVideo);
      setPreviewVideo(null);
      onClose();
    }
  };

  const hasPreview = Boolean(previewPhoto || previewVideo);

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-3.5 sm:p-6 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="camera-capture-title"
    >
      <div className="w-full max-w-2xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-indigo-400/20 rounded-2xl overflow-hidden shadow-2xl my-auto">
        {/* Header */}
        <div className="hero-diamond-pattern text-white px-5 py-4 flex items-center justify-between gap-3">
          <div>
            <h2
              id="camera-capture-title"
              className="text-base font-extrabold text-white"
            >
              Enregistrer la chambre en direct
            </h2>
            <p className="text-xs font-medium text-slate-200 mt-0.5">
              Filmez la pièce, la douche et la cour ou prenez une photo nette
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer la caméra"
            className="min-w-[44px] min-h-[44px] inline-flex items-center justify-center rounded-xl text-slate-200 hover:text-white hover:bg-white/10 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Switcher */}
        {!hasPreview && (
          <div className="px-5 pt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex items-center p-1 bg-slate-100 dark:bg-slate-800/90 rounded-xl">
              <button
                type="button"
                disabled={!canAddPhoto || isRecording}
                onClick={() => setMode('photo')}
                className={`min-h-[40px] inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-lg transition-colors cursor-pointer disabled:opacity-45 ${
                  mode === 'photo'
                    ? 'bg-white dark:bg-[#0B1437] text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                <Camera className="w-4 h-4" />
                <span>Photo</span>
              </button>
              <button
                type="button"
                disabled={!canAddVideo || isRecording}
                onClick={() => setMode('video')}
                className={`min-h-[40px] inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-lg transition-colors cursor-pointer disabled:opacity-45 ${
                  mode === 'video'
                    ? 'bg-white dark:bg-[#0B1437] text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                <Video className="w-4 h-4" />
                <span>Vidéo (max {MAX_RECORD_SECONDS}s)</span>
              </button>
            </div>

            <button
              type="button"
              disabled={isRecording}
              onClick={() =>
                setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'))
              }
              className="min-h-[40px] inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl cursor-pointer disabled:opacity-45"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Changer caméra</span>
            </button>
          </div>
        )}

        {/* Viewport */}
        <div className="p-5 space-y-4">
          {cameraError ? (
            <div className="aspect-[4/3] rounded-2xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 p-6 flex flex-col items-center justify-center text-center gap-3">
              <Camera className="w-9 h-9 text-red-500" />
              <p className="text-sm font-medium text-red-700 dark:text-red-300 max-w-md">
                {cameraError}
              </p>
              <button
                type="button"
                onClick={() => void startStream()}
                className="min-h-[44px] px-4 py-2 text-sm font-bold text-white bg-[#0B1437] hover:bg-slate-800 rounded-xl cursor-pointer"
              >
                Réessayer l’accès caméra
              </button>
            </div>
          ) : (
            <div className="relative aspect-[4/3] rounded-2xl overflow-hidden bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-center justify-center">
              {previewPhoto ? (
                <img
                  src={previewPhoto}
                  alt="Aperçu photo capturée"
                  className="w-full h-full object-contain"
                />
              ) : previewVideo ? (
                <video
                  src={previewVideo.dataUrl}
                  controls
                  autoPlay
                  playsInline
                  className="w-full h-full object-contain"
                />
              ) : (
                <video
                  ref={videoRef}
                  muted
                  playsInline
                  autoPlay
                  className="w-full h-full object-cover"
                />
              )}

              {isRecording && (
                <div className="absolute top-3 left-3 px-3 py-1 rounded-lg bg-red-600 text-white text-xs font-mono font-bold tabular-nums">
                  REC 00:{String(recordSeconds).padStart(2, '0')} / 00:{MAX_RECORD_SECONDS}
                </div>
              )}

              {processingVideo && (
                <div className="absolute inset-0 bg-slate-950/75 flex items-center justify-center text-sm font-semibold text-white">
                  Préparation de la vidéo enregistrée...
                </div>
              )}
            </div>
          )}

          {/* Controls */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            {hasPreview ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setPreviewPhoto(null);
                    setPreviewVideo(null);
                  }}
                  className="min-h-[44px] inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl cursor-pointer"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>Recommencer</span>
                </button>
                <button
                  type="button"
                  onClick={handleConfirmCapture}
                  className="min-h-[44px] inline-flex items-center gap-1.5 px-5 py-2.5 text-sm font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-xl cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>
                    {previewPhoto
                      ? 'Ajouter cette photo à l’annonce'
                      : 'Ajouter cette vidéo à l’annonce'}
                  </span>
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={onClose}
                  className="min-h-[44px] px-4 py-2 text-sm font-semibold text-slate-600 dark:text-slate-300 cursor-pointer"
                >
                  Fermer
                </button>

                {mode === 'photo' ? (
                  <button
                    type="button"
                    disabled={!cameraReady || Boolean(cameraError)}
                    onClick={handleTakePhoto}
                    className="min-h-[44px] inline-flex items-center gap-2 px-5 py-2.5 text-sm font-bold text-white bg-[#0B1437] hover:bg-slate-800 dark:bg-teal-500 dark:hover:bg-teal-400 dark:text-[#0B1437] disabled:opacity-50 rounded-xl cursor-pointer"
                  >
                    <Camera className="w-4 h-4" />
                    <span>Prendre la photo</span>
                  </button>
                ) : isRecording ? (
                  <button
                    type="button"
                    onClick={handleStopRecording}
                    className="min-h-[44px] inline-flex items-center gap-2 px-5 py-2.5 text-sm font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl cursor-pointer"
                  >
                    <Square className="w-4 h-4 fill-current" />
                    <span>Arrêter l’enregistrement ({recordSeconds}s)</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={!cameraReady || Boolean(cameraError) || processingVideo}
                    onClick={handleStartRecording}
                    className="min-h-[44px] inline-flex items-center gap-2 px-5 py-2.5 text-sm font-bold text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-50 rounded-xl cursor-pointer"
                  >
                    <Video className="w-4 h-4" />
                    <span>Démarrer la vidéo</span>
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
