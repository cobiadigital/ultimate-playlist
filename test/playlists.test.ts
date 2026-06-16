import { describe, expect, it } from 'vitest';
import type { SpotifyClient } from '../src/spotify/api';
import { getPlaylist, savePlaylist } from '../src/spotify/playlists';
import type { CanonicalPlaylist, CanonicalTrack } from '../src/model/playlist';

type Handler = (path: string, init?: RequestInit) => unknown;

/** Builds a stand-in SpotifyClient whose `request` is driven by `handler`, recording calls. */
function fakeClient(handler: Handler) {
  const calls: Array<{ path: string; init?: RequestInit }> = [];
  const client = {
    request: async (path: string, init?: RequestInit) => {
      calls.push({ path, init });
      return handler(path, init);
    },
  } as unknown as SpotifyClient;
  return { client, calls };
}

function spotifyTrack(id: string, name: string) {
  return {
    id,
    uri: `spotify:track:${id}`,
    name,
    artists: [{ name: 'Artist' }],
    album: { name: 'Album' },
    duration_ms: 200_000,
    external_ids: { isrc: `ISRC${id}` },
  };
}

describe('getPlaylist (export)', () => {
  it('follows pagination and skips null/local tracks', async () => {
    const nextUrl = 'https://api.spotify.com/v1/playlists/PID/tracks?offset=100';
    const { client } = fakeClient((path) => {
      if (path === '/playlists/PID') {
        return {
          id: 'PID',
          name: 'My Mix',
          description: null,
          public: true,
          external_urls: { spotify: 'https://open.spotify.com/playlist/PID' },
          tracks: {
            items: [
              { track: spotifyTrack('a', 'First') },
              { track: null },
              { track: { ...spotifyTrack('x', 'Local'), is_local: true } },
            ],
            next: nextUrl,
          },
        };
      }
      if (path === nextUrl) {
        return { items: [{ track: spotifyTrack('b', 'Second') }], next: null };
      }
      throw new Error(`unexpected path ${path}`);
    });

    const playlist = await getPlaylist(client, 'PID');

    expect(playlist.name).toBe('My Mix');
    expect(playlist.isPublic).toBe(true);
    expect(playlist.sources?.spotify?.id).toBe('PID');
    expect(playlist.tracks.map((t) => t.title)).toEqual(['First', 'Second']);
    expect(playlist.tracks[0]?.sources.spotify?.uri).toBe('spotify:track:a');
  });
});

describe('savePlaylist (import)', () => {
  const baseTrack = (uri?: string, isrc?: string): CanonicalTrack => ({
    title: 'Song',
    artists: ['Artist'],
    isrc,
    sources: uri ? { spotify: { uri, id: uri.split(':')[2]! } } : {},
  });

  function importHandler(searchHits: Record<string, string | null>): {
    handler: Handler;
    addedBatches: string[][];
  } {
    const addedBatches: string[][] = [];
    const handler: Handler = (path, init) => {
      if (path === '/me') return { id: 'user1' };
      if (path === '/users/user1/playlists') {
        return {
          id: 'newpl',
          external_urls: { spotify: 'https://open.spotify.com/playlist/newpl' },
        };
      }
      if (path.startsWith('/search')) {
        const key = path.includes('isrc') ? 'isrc' : 'text';
        const uri = searchHits[key] ?? null;
        return { tracks: { items: uri ? [{ uri }] : [] } };
      }
      if (path === '/playlists/newpl/tracks') {
        addedBatches.push((JSON.parse(String(init?.body)) as { uris: string[] }).uris);
        return undefined;
      }
      throw new Error(`unexpected path ${path}`);
    };
    return { handler, addedBatches };
  }

  it('batches added tracks in groups of 100', async () => {
    const tracks = Array.from({ length: 150 }, (_, i) => baseTrack(`spotify:track:id${i}`));
    const playlist: CanonicalPlaylist = { name: 'Big', tracks };
    const { handler, addedBatches } = importHandler({});
    const { client } = fakeClient(handler);

    const result = await savePlaylist(client, playlist);

    expect(result.added).toBe(150);
    expect(result.unmatched).toHaveLength(0);
    expect(addedBatches.map((b) => b.length)).toEqual([100, 50]);
  });

  it('resolves missing URIs via search and reports unmatched tracks', async () => {
    const playlist: CanonicalPlaylist = {
      name: 'Mixed',
      tracks: [
        baseTrack('spotify:track:native'), // already has a URI
        baseTrack(undefined, 'ISRC123'), // found via ISRC search
        baseTrack(undefined), // no match -> unmatched
      ],
    };
    const { handler, addedBatches } = importHandler({ isrc: 'spotify:track:found', text: null });
    const { client } = fakeClient(handler);

    const result = await savePlaylist(client, playlist);

    expect(result.added).toBe(2);
    expect(addedBatches[0]).toEqual(['spotify:track:native', 'spotify:track:found']);
    expect(result.unmatched).toHaveLength(1);
    expect(result.unmatched[0]?.sources.spotify).toBeUndefined();
  });
});
