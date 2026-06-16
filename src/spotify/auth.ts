import type { Config } from '../config';

const ACCOUNTS_BASE = 'https://accounts.spotify.com';

/** Scopes needed to read private playlists and create/modify playlists. */
export const SCOPES = [
  'playlist-read-private',
  'playlist-modify-public',
  'playlist-modify-private',
];

/** OAuth tokens for a single authenticated user, as stored in the session cookie. */
export interface TokenSet {
  accessToken: string;
  refreshToken: string;
  /** Epoch milliseconds at which `accessToken` expires. */
  expiresAt: number;
}

/** Builds the Spotify authorize URL the user is redirected to in order to grant access. */
export function buildAuthorizeUrl(config: Config, state: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: config.spotify.clientId,
    scope: SCOPES.join(' '),
    redirect_uri: config.spotify.redirectUri,
    state,
  });
  return `${ACCOUNTS_BASE}/authorize?${params.toString()}`;
}

interface SpotifyTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
}

function basicAuthHeader(config: Config): string {
  // Client id/secret are ASCII, so btoa is sufficient (and available on Workers).
  return `Basic ${btoa(`${config.spotify.clientId}:${config.spotify.clientSecret}`)}`;
}

async function requestToken(config: Config, body: URLSearchParams): Promise<SpotifyTokenResponse> {
  const res = await fetch(`${ACCOUNTS_BASE}/api/token`, {
    method: 'POST',
    headers: {
      Authorization: basicAuthHeader(config),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Spotify token request failed (${res.status}): ${text}`);
  }
  return (await res.json()) as SpotifyTokenResponse;
}

function toTokenSet(res: SpotifyTokenResponse, fallbackRefreshToken?: string): TokenSet {
  const refreshToken = res.refresh_token ?? fallbackRefreshToken;
  if (!refreshToken) {
    throw new Error('Spotify token response did not include a refresh token.');
  }
  return {
    accessToken: res.access_token,
    refreshToken,
    // Subtract a small skew so we refresh slightly before actual expiry.
    expiresAt: Date.now() + (res.expires_in - 30) * 1000,
  };
}

/** Exchanges an authorization code (from the OAuth callback) for a token set. */
export async function exchangeCodeForTokens(config: Config, code: string): Promise<TokenSet> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: config.spotify.redirectUri,
  });
  return toTokenSet(await requestToken(config, body));
}

/**
 * Uses the refresh token to obtain a fresh access token. Spotify may or may not
 * return a new refresh token; if it doesn't, we keep the existing one.
 */
export async function refreshTokens(config: Config, current: TokenSet): Promise<TokenSet> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: current.refreshToken,
  });
  return toTokenSet(await requestToken(config, body), current.refreshToken);
}
