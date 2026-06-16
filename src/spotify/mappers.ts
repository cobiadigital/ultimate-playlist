import type { CanonicalTrack } from '../model/playlist';

/** Minimal shapes of the Spotify Web API objects we consume. */
export interface SpotifyArtist {
  name: string;
}

export interface SpotifyAlbum {
  name: string;
}

export interface SpotifyTrack {
  id: string | null;
  uri: string;
  name: string;
  artists: SpotifyArtist[];
  album?: SpotifyAlbum;
  duration_ms?: number;
  external_ids?: { isrc?: string };
  /** True for local files, which have no usable id/uri for re-adding. */
  is_local?: boolean;
}

export interface SpotifyPlaylistTrackItem {
  track: SpotifyTrack | null;
}

/**
 * Maps a Spotify track to a canonical track. Returns null for items that cannot be
 * represented (null tracks from removed entries, or local files without an id), so
 * callers can skip them cleanly.
 */
export function spotifyTrackToCanonical(track: SpotifyTrack | null): CanonicalTrack | null {
  if (!track || track.is_local || !track.id) return null;

  return {
    title: track.name,
    artists: track.artists.map((a) => a.name),
    album: track.album?.name,
    durationMs: track.duration_ms,
    isrc: track.external_ids?.isrc,
    sources: {
      spotify: { uri: track.uri, id: track.id },
    },
  };
}
