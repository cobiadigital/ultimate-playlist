import type { Config } from '../config';
import { refreshTokens, type TokenSet } from './auth';

const API_BASE = 'https://api.spotify.com/v1';

/** A Spotify paged object: https://developer.spotify.com/documentation/web-api/concepts/api-calls */
export interface Page<T> {
  items: T[];
  next: string | null;
}

export class SpotifyApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'SpotifyApiError';
  }
}

/**
 * Authenticated Spotify Web API client bound to a single user's token set.
 *
 * The client refreshes the access token transparently: proactively when it has
 * expired, and reactively once on a 401 (in case Spotify revoked it early). The
 * caller passes an `onTokensRefreshed` callback so the new tokens can be persisted
 * back into the session.
 */
export class SpotifyClient {
  constructor(
    private config: Config,
    private tokens: TokenSet,
    private onTokensRefreshed: (tokens: TokenSet) => void,
  ) {}

  private async ensureFreshToken(): Promise<void> {
    if (Date.now() >= this.tokens.expiresAt) {
      this.tokens = await refreshTokens(this.config, this.tokens);
      this.onTokensRefreshed(this.tokens);
    }
  }

  /** Performs a request against an absolute Spotify URL or a `/v1`-relative path. */
  async request<T>(pathOrUrl: string, init: RequestInit = {}, retryOn401 = true): Promise<T> {
    await this.ensureFreshToken();

    const url = pathOrUrl.startsWith('http') ? pathOrUrl : `${API_BASE}${pathOrUrl}`;
    const res = await fetch(url, {
      ...init,
      headers: {
        ...init.headers,
        Authorization: `Bearer ${this.tokens.accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (res.status === 401 && retryOn401) {
      this.tokens = await refreshTokens(this.config, this.tokens);
      this.onTokensRefreshed(this.tokens);
      return this.request<T>(pathOrUrl, init, false);
    }

    if (!res.ok) {
      const text = await res.text();
      throw new SpotifyApiError(res.status, `Spotify API ${res.status} for ${url}: ${text}`);
    }

    // 201/204 responses (e.g. add-tracks) may have no body.
    if (res.status === 204) return undefined as T;
    const text = await res.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }

  /**
   * Follows Spotify pagination starting from a relative path, returning every item.
   * `extract` pulls the `Page<T>` out of the response (playlist tracks nest it under
   * `tracks`, while the tracks endpoint returns it directly).
   */
  async getAllPages<TResponse, TItem>(
    firstPath: string,
    extract: (response: TResponse) => Page<TItem>,
  ): Promise<TItem[]> {
    const items: TItem[] = [];
    let next: string | null = firstPath;
    while (next) {
      const response = await this.request<TResponse>(next);
      const page = extract(response);
      items.push(...page.items);
      next = page.next;
    }
    return items;
  }
}
