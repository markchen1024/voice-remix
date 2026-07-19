import assert from "node:assert/strict";
import test from "node:test";
import { syncProjectMixer } from "../app/audio-mixer.ts";

const track = (id, enabled, level = 1) => ({ id, label: id.toUpperCase(), role: "test", color: "#fff", enabled, level, audioUrl: "", peaksUrl: "", meanDb: -20, maxDb: -3 });
const player = () => {
  let unmutedVolume = 0;
  return {
    volume: { value: 0 },
    get mute() {
      return this.volume.value === -Infinity;
    },
    set mute(mute) {
      if (!this.mute && mute) {
        unmutedVolume = this.volume.value;
        this.volume.value = -Infinity;
      } else if (this.mute && !mute) {
        this.volume.value = unmutedVolume;
      }
    },
  };
};

test("proposal mixer state reaches every scheduled player", () => {
  const project = {
    version: 1,
    totalBars: 59,
    bpm: 118,
    sections: [],
    tracks: [
      track("drums", true),
      track("percussion", false),
      track("bass", true, 1.25),
      track("synth", false),
      track("fx", false),
    ],
  };
  const players = Object.fromEntries(project.tracks.map((item) => [item.id, Array.from({ length: 9 }, player)]));
  const status = syncProjectMixer(project, players, (gain) => gain * 10);

  assert.equal(status.ready, true);
  assert.equal(status.playerCount, 45);
  assert.equal(status.mutedPlayerCount, 27);
  assert.ok(players.percussion.every((item) => item.mute));
  assert.ok(players.synth.every((item) => item.mute));
  assert.ok(players.fx.every((item) => item.mute));
  assert.ok(players.drums.every((item) => !item.mute));
  assert.ok(players.bass.every((item) => !item.mute));
  assert.ok(players.bass.every((item) => item.volume.value === 12.5));
});

test("current mixer state restores every player", () => {
  const project = {
    version: 1,
    totalBars: 59,
    bpm: 118,
    sections: [],
    tracks: [track("drums", true), track("percussion", true), track("bass", true), track("synth", true), track("fx", true)],
  };
  const players = Object.fromEntries(project.tracks.map((item) => [item.id, Array.from({ length: 2 }, player)]));
  Object.values(players).flat().forEach((item) => { item.mute = true; });
  const status = syncProjectMixer(project, players, (gain) => gain);

  assert.equal(status.mutedPlayerCount, 0);
  assert.ok(Object.values(players).flat().every((item) => !item.mute));
});

test("section energy is included in each scheduled player's audible gain", () => {
  const project = {
    version: 1,
    totalBars: 4,
    bpm: 118,
    sections: [],
    tracks: [track("drums", true, 1.2)],
  };
  const players = { drums: [player()] };
  players.drums[0].mixGain = 0.8;
  syncProjectMixer(project, players, (gain) => gain);
  assert.equal(players.drums[0].volume.value, 0.96);
});

test("section automation updates only the matching scheduled player", () => {
  const project = {
    version: 1,
    totalBars: 8,
    bpm: 118,
    sections: [
      { id: "verse", kind: "verse", label: "Verse", startBar: 0, lengthBars: 4, energy: 0.8 },
      { id: "chorus", kind: "chorus", label: "Chorus", startBar: 4, lengthBars: 4, energy: 1 },
    ],
    tracks: [track("drums", true)],
    automation: [{ sectionId: "chorus", trackId: "drums", enabled: false, level: 1.2 }],
  };
  const versePlayer = Object.assign(player(), { sectionId: "verse", mixGain: 1 });
  const chorusPlayer = Object.assign(player(), { sectionId: "chorus", mixGain: 1 });
  const status = syncProjectMixer(project, { drums: [versePlayer, chorusPlayer] }, (gain) => gain);

  assert.equal(versePlayer.mute, false);
  assert.equal(versePlayer.volume.value, 1);
  assert.equal(chorusPlayer.mute, true);
  assert.equal(status.mutedPlayerCount, 1);
  chorusPlayer.mute = false;
  assert.equal(chorusPlayer.volume.value, 1.2);
});

test("repeated chorus players keep the committed mute state across mixer refreshes", () => {
  const project = {
    version: 2,
    totalBars: 12,
    bpm: 118,
    sections: [
      { id: "chorus-1", kind: "chorus", label: "Chorus", startBar: 0, lengthBars: 4, energy: 0.8 },
      { id: "verse", kind: "verse", label: "Verse", startBar: 4, lengthBars: 4, energy: 0.5 },
      { id: "chorus-2", kind: "chorus", label: "Final Chorus", startBar: 8, lengthBars: 4, energy: 1 },
    ],
    tracks: [track("synth", true)],
    automation: [
      { sectionId: "chorus-1", trackId: "synth", enabled: false },
      { sectionId: "chorus-2", trackId: "synth", enabled: false },
    ],
  };
  const firstChorus = Object.assign(player(), { sectionId: "chorus-1", mixGain: 1 });
  const verse = Object.assign(player(), { sectionId: "verse", mixGain: 1 });
  const secondChorus = Object.assign(player(), { sectionId: "chorus-2", mixGain: 1 });
  const players = { synth: [firstChorus, verse, secondChorus] };

  syncProjectMixer(project, players, (gain) => gain);
  syncProjectMixer(project, players, (gain) => gain);
  assert.equal(firstChorus.mute, true);
  assert.equal(verse.mute, false);
  assert.equal(secondChorus.mute, true);
});
