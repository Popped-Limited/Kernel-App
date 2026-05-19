-- Documents table for compliance PDFs
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS documents (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type  text NOT NULL,   -- 'supplier' | 'ingredient' | 'supply' | 'packaging'
  entity_id    uuid NOT NULL,
  doc_type     text NOT NULL,   -- 'spec_sheet' | 'coshh' | 'accreditation' | 'other'
  file_name    text NOT NULL,
  file_path    text NOT NULL,
  uploaded_at  timestamptz DEFAULT now()
);

-- Open RLS so the anon key can read/write (same pattern as rest of app)
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "documents_select" ON documents FOR SELECT USING (true);
CREATE POLICY "documents_insert" ON documents FOR INSERT WITH CHECK (true);
CREATE POLICY "documents_delete" ON documents FOR DELETE USING (true);

-- After running this SQL, go to Supabase Storage and create a bucket
-- called: compliance-docs
-- Set it to PUBLIC so PDFs can be opened directly in the browser.
