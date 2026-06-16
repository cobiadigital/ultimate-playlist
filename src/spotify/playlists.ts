import type { CanonicalPlaylist, CanonicalTrack, ImportResult } from '../model/playlist';
import type { Page, SpotifyClient } from './api';
import {
  spotifyTrackToCanonical,
  type SpotifyPlaylistTrackItem,
  type SpotifyTrack,
} from './mappers';

const ADD_TRACKS_BATCH_SIZE = 100;

interface SpotifyPlaylistResponse {
  id: string;
  name: string;
  description: string | null;
  public: boolean | null;
  external_urls: { spotify: string };
  tracks: Page<SpotifyPlaylistTrackItem>;
}

interface SpotifyUserResponse {
  id: string;
}

interface SpotifyCreatePlaylistResponse {
  id: string;
  external_urls: { spotify: string };
}

interface SpotifySearchResponse {
  tracks: { items: SpotifyTrack[] };
}

/**
 * Exports a Spotify playlist to the canonical model, following pagination so the
 * full track list is captured regardless of size.
 */
export async function getPlaylist(
  client: SpotifyClient,
  playlistId: string,
): Promise<CanonicalPlaylist> {
  const playlist = await client.request<SpotifyPlaylistResponse>(`/playlists/${playlistId}`);

  // The first page of tracks arrives embedded in the playlist response; continue
  // from its `next` link to gather the rest.
  const items: SpotifyPlaylistTrackItem[] = [...playlist.tracks.items];
  let next = playlist.tracks.next;
  while (next) {
    const page = await client.request<Page<SpotifyPlaylistTrackItem>>(next);
    items.push(...page.items);
    next = page.next;
  }

  const tracks = items
    .map((item) => spotifyTrackToCanonical(item.track))
    .filter((t): t is CanonicalTrack => t !== null);

  return {
    name: playlist.name,
    description: playlist.description ?? undefined,
    isPublic: playlist.public ?? undefined,
    tracks,
    sources: {
      spotify: { id: playlist.id, url: playlist.external_urls.spotify },
    },
  };
}

/** Splits an array into chunks of at most `size`. */
function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

/** Builds a Spotify search query from canonical fields. */
function searchQuery(track: CanonicalTrack): string {
  if (track.isrc) return `isrc:${track.isrc}`;
  const artist = track.artists[0];
  const artistClause = artist ? ` artist:${artist}` : '';
  return `track:${track.title}${artistClause}`;
}

/**
 * Resolves a canonical track to a Spotify track URI. Prefers the preserved native
 * URI (lossless for same-service round-trips); otherwise searches by ISRC, then by
 * title/artist. Returns null when nothing matches.
 */
async function resolveTrackUri(
  client: SpotifyClient,
  track: CanonicalTrack,
): Promise<string | null> {
  if (track.sources.spotify?.uri) return track.sources.spotify.uri;

  const params = new URLSearchParams({
    q: searchQuery(track),
    type: 'track',
    limit: '1',
  });
  const result = await client.request<SpotifySearchResponse>(`/search?${params.toString()}`);
  return result.tracks.items[0]?.uri ?? null;
}

/**
 * Imports a canonical playlist into Spotify: creates a new playlist for the current
 * user, resolves each track to a Spotify URI, and adds them in batches of 100.
 * Unresolved tracks are reported back rather than failing the whole import.
 */
export async function savePlaylist(
  client: SpotifyClient,
  playlist: CanonicalPlaylist,
): Promise<ImportResult> {
  const me = await client.request<SpotifyUserResponse>('/me');

  const created = await client.request<SpotifyCreatePlaylistResponse>(`/users/${me.id}/playlists`, {
    method: 'POST',
    body: JSON.stringify({
      name: playlist.name,
      description: playlist.description ?? '',
      public: playlist.isPublic ?? false,
    }),
  });

  const uris: string[] = [];
  const unmatched: CanonicalTrack[] = [];
  for (const track of playlist.tracks) {
    const uri = await resolveTrackUri(client, track);
    if (uri) uris.push(uri);
    else unmatched.push(track);
  }

  for (const batch of chunk(uris, ADD_TRACKS_BATCH_SIZE)) {
    await client.request(`/playlists/${created.id}/tracks`, {
      method: 'POST',
      body: JSON.stringify({ uris: batch }),
    });
  }

  return {
    id: created.id,
    url: created.external_urls.spotify,
    added: uris.length,
    unmatched,
  };
}
