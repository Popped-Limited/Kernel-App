import { supabase } from "@/lib/supabase";
import type { Question } from "@/lib/types";

/**
 * Uploads any base64 (`data:`) photo answers to Supabase Storage and returns a
 * copy of the answers map with those entries replaced by the public URL.
 *
 * Throws if an upload fails — callers must NOT fall back to sending the raw
 * base64 in the request: a multi-MB image exceeds the /api/submit body limit
 * and the whole submission fails with a cryptic error. Mirrors the upload step
 * the checklist flow does in app/checklist/[id]/page.tsx.
 *
 * `scope` is a short path segment (e.g. the checklist id) for organising files.
 */
export async function uploadPhotoAnswers(
  questions: Question[],
  answers: Record<string, string>,
  scope: string,
): Promise<Record<string, string>> {
  const out = { ...answers };
  for (const q of questions) {
    const val = out[q.id];
    if (q.type !== "photo" || !val?.startsWith("data:")) continue;
    const blob = await (await fetch(val)).blob();
    const ext = blob.type.split("/")[1] ?? "jpg";
    const path = `photos/${scope}/${Date.now()}-${q.id}.${ext}`;
    const { data, error } = await supabase.storage
      .from("compliance-photos")
      .upload(path, blob, { contentType: blob.type, upsert: false });
    if (error || !data) throw new Error("photo-upload-failed");
    out[q.id] = supabase.storage.from("compliance-photos").getPublicUrl(path).data.publicUrl;
  }
  return out;
}
