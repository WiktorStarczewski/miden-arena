/**
 * AudioManager — singleton handling all game audio: music, SFX, and champion
 * voice announcements.
 *
 * Architecture:
 *   AudioContext
 *     ├── masterMusicGain → destination  (music bus, for crossfading)
 *     └── destination                     (SFX + voice direct)
 *
 * Music is organised as playlists: each screen has multiple tracks that play
 * sequentially, looping back to the first track when the last one ends.
 *
 * Public API is a set of plain exported functions. Every public function is
 * wrapped in try-catch so audio failures never crash the game.
 */

import { getChampion, CHAMPIONS } from "../constants/champions";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MusicTrack = "menu" | "draft" | "battle";
export type SfxName =
  | "attack"
  | "hit"
  | "ko"
  | "select"
  | "pick"
  | "confirm"
  | "victory"
  | "defeat";

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

let ctx: AudioContext | null = null;
let masterMusicGain: GainNode | null = null;

const sfxBuffers = new Map<string, AudioBuffer>();
const voiceBuffers = new Map<string, AudioBuffer>();

/** Cache of loaded music buffers keyed by file path */
const musicBufferCache = new Map<string, AudioBuffer>();

let currentMusic: {
  track: MusicTrack;
  source: AudioBufferSourceNode;
  gain: GainNode;
  /** Index into the playlist for this track */
  playlistIndex: number;
} | null = null;

let currentVoice: AudioBufferSourceNode | null = null;

// Use m4a since macOS afconvert produces m4a (no ffmpeg for mp3)
const AUDIO_EXT = "m4a";

/** Vite's configured base path (e.g. "/miden-arena/" on GitHub Pages, "/" locally) */
const BASE = import.meta.env.BASE_URL;

/**
 * Each screen has a playlist of tracks that play sequentially.
 * When the last track ends, it loops back to the first.
 */
const MUSIC_PLAYLISTS: Record<MusicTrack, string[]> = {
  menu: [
    `${BASE}audio/music/menu_1.${AUDIO_EXT}`,
    `${BASE}audio/music/menu_2.${AUDIO_EXT}`,
    `${BASE}audio/music/menu_3.${AUDIO_EXT}`,
  ],
  draft: [
    `${BASE}audio/music/draft_1.${AUDIO_EXT}`,
    `${BASE}audio/music/draft_2.${AUDIO_EXT}`,
  ],
  battle: [
    `${BASE}audio/music/battle_1.${AUDIO_EXT}`,
    `${BASE}audio/music/battle_2.${AUDIO_EXT}`,
    `${BASE}audio/music/battle_3.${AUDIO_EXT}`,
  ],
};

const SFX_NAMES: SfxName[] = [
  "attack",
  "hit",
  "ko",
  "select",
  "pick",
  "confirm",
  "victory",
  "defeat",
];

const CHAMPION_NAMES = CHAMPIONS.map((c) => c.name.toLowerCase());

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function loadBuffer(url: string): Promise<AudioBuffer | null> {
  try {
    if (!ctx) return null;
    const response = await fetch(url);
    if (!response.ok) return null;
    const arrayBuffer = await response.arrayBuffer();
    return await ctx.decodeAudioData(arrayBuffer);
  } catch {
    return null;
  }
}

async function preloadSfx(): Promise<void> {
  const loads = SFX_NAMES.map(async (name) => {
    const buffer = await loadBuffer(`${BASE}audio/sfx/${name}.${AUDIO_EXT}`);
    if (buffer) sfxBuffers.set(name, buffer);
  });
  await Promise.all(loads);
}

async function preloadVoices(): Promise<void> {
  const loads = CHAMPION_NAMES.map(async (name) => {
    const buffer = await loadBuffer(`${BASE}audio/voices/${name}.${AUDIO_EXT}`);
    if (buffer) voiceBuffers.set(name, buffer);
  });
  await Promise.all(loads);
}

/**
 * Load a music buffer (with caching).
 */
async function loadMusicBuffer(path: string): Promise<AudioBuffer | null> {
  const cached = musicBufferCache.get(path);
  if (cached) return cached;
  const buffer = await loadBuffer(path);
  if (buffer) musicBufferCache.set(path, buffer);
  return buffer;
}

/**
 * Start playing a specific track from a playlist, with crossfade from the
 * previous source. When the track ends, automatically advances to the next
 * track in the playlist.
 */
function startPlaylistTrack(
  track: MusicTrack,
  index: number,
  fadeDuration: number,
): void {
  if (!ctx || !masterMusicGain) return;

  const playlist = MUSIC_PLAYLISTS[track];
  const safeIndex = index % playlist.length;
  const path = playlist[safeIndex];

  loadMusicBuffer(path).then((buffer) => {
    if (!buffer || !ctx || !masterMusicGain) return;

    // If the active track category changed while we were loading, abort
    if (currentMusic && currentMusic.track !== track) return;

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = false; // Don't loop individual tracks — advance to next

    const trackGain = ctx.createGain();
    trackGain.gain.setValueAtTime(0, ctx.currentTime);
    trackGain.gain.linearRampToValueAtTime(1, ctx.currentTime + fadeDuration);

    source.connect(trackGain);
    trackGain.connect(masterMusicGain!);
    source.start();

    currentMusic = { track, source, gain: trackGain, playlistIndex: safeIndex };

    // When this track ends naturally, advance to the next one (no crossfade gap)
    source.onended = () => {
      // Only advance if we're still the active source for this track category
      if (currentMusic?.source === source) {
        startPlaylistTrack(track, safeIndex + 1, 0.3);
      }
    };

    // Eagerly preload the next track so there's no loading gap
    const nextIndex = (safeIndex + 1) % playlist.length;
    loadMusicBuffer(playlist[nextIndex]);
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Initialize the audio system. Must be called from a user gesture (e.g. click)
 * to satisfy browser autoplay policies. Preloads SFX and voice buffers.
 * Music buffers are loaded lazily when first needed.
 */
export async function initAudio(): Promise<void> {
  try {
    if (ctx) {
      // Already initialised — just make sure it's running
      if (ctx.state === "suspended") await ctx.resume();
      return;
    }

    ctx = new AudioContext();
    await ctx.resume();

    // Create the master music gain bus
    masterMusicGain = ctx.createGain();
    masterMusicGain.gain.value = 0.4; // music sits at 40% volume
    masterMusicGain.connect(ctx.destination);

    // Kick off background preloads (don't await — let them load async)
    preloadSfx();
    preloadVoices();
  } catch {
    // Audio not supported — silently degrade
  }
}

/**
 * Play (or crossfade to) a music playlist. If the same playlist is already
 * playing this is a no-op. Crossfade duration is ~1.5s.
 *
 * Multiple tracks per playlist play sequentially, looping back to the first
 * when the last track finishes.
 */
export function playMusic(track: MusicTrack): void {
  try {
    if (!ctx || !masterMusicGain) return;

    // Same track category already playing — no-op
    if (currentMusic && currentMusic.track === track) return;

    const FADE_DURATION = 1.5;

    // Fade out the old track
    if (currentMusic) {
      const old = currentMusic;
      const now = ctx.currentTime;
      old.gain.gain.setValueAtTime(old.gain.gain.value, now);
      old.gain.gain.linearRampToValueAtTime(0, now + FADE_DURATION);
      const oldSource = old.source;
      // Disconnect onended so it doesn't try to advance after we stop it
      oldSource.onended = null;
      setTimeout(() => {
        try {
          oldSource.stop();
        } catch {
          /* already stopped */
        }
      }, FADE_DURATION * 1000 + 100);
    }

    // Clear current before starting new (startPlaylistTrack sets it)
    currentMusic = null;

    // Start the first track in the new playlist
    startPlaylistTrack(track, 0, FADE_DURATION);
  } catch {
    // Silent failure
  }
}

/**
 * Fade out and stop the current music playlist.
 */
export function stopMusic(fadeDuration = 1.0): void {
  try {
    if (!ctx || !currentMusic) return;

    const old = currentMusic;
    const now = ctx.currentTime;
    old.gain.gain.setValueAtTime(old.gain.gain.value, now);
    old.gain.gain.linearRampToValueAtTime(0, now + fadeDuration);

    const oldSource = old.source;
    // Disconnect onended so it doesn't advance to next track
    oldSource.onended = null;
    setTimeout(() => {
      try {
        oldSource.stop();
      } catch {
        /* already stopped */
      }
    }, fadeDuration * 1000 + 100);

    currentMusic = null;
  } catch {
    // Silent failure
  }
}

/**
 * Play a one-shot SFX. Supports overlapping — each call creates a fresh
 * AudioBufferSourceNode.
 */
export function playSfx(name: SfxName): void {
  try {
    if (!ctx) return;
    const buffer = sfxBuffers.get(name);
    if (!buffer) return;

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const gain = ctx.createGain();
    gain.gain.value = 0.6;
    source.connect(gain);
    gain.connect(ctx.destination);
    source.start();
  } catch {
    // Silent failure
  }
}

/**
 * Play a champion's name as a dramatic voice announcement. Stops any
 * currently playing voice clip first.
 */
export function playVoice(championId: number): void {
  try {
    if (!ctx) return;

    // Stop any currently playing voice
    if (currentVoice) {
      try {
        currentVoice.stop();
      } catch {
        /* already stopped */
      }
      currentVoice = null;
    }

    // Look up champion name
    let name: string;
    try {
      name = getChampion(championId).name.toLowerCase();
    } catch {
      return;
    }

    const buffer = voiceBuffers.get(name);
    if (!buffer) return;

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const gain = ctx.createGain();
    gain.gain.value = 0.8;
    source.connect(gain);
    gain.connect(ctx.destination);
    source.start();

    currentVoice = source;
    source.onended = () => {
      if (currentVoice === source) currentVoice = null;
    };
  } catch {
    // Silent failure
  }
}
