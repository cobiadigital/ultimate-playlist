# ultimate-playlist

Transfer playlists between streaming services. This first iteration runs on **Cloudflare
Workers** and supports **Spotify**: export a playlist to a service-neutral JSON format, and
import that JSON back into Spotify as a new playlist.

## How it works

- **Export** — `GET /api/playlists/:id/export` reads a Spotify playlist (following pagination)
  and returns a [`CanonicalPlaylist`](src/model/playlist.ts): portable fields (title, artists,
  ISRC) plus a `sources` map preserving the native Spotify URIs for lossless round-trips.
- **Import** — `POST /api/playlists/import` takes a `CanonicalPlaylist`, creates a new playlist
  on the authenticated user's account, resolves each track to a Spotify URI (preferring the
  preserved URI, falling back to ISRC then title/artist search), and adds them in batches of 100.
  Unresolved tracks are returned in `unmatched` rather than failing the import.

The canonical model is the seam for future services (Apple Music, YouTube Music, …): only a new
`sources` entry and a service adapter are needed.

## HTTP API

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health` | Liveness check |
| GET | `/auth/login` | Begin Spotify OAuth (redirects to Spotify) |
| GET | `/auth/callback` | OAuth redirect target; sets the session cookie |
| GET | `/auth/status` | `{ authenticated: boolean }` |
| GET | `/api/playlists/:id/export` | Returns a `CanonicalPlaylist` |
| POST | `/api/playlists/import` | Body: `CanonicalPlaylist`; creates a Spotify playlist |

Per-user Spotify tokens are stored in an **encrypted (AES-GCM) httpOnly cookie**, so no
server-side session store is required — a good fit for stateless Workers isolates.

## Setup

1. Create a Spotify app at <https://developer.spotify.com/dashboard>.
2. Register the redirect URI `http://127.0.0.1:8787/auth/callback` for local dev (Spotify
   requires the `127.0.0.1` loopback IP, not `localhost`). For production, register your
   deployed Worker URL + `/auth/callback`.
3. Copy `.dev.vars.example` to `.dev.vars` and fill in the credentials.

```bash
npm install
npm run dev        # wrangler dev on http://127.0.0.1:8787
```

Then open <http://127.0.0.1:8787/auth/login>, approve, and call the API (the browser keeps the
session cookie):

```bash
# Export (run in the browser, or pass the cookie to curl)
curl 'http://127.0.0.1:8787/api/playlists/<playlistId>/export'

# Import
curl -X POST 'http://127.0.0.1:8787/api/playlists/import' \
  -H 'content-type: application/json' \
  --data @playlist.json
```

## Deploy (Cloudflare)

Configured in [`wrangler.toml`](wrangler.toml). Connect the repo to Cloudflare so it deploys on
git push (Workers Builds), or run `npm run deploy`. Set these as secrets in the Cloudflare
dashboard (or via `wrangler secret put`):

- `SPOTIFY_CLIENT_ID` (or `SPOTIFY_CLIENT`)
- `SPOTIFY_CLIENT_SECRET` (or `SPOTIFY_SECRET`)
- `SESSION_SECRET` — long random string used to encrypt the session cookie

Set `SPOTIFY_REDIRECT_URI` (in `wrangler.toml` `[vars]` or the dashboard) to your production
callback URL.

## Scripts

- `npm run dev` — local Worker via `wrangler dev`
- `npm run deploy` — deploy to Cloudflare
- `npm test` — unit tests (Vitest)
- `npm run typecheck` — `tsc --noEmit`
- `npm run lint` / `npm run format` — ESLint + Prettier
