<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Database migrations

All SQL lives in `supabase/migrations/` — never loose in `supabase/`. Files are
named `NNN_name.sql` with a simple zero-padded sequence (`001_schema.sql` …
`023_user_access.sql`), NOT the 14-digit timestamps `supabase migration new`
generates. The Supabase CLI treats the leading digits as the migration version,
so the number must be unique and must sort in apply order; mixing the two naming
styles breaks ordering, because `021_…` sorts before `2026…`.

To add a migration: create the next number in `supabase/migrations/` by hand and
apply it, then record it with
`npx supabase migration repair --status applied <NNN>`.

Docker is not installed on this machine, so `supabase db dump`, `db diff` and
`db reset` all fail. To check what is actually live, query the Management API:
`POST https://api.supabase.com/v1/projects/$ref/database/query` with
`Authorization: Bearer $SUPABASE_ACCESS_TOKEN` and `{"query":"…"}`. When
introspecting, do not filter to the `public` schema — storage policies live in
`storage` and some triggers in `auth`.

`001_schema.sql` has diverged from production: it declares `academic_years`,
while the live DB uses `sessions` with `session_id` on `terms`/`exams`. Treat it
as a historical baseline, not ground truth.
