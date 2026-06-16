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
 * Reads and validates configuration from the Worker env. Throws if a required Spotify
 * credential is missing, so misconfiguration fails fast and loudly.
 *
 * Credential names accept either the hosted-environment form (SPOTIFY_CLIENT /
 * SPOTIFY_SECRET) or the explicit SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET.
 */
export function loadConfig(env: Env): Config {
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
      redirectUri: env.SPOTIFY_REDIRECT_URI ?? 'http://127.0.0.1:8787/auth/callback',
    },
    sessionSecret: required('SESSION_SECRET', [env.SESSION_SECRET]),
  };
}
