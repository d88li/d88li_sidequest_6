// src/SoundManager.js
// Audio playback (SYSTEM layer).
//
// Responsibilities:
// - Load sound assets during preload() (via loadSound)
// - Play sounds by key (SFX/music)
// - Provide a simple abstraction so gameplay code never touches audio directly
//
// Non-goals:
// - Does NOT subscribe to EventBus directly (Game wires events → play())
// - Does NOT decide when events happen (WORLD logic emits events)
// - Does NOT manage UI
//
// Architectural notes:
// - Game connects EventBus events (leaf:collected, player:damaged, etc.) to SoundManager.play().
// - This keeps audio concerns isolated from gameplay and supports easy swapping/muting.

export class SoundManager {
  constructor() {
    this.sfx = {};
    this.music = null;
  }

  load(name, path) {
    try {
      this.sfx[name] = loadSound(path);
    } catch (e) {
      console.warn(`Failed to load sound "${name}":`, e);
      this.sfx[name] = null;
    }
  }

  loadMusic(name, path) {
    try {
      this.sfx[name] = loadSound(path);
    } catch (e) {
      console.warn(`Failed to load music "${name}":`, e);
      this.sfx[name] = null;
    }
  }

  play(name) {
    try {
      const sound = this.sfx[name];
      if (sound && typeof sound.play === "function") {
        sound.play();
      }
    } catch (e) {
      console.warn(`Failed to play sound "${name}":`, e);
    }
  }

  playMusic(name) {
    try {
      // Stop current music if any
      if (
        this.music &&
        typeof this.music.isPlaying === "function" &&
        this.music.isPlaying?.()
      ) {
        this.music.stop();
      }

      const sound = this.sfx[name];
      if (sound && typeof sound.loop === "function") {
        sound.loop();
        this.music = sound;
      }
    } catch (e) {
      console.warn(`Failed to play music "${name}":`, e);
    }
  }

  stopMusic() {
    try {
      if (
        this.music &&
        typeof this.music.isPlaying === "function" &&
        this.music.isPlaying?.()
      ) {
        this.music.stop();
      }
      this.music = null;
    } catch (e) {
      console.warn("Failed to stop music:", e);
    }
  }
}
