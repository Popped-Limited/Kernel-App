"use client";

import { useRef, useState, useEffect, useCallback } from "react";

/**
 * Capture a photo from the device camera (works on desktop webcams AND mobile,
 * via getUserMedia) or fall back to uploading an existing image file.
 *
 * Emits the photo as a base64 `data:` URL via `onChange`. The caller is
 * responsible for uploading that to storage on submit (see lib/photoUpload).
 * An existing `http(s)` value (already-uploaded photo) is shown as a preview.
 *
 * getUserMedia requires a secure context (HTTPS or localhost) — production is
 * HTTPS so the camera works there; if the camera is blocked or unavailable we
 * surface a message and the Upload button still works.
 */
export default function PhotoCapture({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (v: string) => void;
  error?: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [ready, setReady] = useState(false); // video has a real frame to capture
  const [camErr, setCamErr] = useState<string | null>(null);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraOn(false);
    setReady(false);
  }, []);

  // Always release the camera when the component unmounts.
  useEffect(() => stopCamera, [stopCamera]);

  // Attach the stream once the <video> is actually mounted. Doing this in an
  // effect (rather than a one-shot requestAnimationFrame right after setState)
  // guarantees the element exists, so the first "Take photo" reliably shows the
  // live feed instead of a black frame that only fixed itself on a second try.
  useEffect(() => {
    if (!cameraOn) return;
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!video || !stream) return;
    video.srcObject = stream;
    video.play().catch(() => {});
  }, [cameraOn]);

  async function startCamera() {
    setCamErr(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setCamErr("Camera isn't available here — use Upload instead.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" }, // rear camera on phones; default on laptops
        audio: false,
      });
      streamRef.current = stream;
      setReady(false);
      setCameraOn(true); // the effect above wires the stream into the <video>
    } catch {
      setCamErr("Couldn't access the camera. Check browser permissions, or use Upload.");
    }
  }

  function capture() {
    const video = videoRef.current;
    // Guard against capturing before the first frame has decoded (black image).
    if (!video || !video.videoWidth || video.readyState < 2) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    onChange(canvas.toDataURL("image/jpeg", 0.85));
    stopCamera();
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => onChange(reader.result as string);
    reader.readAsDataURL(file);
  }

  // Live camera view
  if (cameraOn) {
    return (
      <div className="overflow-hidden rounded-xl border-2 border-brand/40 bg-black">
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          onLoadedMetadata={() => videoRef.current?.play().catch(() => {})}
          onCanPlay={() => setReady(true)}
          onPlaying={() => setReady(true)}
          className="max-h-72 w-full bg-black object-contain"
        />
        <div className="flex items-center justify-between gap-2 bg-gray-900 px-3 py-2">
          <button type="button" onClick={stopCamera} className="text-xs font-medium text-gray-300 hover:text-white">
            Cancel
          </button>
          <button
            type="button"
            onClick={capture}
            disabled={!ready}
            className="rounded-full bg-brand px-5 py-1.5 text-sm font-semibold text-brown disabled:cursor-not-allowed disabled:opacity-50"
          >
            {ready ? "Capture" : "Starting camera…"}
          </button>
        </div>
      </div>
    );
  }

  const hasImage = !!value && (value.startsWith("data:") || value.startsWith("http"));

  return (
    <div>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
      <div
        className={`flex w-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-5 text-sm transition ${
          hasImage ? "border-green-400 bg-green-50" : error ? "border-red-300 bg-red-50" : "border-gray-300 bg-white"
        }`}
      >
        {hasImage ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={value} alt="Captured" className="h-32 w-full rounded-lg object-cover" />
            <span className="text-xs font-medium text-green-700">Photo added ✓</span>
          </>
        ) : (
          <CameraIcon />
        )}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={startCamera}
            className="rounded-lg bg-brand px-4 py-1.5 text-sm font-semibold text-brown transition hover:bg-brand-dark"
          >
            {hasImage ? "Retake" : "Take photo"}
          </button>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="rounded-lg border border-gray-300 bg-white px-4 py-1.5 text-sm font-medium text-gray-600 transition hover:border-brand"
          >
            Upload
          </button>
        </div>
        {camErr && <p className="text-center text-xs text-red-600">{camErr}</p>}
      </div>
    </div>
  );
}

function CameraIcon() {
  return (
    <svg className="h-8 w-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}
