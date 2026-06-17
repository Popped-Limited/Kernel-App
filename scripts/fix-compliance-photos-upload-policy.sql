-- Fix: allow uploading checklist photos to the compliance-photos bucket.
--
-- The bucket is public for READS, but had no INSERT policy, so authenticated
-- (and guest/anon) users could not upload photo answers. The app then silently
-- fell back to sending the raw base64 image in the submit request, which exceeds
-- the serverless request-body limit on production and broke the whole submission
-- ("Something went wrong"). Any checklist with a photo field was affected.
--
-- Run once in the Supabase SQL editor.

DROP POLICY IF EXISTS "compliance_photos_upload" ON storage.objects;
CREATE POLICY "compliance_photos_upload"
  ON storage.objects FOR INSERT
  TO authenticated, anon
  WITH CHECK (bucket_id = 'compliance-photos');
