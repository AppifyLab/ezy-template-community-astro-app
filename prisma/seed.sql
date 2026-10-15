-- Fake starter data for the PREVIEW Database only: the editor runs it after
-- `npx prisma migrate reset`, or on demand with `npx prisma db seed`.
-- Live data never comes from here. Safe to run twice: each block only fills an
-- empty table.
INSERT INTO "jobs" ("slug", "title", "company", "location", "type", "remote", "description", "apply_url", "status", "created_by", "updated_at")
SELECT v.slug, v.title, v.company, v.location, v.type, v.remote, v.description, v.apply_url, 'open', 0, now()
FROM (VALUES
  ('community-manager', 'Community Manager', 'Example Co', 'London', 'full-time', true,
   E'Help our members get the most out of the community.\n\nYou will run events, welcome new members and keep conversations kind.',
   'mailto:jobs@example.com'),
  ('frontend-developer', 'Frontend Developer', 'Sample Labs', 'Berlin', 'contract', true,
   E'Build fast, accessible pages with Astro and React.\n\nThree-month contract, possible extension.',
   'https://example.com/careers/frontend'),
  ('content-writer', 'Content Writer', 'Demo Media', 'New York', 'part-time', false,
   E'Write guides and stories for our blog.\n\nTwo days a week, flexible hours.',
   'https://example.com/careers/writer')
) AS v(slug, title, company, location, type, remote, description, apply_url)
WHERE NOT EXISTS (SELECT 1 FROM "jobs");
