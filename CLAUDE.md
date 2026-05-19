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
