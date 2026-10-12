-- Fake starter data for the PREVIEW Database only: the editor runs it after
-- `npx prisma migrate reset`, or on demand with `npx prisma db seed`.
-- Live data never comes from here. Safe to run twice: it only fills an empty table.
INSERT INTO "notes" ("body", "author")
SELECT v.body, v.author
FROM (VALUES
  ('Welcome! This note lives in your Site Database.', 'The team'),
  ('Add a note from /portal/notes and it shows up here too.', NULL)
) AS v(body, author)
WHERE NOT EXISTS (SELECT 1 FROM "notes");
