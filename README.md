# platform

YouTube, structured for you. Platform is a curated viewing layer on top of
YouTube — creators keep uploading through YouTube Studio as normal; Platform
reads what's already public and slots it into intent-driven categories for
viewers.

## Connect to Creation

Lets a creator link their YouTube channel so their uploads start showing up
on Platform automatically. No re-uploading, no extra storage on our end —
Platform only ever stores video *metadata* (id, title, thumbnail URL,
published date), never the files themselves.

**How it works:**
1. Signed-in users see a black hexagon button next to their avatar in the
   header → **Connect to Creation** → `/connect`.
2. `/connect` shows three cards: **YouTube Studio** (live) and two greyed,
   dashed **Coming Soon** cards for future platforms.
3. Clicking **Connect Channel** starts a Google OAuth flow, requesting only
   `youtube.readonly`. This is used *once* — to confirm which channel is
   theirs and grab its channel id, title, and thumbnail. No token is stored.
4. From then on, Platform reads that channel's public RSS feed
   (`https://www.youtube.com/feeds/videos.xml?channel_id=...`), which needs
   no API key and burns no quota. New videos get inserted with
   `indexed = false` until something downstream (your category-assignment
   step) picks them up.
5. Syncing happens three ways:
   - The header dropdown gets a **Sync Videos** row once connected.
   - `/connect` has a **Sync Now** button.
   - A background timer checks every 5 minutes while a signed-in creator has
     any page open (`PlatformAuth.startAutoSync()`).
   - `.github/workflows/sync-creators.yml` pings the batch sync function on
     a schedule, for creators who don't have the tab open.

### Setup checklist

1. **Database** — run `supabase/migrations/0001_creator_connections.sql`.
   References your real `users(id)` table, so no edits needed.

2. **Session verification** — already wired to your real `requireSession()` /
   `SESSION_SECRET` from `_shared/session.ts`, same as `update-pfp` and the
   rest of your functions. Nothing to change here.

3. **Google OAuth client** — see `GOOGLE_OAUTH_SETUP.md` for the full
   click-by-click walkthrough. Short version: create an OAuth 2.0 Web
   client in Google Cloud Console, add
   `https://YOUR_DOMAIN/connect/callback` as an authorized redirect URI,
   then:
   - Drop the client ID into `connect/index.html` (`GOOGLE_CLIENT_ID`).
   - Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` as Supabase function
     secrets: `supabase secrets set GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=...`

4. **Deploy the edge functions:**
   ```
   supabase functions deploy creator-connection-status
   supabase functions deploy youtube-oauth-callback
   supabase functions deploy sync-youtube-videos
   supabase functions deploy creator-disconnect
   supabase functions deploy cron-sync-all
   ```

5. **Cron secret** — pick any random string, then:
   ```
   supabase secrets set CRON_SECRET=your-random-string
   ```
   and add the same value as a `CRON_SECRET` GitHub Actions repo secret,
   plus `SUPABASE_FUNCTIONS_URL` (`https://YOUR_PROJECT_REF.supabase.co/functions/v1`).

That's it — once deployed, the hexagon button, `/connect`, and syncing all
work end to end.
