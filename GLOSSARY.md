# Morning Brief

A smarter daily news brief: a checked, curated selection of real stories, ranked for each Reader by what they care about. It is a reading product, not a life dashboard: no calendars, portfolios or tasks.

## People

**Reader**:
A person with their own Interest Profile and their own Brief. The owner is one Reader; family and friends can be others.
_Avoid_: User, account, subscriber

**Owner**:
The Reader who runs the site: invites other Readers, sets their Ask limits, and has no limits of their own.
_Avoid_: Admin, superuser

**Invite**:
The Owner's permission for a specific person to become a Reader.
_Avoid_: Signup, registration

## Content

**Edition**:
The shared set of checked Items produced by one gathering run, covering every Topic any Reader follows. There is one Edition per run, not one per Reader.
_Avoid_: Pool, issue, feed, brief.json

**Brief**:
One Reader's view of the latest Edition, plus the Adult Trending posts the app gathers from Reddit between Editions: only the Topics they follow, ranked for them.
_Avoid_: Feed, dashboard, page

**Item**:
One real story, repo, video, game or post in an Edition, with checked sources and a stable id.
_Avoid_: Article, card, entry, post

**Topic**:
A subject a Reader can follow, such as "Liverpool", "Yemen" or "Turn-based RPGs". A new Topic is private to the Reader who created it until they share it to the Catalog.
_Avoid_: Section, category, channel

**Catalog**:
The Topics any Reader can browse and follow. Today's nine sections, split into narrower Topics, are its starting entries.
_Avoid_: Directory, marketplace

**Gathering Rules**:
A Topic's instructions for gathering: which outlets to trust, what counts, and what to exclude. Claude drafts them when a Topic is created, and the Owner can edit them.
_Avoid_: Recipe, prompt, config

**Sensitive Topic**:
A Topic that each Reader must opt into before seeing it (graphic news, adult-themed news). Its Items are blurred until tapped unless the Reader has turned the blur off for that Topic. Its Items are never among a Reader's top stories, never open a Brief, and never appear in a notification. Adult Trending is visible only to the Owner.
_Avoid_: NSFW, content-warning section

**Story Thread**:
A developing story followed across Editions, such as a transfer saga or a conflict. Each development is its own Item linked to the Thread, so the Thread reads as a dated timeline.
_Avoid_: Saga, timeline, series

**Updated (Item)**:
The same event changed between Editions (for example, from morning to evening). A new development in a story is a new Item on its Story Thread, not an update.
_Avoid_: Edited, refreshed

## Personalisation

**Interest Profile**:
What a Reader has explicitly said they care about: the Topics they follow and their opt-ins. They can edit it at any time.
_Avoid_: Preferences, settings, persona

**Reaction**:
A signal a Reader gives about one Item (like, hide, save, or opening it), used to sharpen their future Briefs. A hide may carry a reason; only "not interested" lowers similar Items.
_Avoid_: Feedback, vote, interaction

**Widget**:
A small, non-story panel tied to a Topic: weather and prayer times, the next match, countdowns to fixtures, releases or earnings. It lives on the Cover. By default a Reader sees it only if they follow its Topic, and each Reader can add, remove or reorder Widgets.
_Avoid_: Card, module

## Display

**Display**:
How a Reader's Brief looks and is arranged: their Layout for each kind of screen, theme, accent, text size, density, Topic order and pins, Cover, dock buttons and whether Sensitive Items are blurred. It belongs to the Reader and follows them across devices. It never changes what is in the Brief or how Items are ranked; that is the Interest Profile's job.
_Avoid_: Settings, preferences, appearance, look

**Layout**:
The arrangement a Reader reads their Brief in: **Swipe** (one Item per screen), **Front Page** (top stories, then one block per Topic, with a reader pane), or **List** (compact headlines for skimming). A Reader picks one each for phone, tablet and PC.
_Avoid_: View, mode, template

**Cover**:
The opening of every Brief: the greeting, date and Edition, plus the Reader's Widgets.
_Avoid_: Header, home, dashboard

**Pinned Topic**:
A followed Topic the Reader has fixed at the top of their Brief. Pinning changes only where its Items appear, never how they rank.
_Avoid_: Favourite, starred

**Collapsed Topic**:
A followed Topic the Reader only wants to skim. It shows as a list of its headlines (a strip on the Front Page, one digest card in Swipe) that can be opened up into its Items.
_Avoid_: Muted, minimised, hidden
