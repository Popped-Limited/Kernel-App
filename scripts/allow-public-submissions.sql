-- Allow the anon role to insert submissions and answers
-- This is needed for both public (visitor) forms and authenticated checklist submissions
-- going through the /api/submit route.
-- The foreign key constraints on checklist_id and question_id already ensure
-- only valid data can be inserted.

-- Submissions: allow insert from anon and authenticated roles
DROP POLICY IF EXISTS "anon_insert_submissions" ON submissions;
CREATE POLICY "anon_insert_submissions" ON submissions
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Answers: allow insert from anon and authenticated roles
DROP POLICY IF EXISTS "anon_insert_answers" ON answers;
CREATE POLICY "anon_insert_answers" ON answers
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);
