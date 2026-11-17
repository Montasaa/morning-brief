# The app gathers Adult Trending from Reddit itself, outside the Editions

Adult Trending had no Items: the live app is fed only by the old pipeline's `brief.json`, which never had an Adult Trending section, and Pipeline v3 is not running yet. The Owner chose to add Reddit gathering next to the existing import (issue #19). ADR 0001 kept gathering outside the app and ADR 0002 builds each Brief from the latest Edition alone; this is a narrow exception to both.

The app reads the subreddit RSS feeds in Adult Trending's Gathering Rules every 15 minutes (cron calls `POST /api/gather/adult-trending`), screens each post (a keyword blocklist, then Claude, failing closed) and stores the posts that pass as ordinary Items. No Edition carries them: the Brief shows them next to the latest Edition's Items for 24 hours after each post.

We considered posting each run as a new Edition (it would replace the whole Brief with a handful of Reddit posts, or have to copy the latest Edition into every run, and each Edition sets off top picking and pushes) and adding the posts to the latest Edition's Items (the next import of the same Edition clears them, and every import would have to carry them forward). Keeping them beside the Editions means neither the import nor the gathering can remove the other's Items, and an Edition stays exactly what its gathering run posted.

## Consequences

- A Brief is the latest Edition plus the app's gathered Items of the last 24 hours. Every Brief rule (Owner-only, Sensitive, hidden, Saved and Search) applies to them as to any Item.
- Gathering Adult Trending needs Claude: without it nothing is kept.
- When Pipeline v3 takes over, decide whether it gathers Adult Trending too; both would show.
