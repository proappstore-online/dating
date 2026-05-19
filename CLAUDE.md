# dating

A pro app on ProAppStore — Tinder-style dating with profiles, swipe discovery, mutual-match detection, and real-time chat.

- Subdomain: `dating.proappstore.online`
- Dev: `pnpm install && pnpm dev`
- Build: `pnpm build`
- Deploy: `git push origin main` (auto-deploys via Cloudflare Pages)

For platform conventions, read
https://proappstore.online/skills.md
before writing or changing anything.

## Data model (D1)

- `profiles(user_id PK, display_name, dob, bio, gender, looking_for, photos_json, lat, lng, updated_at)`
- `swipes(swiper_id, target_id, direction, created_at)` — composite PK `(swiper_id, target_id)`
- `matches(a_id, b_id, created_at)` — `a_id < b_id` invariant; composite PK `(a_id, b_id)`
- `messages(id PK, match_a, match_b, sender_id, body, created_at)`

## Storage

Profile photos go to R2 via `app.storage` under `profiles/{userId}/{n}.jpg`.

## Chat

One `app.rooms` channel per match: `match:{a_id}:{b_id}` (sorted). Messages also persisted to D1 for history.

## Moderation

Moderation is AI-driven end-to-end — no human reviewers in the loop.

- **Photos**: on upload, classified via Workers AI (NSFW model) before R2 commit. Reject above threshold; persist the score on the photo for later re-audit.
- **Profile text** (bio, display name): on save, fed to Workers AI text-classifier. Reject if abusive/spammy.
- **Messages**: on send, optional AI-classifier sniff for harassment patterns; severe matches block the send and log to `reports` automatically.
- **Reports**: stored in D1 from the in-app report sheet. A scheduled Worker passes accumulated reports + the reported profile's full context to an LLM for a verdict (no-op / shadow-cap / hard-ban). Humans only see escalations the LLM explicitly flags as ambiguous.

## Age gating

Age comes from the **platform**, not this app. `app.auth.user.dateOfBirth` is set once via `app.auth.setDateOfBirth(...)` and shared across every app on the platform — see `freeappstore-online/platform`. Dating enforces an 18+ floor over the platform's 13+ floor; if the user's platform DOB makes them < 18, we refuse them at the door.
