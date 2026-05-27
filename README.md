# FlowState

FlowState is a lightweight academic tracker with a deterministic priority engine, a keyboard-first quick-drop command bar, and placeholders for Supabase plus Google Calendar sync.

## Local Development

```bash
npm install
npm run dev
```

Then open `http://localhost:3000`.

## Environment

Create `.env.local` when enabling live integrations:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
```

`NEXT_PUBLIC_SUPABASE_ANON_KEY` is still accepted locally for older projects, but new Supabase projects should use `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.

## Data

The initial Supabase schema lives in `supabase/schema.sql`. It models `courses` and `tasks`, enables row level security, and intentionally does not persist `priority_score`; scores are calculated from current task state at read time.

## Current Integration Boundaries

- `/api/parse-task` calls OpenAI structured outputs when `OPENAI_API_KEY` is present.
- `/api/calendar/deadlines` is the Google Calendar sync boundary. It returns a configuration notice until OAuth token storage and secondary calendar selection are wired.
- The dashboard currently uses seeded local data so the product can be evaluated immediately.
