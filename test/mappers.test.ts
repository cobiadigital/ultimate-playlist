import { describe, expect, it } from 'vitest';
import { spotifyTrackToCanonical, type SpotifyTrack } from '../src/spotify/mappers.js';

const baseTrack: SpotifyTrack = {
  id: '4iV5W9uYEdYUVa79Axb7Rh',
  uri: 'spotify:track:4iV5W9uYEdYUVa79Axb7Rh',
  name: 'More Than a Feeling',
  artists: [{ name: 'Boston' }],
  album: { name: 'Boston' },
  duration_ms: 285_000,
  external_ids: { isrc: 'USSM17600012' },
};

describe('spotifyTrackToCanonical', () => {
  it('maps a full track including ISRC and preserved Spotify source', () => {
    expect(spotifyTrackToCanonical(baseTrack)).toEqual({
      title: 'More Than a Feeling',
      artists: ['Boston'],
      album: 'Boston',
      durationMs: 285_000,
      isrc: 'USSM17600012',
      sources: {
        spotify: { uri: 'spotify:track:4iV5W9uYEdYUVa79Axb7Rh', id: '4iV5W9uYEdYUVa79Axb7Rh' },
      },
    });
  });

  it('returns null for removed (null) tracks', () => {
    expect(spotifyTrackToCanonical(null)).toBeNull();
  });

  it('returns null for local files', () => {
    expect(spotifyTrackToCanonical({ ...baseTrack, is_local: true })).toBeNull();
  });

  it('returns null when the track has no id', () => {
    expect(spotifyTrackToCanonical({ ...baseTrack, id: null })).toBeNull();
  });
});
