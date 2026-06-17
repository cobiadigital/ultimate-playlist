import { Hono } from 'hono';
import type { Env } from './config';
import { SpotifyApiError } from './spotify/api';
import { authRouter } from './routes/auth';
import { playlistsRouter } from './routes/playlists';
import { PAGE } from './ui';

/** The Hono application. Exported separately from the Worker entry so tests can drive it. */
export const app = new Hono<{ Bindings: Env }>();

app.get('/', (c) => c.html(PAGE));
app.get('/health', (c) => c.json({ status: 'ok' }));
app.route('/auth', authRouter);
app.route('/api/playlists', playlistsRouter);

// Central error handler: surface Spotify API status codes, default to 500.
app.onError((err, c) => {
  const status = err instanceof SpotifyApiError ? err.status : 500;
  return c.json({ error: err.message || 'Internal error' }, status as 500);
});
