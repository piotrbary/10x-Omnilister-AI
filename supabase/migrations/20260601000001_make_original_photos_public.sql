-- Make original-photos bucket publicly accessible so browsers can load
-- photos via permanent public URLs without auth tokens.
-- The existing "original-photos owner" FOR ALL policy remains in place;
-- its WITH CHECK clause continues to enforce owner-only writes.
UPDATE storage.buckets
SET public = true
WHERE name = 'original-photos';
