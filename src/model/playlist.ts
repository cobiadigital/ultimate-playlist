/**
 * Service-neutral playlist model.
 *
 * The canonical fields (title/artists/isrc) are what let us match a track across
 * streaming services in the future. The `sources` maps additionally preserve each
 * service's native identifiers so a same-service round-trip (e.g. Spotify -> Spotify)
 * stays high-fidelity instead of relying on lossy text matching.
 */

export interface SpotifyTrackSource {
  /** Spotify track URI, e.g. "spotify:track:4iV5W9uYEdYUVa79Axb7Rh". */
  uri: string;
  /** Spotify track id, e.g. "4iV5W9uYEdYUVa79Axb7Rh". */
  id: string;
}

export interface CanonicalTrack {
  title: string;
  artists: string[];
  album?: string;
  durationMs?: number;
  /** International Standard Recording Code — primary cross-service match key. */
  isrc?: string;
  sources: {
    spotify?: SpotifyTrackSource;
  };
}

export interface CanonicalPlaylist {
  name: string;
  description?: string;
  isPublic?: boolean;
  tracks: CanonicalTrack[];
  sources?: {
    spotify?: {
      id: string;
      url: string;
    };
  };
}

/** Result of importing a canonical playlist into a streaming service. */
export interface ImportResult {
  id: string;
  url: string;
  /** Number of tracks successfully added. */
  added: number;
  /** Tracks that could not be resolved to a track on the target service. */
  unmatched: CanonicalTrack[];
}
