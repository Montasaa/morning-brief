# Replace the Glance dashboard with a Next.js + SQLite app

The v2 Morning Brief is a Glance config that renders one read-only `brief.json`. The redesign needs things Glance cannot do: sign-in for several Readers, per-Reader ranking, Reactions, Ask Claude, saved Items and search across past Editions. We decided to build our own Next.js app with a SQLite database on the existing VPS. Gathering stays a separate (Python and agent) step that writes Editions. We chose Next.js over SvelteKit for its ecosystem, and over a FastAPI back end with a static front end so there is only one thing to deploy.

## Consequences

- Glance, `dashboard/glance.yml` and the content-warning CSS hack go away once the new app is live.
- The app now holds state (Readers, Reactions, saves), so the VPS needs backups, which it didn't before.
