import { Hono } from 'hono';
import type { Env } from '../config';
import { loadConfig } from '../config';
import { buildAuthorizeUrl, exchangeCodeForTokens } from '../spotify/auth';
import { consumeOAuthState, getSession, setOAuthState, setSession } from '../session';

/** Routes implementing the Spotify Authorization Code OAuth flow. */
export const authRouter = new Hono<{ Bindings: Env }>();

// Kick off the flow: remember a random state and redirect to Spotify's consent page.
authRouter.get('/login', async (c) => {
  const config = loadConfig(c.env);
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const state = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  await setOAuthState(c, state, config.sessionSecret);
  return c.redirect(buildAuthorizeUrl(config, state));
});

// Spotify redirects back here with `code` and `state`.
authRouter.get('/callback', async (c) => {
  const config = loadConfig(c.env);
  const code = c.req.query('code');
  const state = c.req.query('state');
  const error = c.req.query('error');

  if (error) return c.json({ error: `Spotify authorization failed: ${error}` }, 400);
  if (!code || !state) return c.json({ error: 'Missing code or state in callback.' }, 400);

  const expected = await consumeOAuthState(c, config.sessionSecret);
  if (!expected || state !== expected) {
    return c.json({ error: 'State mismatch — possible CSRF; restart login.' }, 400);
  }

  const tokens = await exchangeCodeForTokens(config, code);
  await setSession(c, tokens, config.sessionSecret);
  return c.json({ status: 'authenticated' });
});

// Lightweight check the client can use to know whether to send the user through login.
authRouter.get('/status', async (c) => {
  const config = loadConfig(c.env);
  const tokens = await getSession(c, config.sessionSecret);
  return c.json({ authenticated: Boolean(tokens) });
});
