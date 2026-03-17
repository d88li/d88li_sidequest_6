// src/ParallaxBackground.js
// Parallax background renderer (VIEW layer).
//
// Responsibilities:
// - Draw repeating background layers in screen-space (camera.off())
// - Offset layers based on camera.x using per-layer factor
// - Support multiple depth layers for a sense of movement
//
// Non-goals:
// - Does NOT modify camera position or world state
// - Does NOT load images (main.js preload does)
// - Does NOT interact with physics/entities
//
// Architectural notes:
// - main.js owns parallax construction using level.view.parallax from levels.json.
// - This stays VIEW-only so it can be swapped or removed without touching gameplay.

export class ParallaxBackground {
  /**
   * @param {Object} layers
   * Example:
   * [
   *   { img: bgFar, factor: 0.2 },
   *   { img: bgMid, factor: 0.5 },
   *   { img: bgFore, factor: 0.8 }
   * ]
   */
  constructor(layers = []) {
    this.layers = layers;
  }

  draw({ cameraX, viewW, viewH }) {
    camera.off();
    drawingContext.imageSmoothingEnabled = false;
    imageMode(CORNER);

    for (const layer of this.layers) {
      const { img, factor = 1 } = layer;
      if (!img) continue;

      const offsetX = -cameraX * factor;

      // Scale image to fit viewport height, maintaining aspect ratio
      const sourceW = img.width;
      const sourceH = img.height;
      const displayH = viewH;
      const displayW = (sourceW / sourceH) * displayH; // Maintain aspect ratio

      // Calculate tile-aligned start position
      const alignedStart = Math.floor(offsetX / displayW) * displayW;
      // Preserve the fractional offset for smooth scrolling
      const fractionalOffset = offsetX - alignedStart;

      // Draw tiles, starting one tile before the visible area to avoid gaps
      for (
        let x = alignedStart + fractionalOffset - displayW;
        x < viewW + displayW;
        x += displayW
      ) {
        image(img, x, 0, displayW, displayH);
      }
    }

    camera.on();
  }
}
