"use client";

import { useEffect, useRef, useState } from "react";

// Photo input for GMP findings, built for a phone on the factory floor:
// "Take photo" opens the camera directly (capture="environment"), "Add from
// library" picks existing photos. Selected photos show as removable thumbnails.

export default function PhotoPicker({
  photos,
  onChange,
}: {
  photos: File[];
  onChange: (photos: File[]) => void;
}) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const [previews, setPreviews] = useState<string[]>([]);

  useEffect(() => {
    const urls = photos.map(f => URL.createObjectURL(f));
    setPreviews(urls);
    return () => urls.forEach(u => URL.revokeObjectURL(u));
  }, [photos]);

  function add(files: FileList | null, input: HTMLInputElement | null) {
    if (files?.length) onChange([...photos, ...Array.from(files)]);
    if (input) input.value = ""; // allow re-taking / re-picking the same file
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => cameraRef.current?.click()}
          className="btn-secondary flex-1 text-sm py-2.5"
        >
          📷 Take photo
        </button>
        <button
          type="button"
          onClick={() => libraryRef.current?.click()}
          className="btn-secondary flex-1 text-sm py-2.5"
        >
          Add from library
        </button>
      </div>
      {/* capture forces the camera; the library input deliberately omits it */}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={e => add(e.target.files, e.target)}
      />
      <input
        ref={libraryRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={e => add(e.target.files, e.target)}
      />

      {photos.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {previews.map((url, i) => (
            <div key={i} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt={`Photo ${i + 1}`} className="h-20 w-20 object-cover rounded-lg border border-gray-200" />
              <button
                type="button"
                onClick={() => onChange(photos.filter((_, j) => j !== i))}
                className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-gray-800 text-white text-xs leading-none flex items-center justify-center shadow"
                aria-label={`Remove photo ${i + 1}`}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
