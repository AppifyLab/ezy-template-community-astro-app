-- Fake starter data for the PREVIEW Database only: the editor runs it after
-- `npx prisma migrate reset`, or on demand with `npx prisma db seed`.
-- Live data never comes from here. Safe to run twice: each block only fills an
-- empty table.
INSERT INTO "notes" ("body", "author")
SELECT v.body, v.author
FROM (VALUES
  ('Welcome! This note lives in your Site Database.', 'The team'),
  ('Add a note from /portal/notes and it shows up here too.', NULL)
) AS v(body, author)
WHERE NOT EXISTS (SELECT 1 FROM "notes");

-- example.com addresses only: never real people's.
INSERT INTO "contact_messages" ("name", "email", "message")
SELECT v.name, v.email, v.message
FROM (VALUES
  ('Ada Example', 'ada@example.com', 'Hi! Do you run events for beginners?'),
  ('Sam Sample', 'sam@example.com', 'We would love to partner on a workshop.')
) AS v(name, email, message)
WHERE NOT EXISTS (SELECT 1 FROM "contact_messages");
