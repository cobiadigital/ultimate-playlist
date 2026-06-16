import { Hono } from 'hono';
import type { Context } from 'hono';
import type { Config, Env } from '../config';
import { loadConfig } from '../config';
import { SpotifyClient } from '../spotify/api';
import { getPlaylist, savePlaylist } from '../spotify/playlists';
import { getSession, setSession } from '../session';
import type { CanonicalPlaylist } from '../model/playlist';
import type { TokenSet } from '../spotify/auth';

/** Routes for exporting and importing playlists. */
export const playlistsRouter = new Hono<{ Bindings: Env }>();

interface Session {
  config: Config;
  client: SpotifyClient;
  /** Persists the session cookie if the client refreshed the access token. */
  commit: () => Promise<void>;
}

/**
 * Loads config + tokens and builds a SpotifyClient. Returns null (after sending a 401)
 * when the request is unauthenticated. The client's refresh callback captures any new
 * tokens so `commit()` can write them back into the cookie.
 */
async function openSession(c: Context<{ Bindings: Env }>): Promise<Session | null> {
  const config = loadConfig(c.env);
  const tokens = await getSession(c, config.sessionSecret);
  if (!tokens) return null;

  let latest: TokenSet = tokens;
  const client = new SpotifyClient(config, tokens, (refreshed) => {
    latest = refreshed;
  });
  return {
    config,
    client,
    commit: async () => {
      if (latest !== tokens) await setSession(c, latest, config.sessionSecret);
    },
  };
}

function isCanonicalPlaylist(body: unknown): body is CanonicalPlaylist {
  if (typeof body !== 'object' || body === null) return false;
  const p = body as Record<string, unknown>;
  return typeof p.name === 'string' && Array.isArray(p.tracks);
}

const UNAUTHENTICATED = { error: 'Not authenticated. Visit /auth/login first.' } as const;

// Export: Spotify playlist -> canonical JSON.
playlistsRouter.get('/:id/export', async (c) => {
  const session = await openSession(c);
  if (!session) return c.json(UNAUTHENTICATED, 401);

  const playlist = await getPlaylist(session.client, c.req.param('id'));
  await session.commit();
  return c.json(playlist);
});

// Import: canonical JSON -> new Spotify playlist.
playlistsRouter.post('/import', async (c) => {
  const session = await openSession(c);
  if (!session) return c.json(UNAUTHENTICATED, 401);

  const body = await c.req.json().catch(() => null);
  if (!isCanonicalPlaylist(body)) {
    return c.json({ error: 'Body must be a CanonicalPlaylist ({ name, tracks }).' }, 400);
  }

  const result = await savePlaylist(session.client, body);
  await session.commit();
  return c.json(result, 201);
});
