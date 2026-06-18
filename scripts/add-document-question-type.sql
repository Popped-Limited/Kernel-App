-- Adds document attachment support to checklist questions
-- Run this in the Supabase SQL Editor

ALTER TABLE questions
  ADD COLUMN IF NOT EXISTS document_path     text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS document_required boolean NOT NULL DEFAULT false;
