-- Fix: allow uploading SOP images to the sop-images bucket.
--
-- Same issue as compliance-photos: the bucket is public for READS but had no
-- INSERT policy, so authenticated users couldn't upload images into a Standard
-- Operating Procedure (the upload failed with an RLS violation).
--
-- Run once in the Supabase SQL editor.

DROP POLICY IF EXISTS "sop_images_upload" ON storage.objects;
CREATE POLICY "sop_images_upload"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'sop-images');
