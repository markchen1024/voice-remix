import type { Project, TrackId } from "./edit-transactions";

export type MixerPlayer = {
  mute: boolean;
  volume: { value: number };
};

export type MixerPlayerBank<TPlayer extends MixerPlayer = MixerPlayer> = Partial<Record<TrackId, TPlayer[]>>;

export type MixerTrackStatus = {
  id: TrackId;
  enabled: boolean;
  level: number;
  playerCount: number;
  mutedPlayerCount: number;
};

export type MixerStatus = {
  ready: boolean;
  playerCount: number;
  mutedPlayerCount: number;
  tracks: MixerTrackStatus[];
};

export const EMPTY_MIXER_STATUS: MixerStatus = {
  ready: false,
  playerCount: 0,
  mutedPlayerCount: 0,
  tracks: [],
};

export function syncProjectMixer<TPlayer extends MixerPlayer>(
  project: Project,
  players: MixerPlayerBank<TPlayer>,
  gainToDb: (gain: number) => number,
): MixerStatus {
  const tracks = project.tracks.map((track) => {
    const trackPlayers = players[track.id] ?? [];
    for (const player of trackPlayers) {
      player.volume.value = gainToDb(Math.max(0.001, track.level));
      // Tone implements mute by setting volume to -Infinity, so volume must be
      // restored first and mute applied last.
      player.mute = !track.enabled;
    }
    return {
      id: track.id,
      enabled: track.enabled,
      level: track.level,
      playerCount: trackPlayers.length,
      mutedPlayerCount: trackPlayers.filter((player) => player.mute).length,
    };
  });

  return {
    ready: tracks.length > 0 && tracks.every((track) => track.playerCount > 0),
    playerCount: tracks.reduce((total, track) => total + track.playerCount, 0),
    mutedPlayerCount: tracks.reduce((total, track) => total + track.mutedPlayerCount, 0),
    tracks,
  };
}
