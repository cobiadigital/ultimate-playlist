/**
 * Cloudflare Worker environment bindings. On Workers these are provided per-request
 * via the `env` argument (vars from wrangler.toml, secrets from the dashboard / .dev.vars),
 * not through `process.env`.
 */
export interface Env {
  SPOTIFY_CLIENT_ID?: string;
  SPOTIFY_CLIENT?: string;
  SPOTIFY_CLIENT_SECRET?: string;
  SPOTIFY_SECRET?: string;
  SPOTIFY_REDIRECT_URI?: string;
  SESSION_SECRET?: string;
}

export interface Config {
  spotify: {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
  };
  sessionSecret: string;
}

/** Returns the first defined value among `values`, or throws naming all the candidates. */
function required(label: string, values: Array<string | undefined>): string {
  for (const value of values) {
    if (value) return value;
  }
  throw new Error(`Missing required configuration: ${label}.`);
}

/**
 * Resolves the OAuth redirect URI Spotify must redirect back to. Spotify requires this value
 * to EXACTLY match a Redirect URI registered on the app, and to be byte-for-byte identical
 * between the /authorize request and the token exchange — otherwise it rejects the flow with
 * "redirect_uri: Not matching configuration".
 *
 * An explicit `SPOTIFY_REDIRECT_URI` always wins (so it can be pinned to the exact registered
 * value). Otherwise we derive `${origin}/auth/callback` from the actual incoming request, which
 * keeps the value in sync with whatever host the user reached us on (custom domain, *.workers.dev
 * preview, local dev) instead of a stale hardcoded URL. Falls back to the loopback dev URL only
 * when neither is available.
 */
function resolveRedirectUri(env: Env, requestUrl?: string): string {
  if (env.SPOTIFY_REDIRECT_URI) return env.SPOTIFY_REDIRECT_URI;
  if (requestUrl) return new URL('/auth/callback', requestUrl).toString();
  return 'http://127.0.0.1:8787/auth/callback';
}

/**
 * Reads and validates configuration from the Worker env. Throws if a required Spotify
 * credential is missing, so misconfiguration fails fast and loudly.
 *
 * Credential names accept either the hosted-environment form (SPOTIFY_CLIENT /
 * SPOTIFY_SECRET) or the explicit SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET.
 *
 * Pass the incoming request URL (`c.req.url`) so the redirect URI can be derived from the
 * request origin when `SPOTIFY_REDIRECT_URI` is not set.
 */
export function loadConfig(env: Env, requestUrl?: string): Config {
  return {
    spotify: {
      clientId: required('SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT', [
        env.SPOTIFY_CLIENT_ID,
        env.SPOTIFY_CLIENT,
      ]),
      clientSecret: required('SPOTIFY_CLIENT_SECRET or SPOTIFY_SECRET', [
        env.SPOTIFY_CLIENT_SECRET,
        env.SPOTIFY_SECRET,
      ]),
      redirectUri: resolveRedirectUri(env, requestUrl),
    },
    sessionSecret: required('SESSION_SECRET', [env.SESSION_SECRET]),
  };
}
