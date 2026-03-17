// src/world/BoarSystem.js
// Boar AI + probes (WORLD helper).
//
// Responsibilities:
// - Create boar Group configuration (tile='b', anis wiring)
// - Initialize boars spawned by Tiles() (one-time _lvlInit)
// - Maintain probes (front/foot/ground)
// - Implement patrol/turn/knock/death behaviors
// - Provide restart helpers (clear + rebuild from cached spawns)
//
// Non-goals:
// - Does NOT handle player input or HUD
// - Does NOT load assets (AssetLoader does)

export function buildBoarGroup(level) {
  const tiles = level.levelData?.tiles ?? level.tilesCfg ?? {};
  const frameW = Number(tiles.frameW) || 32;
  const frameH = Number(tiles.frameH) || 32;

  level.boar = new Group();
  level.boar.physics = "dynamic";
  level.boar.tile = "b";

  // IMPORTANT:
  // Some p5play builds treat anis.w / anis.h as getter-only.
  // So we NEVER assume those assignments are safe.
  const hasDefs = !!(
    level.assets?.boarAnis && typeof level.assets.boarAnis === "object"
  );

  if (hasDefs) {
    // Wire the sheet + anis defs on the GROUP (nice default for Tiles-spawned boars),
    // but do it safely.
    safeAssignSpriteSheet(level.boar, level.assets.boarImg);
    safeConfigureAniSheet(level.boar, frameW, frameH, -8);

    try {
      level.boar.addAnis(level.assets.boarAnis);
    } catch (err) {
      console.warn(
        "[BoarSystem] group.addAnis failed; boars may be static:",
        err,
      );
      level.boar.img = level.assets.boarImg;
    }
  } else {
    // static fallback
    level.boar.img = level.assets.boarImg;
  }
}

function ensureBoarAnis(level, e) {
  const defs = level.assets?.boarAnis;
  if (!defs || typeof defs !== "object") return;

  // If key anis exist, leave it alone.
  const hasDeath = !!(e.anis && e.anis.death);
  const hasThrow = !!(e.anis && e.anis.throwPose);
  const hasRun = !!(e.anis && e.anis.run);
  if (hasDeath && hasThrow && hasRun) return;

  const tiles = level.levelData?.tiles ?? level.tilesCfg ?? {};
  const frameW = Number(tiles.frameW) || 32;
  const frameH = Number(tiles.frameH) || 32;

  safeAssignSpriteSheet(e, level.assets.boarImg);
  safeConfigureAniSheet(e, frameW, frameH, -8);

  try {
    e.addAnis(defs);
  } catch (err) {
    // If addAnis fails, fall back to static image so the game doesn't crash.
    console.warn("[BoarSystem] sprite.addAnis failed; using static img:", err);
    e.img = level.assets.boarImg;
  }
}

// ---------------------------------------------------------------------------
// p5play v3 compatibility helpers
// ---------------------------------------------------------------------------

// Read size without assuming w/h are writable.
function boarWidth(e, fallbackW) {
  const v = e?.width ?? e?.w ?? fallbackW;
  return Number(v) || Number(fallbackW) || 18;
}

function boarHeight(e, fallbackH) {
  const v = e?.height ?? e?.h ?? fallbackH;
  return Number(v) || Number(fallbackH) || 12;
}

// Tiles() may spawn boars at tile-sized colliders.
// Some builds crash if you try to assign e.w/e.h.
// Instead: if size looks wrong, REPLACE the sprite using new Sprite(x,y,w,h).
function needsColliderReplace(e, desiredW, desiredH) {
  const w = boarWidth(e, desiredW);
  const h = boarHeight(e, desiredH);
  // Tiny tolerance
  return Math.abs(w - desiredW) > 0.25 || Math.abs(h - desiredH) > 0.25;
}

// Copy minimal state from a Tiles()-spawned boar into a correctly-sized sprite.
function replaceBoarSprite(level, oldBoar, desiredW, desiredH) {
  const s = new Sprite(oldBoar.x, oldBoar.y, desiredW, desiredH);

  // Preserve direction if present
  s.dir = oldBoar.dir;

  // Preserve any per-sprite fields Tiles() might have set
  // (and anything Level/TileBuilder might have attached)
  // We only copy what we rely on.
  s._lvlInit = false;

  // Remove the old sprite from the world + group safely
  oldBoar.footProbe?.remove?.();
  oldBoar.frontProbe?.remove?.();
  oldBoar.groundProbe?.remove?.();
  oldBoar.remove?.();

  // Add new sprite to the boar group
  level.boar.add(s);

  return s;
}

function safeAssignSpriteSheet(target, img) {
  if (!img || !target) return;
  try {
    target.spriteSheet = img;
  } catch (err) {
    // ignore
  }
}

function safeConfigureAniSheet(target, frameW, frameH, offsetY) {
  if (!target) return;
  try {
    if (!target.anis) return;
    // These setters can throw in some builds; wrap each.
    try {
      target.anis.w = frameW;
    } catch (e) {}
    try {
      target.anis.h = frameH;
    } catch (e) {}
    try {
      if (target.anis.offset) target.anis.offset.y = offsetY;
    } catch (e) {}
  } catch (err) {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// Public helpers used by Level
// ---------------------------------------------------------------------------

export function hookBoarSolids(level) {
  if (!level.boar) return;
  if (level.ground) level.boar.collides(level.ground);
  if (level.groundDeep) level.boar.collides(level.groundDeep);
  if (level.platformsL) level.boar.collides(level.platformsL);
  if (level.platformsR) level.boar.collides(level.platformsR);
  if (level.wallsL) level.boar.collides(level.wallsL);
  if (level.wallsR) level.boar.collides(level.wallsR);
}

export function cacheBoarSpawns(level) {
  level.boarSpawns = [];
  if (!level.boar) return;
  for (const e of level.boar) {
    level.boarSpawns.push({ x: e.x, y: e.y, dir: e.dir });
  }
}

export function clearBoars(level) {
  if (!level.boar) return;
  for (const e of level.boar) {
    e.footProbe?.remove?.();
    e.frontProbe?.remove?.();
    e.groundProbe?.remove?.();
    e.remove?.();
  }
}

export function rebuildBoarsFromSpawns(level) {
  // Recreate the group itself
  buildBoarGroup(level);

  const tiles = level.levelData?.tiles ?? level.tilesCfg ?? {};
  const frameW = Number(tiles.frameW) || 32;
  const frameH = Number(tiles.frameH) || 32;

  const boarW = Number(level.tuning.boar?.collider?.w ?? 18);
  const boarH = Number(level.tuning.boar?.collider?.h ?? 12);
  const boarHP = Number(level.tuning.boar?.stats?.hp ?? 3);

  for (const s of level.boarSpawns) {
    // Create with desired collider size (most reliable across builds)
    const e = new Sprite(s.x, s.y, boarW, boarH);

    // Sheet/anis (safe)
    const hasDefs =
      level.assets?.boarAnis && typeof level.assets.boarAnis === "object";
    if (hasDefs) {
      safeAssignSpriteSheet(e, level.assets.boarImg);
      safeConfigureAniSheet(e, frameW, frameH, -8);
      try {
        e.addAnis(level.assets.boarAnis);
      } catch (err) {
        e.img = level.assets.boarImg;
      }
    } else {
      e.img = level.assets.boarImg;
    }

    // Init like Tiles() boars
    e.rotationLock = true;
    e.physics = "dynamic";
    e.friction = 0;
    e.bounciness = 0;
    e.hp = boarHP;

    attachBoarProbes(level, e);

    e.dir = s.dir === 1 || s.dir === -1 ? s.dir : random([-1, 1]);
    fixSpawnEdgeCase(level, e);

    e.wasDanger = false;
    e.flashTimer = 0;
    e.knockTimer = 0;
    e.turnTimer = 0;

    e.dead = false;
    e.dying = false;
    e.deathStarted = false;
    e.deathFrameTimer = 0;

    e.vanishTimer = 0;
    e.holdX = e.x;
    e.holdY = e.y;

    e.mirror.x = e.dir === -1;

    wireOneBoarPhysics(level, e);
    wireOneBoarPlayerCollision(level, e);

    level._setAniSafe?.(e, "run");
    level.boar.add(e);
  }
}

// ---------------------------------------------------------------------------
// Boar AI update
// ---------------------------------------------------------------------------

export function updateBoars(level) {
  if (!level.boar) return;

  if (level.won) {
    for (const e of level.boar) e.vel.x = 0;
    return;
  }

  const tiles = level.levelData?.tiles ?? level.tilesCfg ?? {};
  const frameW = Number(tiles.frameW) || 32;
  const frameH = Number(tiles.frameH) || 32;

  const boarSpeed = Number(level.tuning.boar?.move?.speed ?? 0.6);
  const boarW = Number(level.tuning.boar?.collider?.w ?? 18);
  const boarH = Number(level.tuning.boar?.collider?.h ?? 12);
  const boarHP = Number(level.tuning.boar?.stats?.hp ?? 3);

  const hasAnis =
    level.assets?.boarAnis && typeof level.assets.boarAnis === "object";

  // IMPORTANT:
  // We iterate over a snapshot so replacing/removing boars won't break the loop.
  const boarsSnapshot = [...level.boar];

  for (const old of boarsSnapshot) {
    let e = old;

    // -----------------------------
    // One-time init for Tiles() boars
    // -----------------------------
    if (e._lvlInit !== true) {
      // If this sprite's collider is tile-sized, replace it safely.
      if (needsColliderReplace(e, boarW, boarH)) {
        e = replaceBoarSprite(level, e, boarW, boarH);
      }

      e._lvlInit = true;

      e.physics = "dynamic";
      e.rotationLock = true;

      e.friction = 0;
      e.bounciness = 0;

      e.hp = e.hp ?? boarHP;

      // Make sure *this sprite* has anis, not just the group.
      if (hasAnis) {
        safeAssignSpriteSheet(e, level.assets.boarImg);
        safeConfigureAniSheet(e, frameW, frameH, -8);

        // add defs (safe)
        try {
          // only attempt if missing something obvious
          if (!e.anis || !e.anis.run) e.addAnis(level.assets.boarAnis);
        } catch (err) {
          // ignore; ensureBoarAnis will also try
        }
        ensureBoarAnis(level, e);
      } else {
        e.img = level.assets.boarImg;
      }

      attachBoarProbes(level, e);
      wireOneBoarPhysics(level, e);
      wireOneBoarPlayerCollision(level, e);

      e.dir = e.dir === 1 || e.dir === -1 ? e.dir : random([-1, 1]);
      fixSpawnEdgeCase(level, e);

      e.wasDanger = false;

      e.flashTimer = 0;
      e.knockTimer = 0;
      e.turnTimer = 0;

      e.dead = false;
      e.dying = false;
      e.deathStarted = false;
      e.deathFrameTimer = 0;

      e.vanishTimer = 0;
      e.holdX = e.x;
      e.holdY = e.y;

      e.mirror.x = e.dir === -1;

      // start in run pose
      level._setAniSafe?.(e, "run");
    }

    // -----------------------------
    // Fire fail-safe
    // Some runtime replacement paths can make overlap callbacks unreliable.
    // Enforce fire death directly in the update loop.
    // -----------------------------
    if (!e.dead && !e.dying && boarTouchesFire(level, e)) {
      e.hp = 0;
      e.dying = true;
      e.knockTimer = 0;
      e.vel.x = 0;
      e.collider = "none";
      e.removeColliders();
      level._setAniFrame0Safe?.(e, "throwPose");
    }

    // -----------------------------
    // Probes + timers
    // -----------------------------
    updateBoarProbes(level, e);
    updateGroundProbe(level, e, boarH);

    if (e.flashTimer > 0) e.flashTimer--;
    if (e.knockTimer > 0) e.knockTimer--;
    if (e.turnTimer > 0) e.turnTimer--;

    e.tint = e.flashTimer > 0 ? "#ff5050" : "#ffffff";

    const grounded = boarGrounded(level, e);

    // -----------------------------
    // Death state machine (monolith-matching)
    // -----------------------------
    if (!e.dead && e.dying && grounded) {
      e.dead = true;
      e.deathStarted = false;
    }

    if (e.dying && !e.dead) {
      e.vel.x = 0;
      level._setAniFrame0Safe?.(e, "throwPose");
      continue;
    }

    if (e.dead && !e.deathStarted) {
      e.deathStarted = true;

      e.holdX = e.x;
      e.holdY = e.y;

      e.vel.x = 0;
      e.vel.y = 0;

      e.collider = "none";
      e.removeColliders();

      e.x = e.holdX;
      e.y = e.holdY;

      level._setAniFrame0Safe?.(e, "death");

      e.deathFrameTimer = 0;
      e.vanishTimer = 24;
      e.visible = true;
    }

    if (e.dead) {
      e.x = e.holdX;
      e.y = e.holdY;

      const deathDef = level.assets?.boarAnis?.death;
      const frames = Number(deathDef?.frames ?? 1);
      const delayFrames = Number(deathDef?.frameDelay ?? 6);
      const msPerFrame = (delayFrames * 1000) / 60;

      e.deathFrameTimer += deltaTime;
      const f = Math.floor(e.deathFrameTimer / msPerFrame);

      if (e.ani) e.ani.frame = Math.min(frames - 1, f);

      if (f >= frames - 1) {
        if (e.vanishTimer > 0) {
          e.visible = Math.floor(e.vanishTimer / 3) % 2 === 0;
          e.vanishTimer--;
        } else {
          e.footProbe?.remove?.();
          e.frontProbe?.remove?.();
          e.groundProbe?.remove?.();
          e.remove?.();
        }
      }
      continue;
    }

    // -----------------------------
    // Control states
    // -----------------------------
    if (e.knockTimer > 0) {
      level._setAniFrame0Safe?.(e, "throwPose");
      continue;
    }

    if (!grounded) {
      level._setAniFrame0Safe?.(e, "throwPose");
      continue;
    }

    if (e.dir !== 1 && e.dir !== -1) e.dir = random([-1, 1]);

    const halfW = boarWidth(e, boarW) / 2;

    if (e.x < halfW) turnBoar(level, e, 1);
    if (e.x > level.bounds.levelW - halfW) turnBoar(level, e, -1);

    // Multi-point ground detection: check 3 positions ahead
    const noGroundAhead = !multiPointGroundDetection(level, e, boarW);
    const frontProbeOverlapsFire = e.frontProbe.overlapping(level.fire);
    const fireAheadBounds = fireAheadByBounds(level, e, boarW, boarH);
    const fireBodyDetection = boarTouchesFire(level, e);
    const frontHitsFire =
      frontProbeOverlapsFire || fireAheadBounds || fireBodyDetection;
    const frontHitsWall = frontProbeHitsWall(level, e);
    const headSeesFire = e.footProbe.overlapping(level.fire);

    // Immediate turn if currently IN fire or in immediate danger
    if (!e.dead && !e.dying && fireBodyDetection) {
      turnBoar(level, e, -e.dir);
      updateBoarProbes(level, e);
    }

    const dangerNow =
      noGroundAhead || frontHitsFire || frontHitsWall || headSeesFire;
    const blockedNow = Math.abs(e.vel.x ?? 0) < 0.01;

    // Check if enemy is stuck between hazards (both directions have danger)
    const leftProbeDir = -1;
    const rightProbeDir = 1;
    const checkBothDirs = () => {
      const oldDir = e.dir;

      // Check right direction
      e.dir = rightProbeDir;
      updateBoarProbes(level, e);
      const rightHasFire =
        level.fire &&
        level.fire.length > 0 &&
        (e.frontProbe.overlapping(level.fire) ||
          fireAheadByBounds(level, e, boarW, boarH));
      const rightNoGround = !multiPointGroundDetection(level, e, boarW);

      // Check left direction
      e.dir = leftProbeDir;
      updateBoarProbes(level, e);
      const leftHasFire =
        level.fire &&
        level.fire.length > 0 &&
        (e.frontProbe.overlapping(level.fire) ||
          fireAheadByBounds(level, e, boarW, boarH));
      const leftNoGround = !multiPointGroundDetection(level, e, boarW);

      e.dir = oldDir;
      updateBoarProbes(level, e);

      const bothDangerRight = rightHasFire || rightNoGround;
      const bothDangerLeft = leftHasFire || leftNoGround;
      return bothDangerRight && bothDangerLeft;
    };

    const stuckBetweenHazards = blockedNow && dangerNow && checkBothDirs();

    // If truly stuck, force a turn and push harder
    if (stuckBetweenHazards && e.turnTimer === 0) {
      turnBoar(level, e, -e.dir);
      e.x += e.dir * 4; // Push harder when stuck
      updateBoarProbes(level, e);
      continue;
    }

    // DEBUG: Comprehensive debug for bottommost platform
    const isBottommost = e.y > 200;
    if (isBottommost) {
      if (!frontHitsFire && level.fire && level.fire.length > 0) {
        const touchesFire = boarTouchesFire(level, e);
        console.log(
          `[BOAR FIRE] y=${e.y.toFixed(0)} dir=${e.dir} probe=${frontProbeOverlapsFire} bounds=${fireAheadBounds}%s touches=${touchesFire}`,
        );
      }
      if (frontHitsWall) {
        console.log(
          `[BOAR WALL] y=${e.y.toFixed(0)} dir=${e.dir} HIT DETECTED - turning`,
        );
      }
      if (
        !frontHitsWall &&
        (level.wallsL?.length > 0 || level.wallsR?.length > 0)
      ) {
        console.log(
          `[BOAR WALL] y=${e.y.toFixed(0)} dir=${e.dir} NO DETECTION - nearby walls at:`,
        );
        for (const wall of level.wallsL || []) {
          const dx = Math.abs(e.x - wall.x);
          if (dx < 40)
            console.log(
              `  LEFT at (${wall.x.toFixed(0)}, ${wall.y.toFixed(0)})`,
            );
        }
        for (const wall of level.wallsR || []) {
          const dx = Math.abs(e.x - wall.x);
          if (dx < 40)
            console.log(
              `  RIGHT at (${wall.x.toFixed(0)}, ${wall.y.toFixed(0)})`,
            );
        }
      }
    }

    if (e.turnTimer === 0 && shouldTurnNow(e, dangerNow, blockedNow)) {
      turnBoar(level, e, -e.dir);
      updateBoarProbes(level, e);
      continue;
    }

    // patrol
    e.vel.x = e.dir * boarSpeed;
    e.mirror.x = e.dir === -1;

    // Extra safety: don't let "run" override terminal states
    if (!e.dead && !e.dying) level._setAniSafe?.(e, "run");
  }

  // Post-loop: per-frame player damage check (fallback if collision callbacks miss)
  // This ensures player gets hurt even if callback-based collision detection fails
  if (level.playerCtrl?.sprite && level.boar) {
    const playerSprite = level.playerCtrl.sprite;
    const playerHalfW = (playerSprite?.width ?? playerSprite?.w ?? 18) / 2;
    const playerHalfH = (playerSprite?.height ?? playerSprite?.h ?? 12) / 2;

    for (const boar of level.boar) {
      if (boar.dead || boar.dying) continue;

      const boarHalfW = boarWidth(boar, 18) / 2;
      const boarHalfH = boarHeight(boar, 12) / 2;

      const overlapX =
        Math.abs((playerSprite.x ?? 0) - (boar.x ?? 0)) <=
        playerHalfW + boarHalfW;
      const overlapY =
        Math.abs((playerSprite.y ?? 0) - (boar.y ?? 0)) <=
        playerHalfH + boarHalfH;

      if (overlapX && overlapY) {
        level.playerCtrl?.damageFromX?.(boar.x);
      }
    }
  }
}

// -----------------------
// probes + movement helpers
// -----------------------

function placeProbe(probe, x, y) {
  probe.x = x;
  probe.y = y;
}

function wireOneBoarPhysics(level, e) {
  if (!e) return;

  if (level.ground) e.collides(level.ground);
  if (level.groundDeep) e.collides(level.groundDeep);
  if (level.platformsL) e.collides(level.platformsL);
  if (level.platformsR) e.collides(level.platformsR);
  if (level.wallsL) e.collides(level.wallsL);
  if (level.wallsR) e.collides(level.wallsR);

  if (level.fire) {
    e.overlaps(level.fire, () => {
      if (e.dead || e.dying) return;
      e.hp = 0;
      e.dying = true;
      e.knockTimer = 0;
      e.vel.x = 0;
    });
  }
}

function wireOneBoarPlayerCollision(level, e) {
  const playerSprite = level.playerCtrl?.sprite;
  if (!e || !playerSprite) return;

  e.collides(playerSprite, () => {
    if (e.dead || e.dying) return;
    level.playerCtrl?.damageFromX?.(e.x);
  });
}

export function attachBoarProbes(level, e) {
  const size = Number(level.tuning.boar?.probes?.size ?? 4);

  // Helper: sensor sprite that still has a collider
  const makeProbe = () => {
    const p = new Sprite(-9999, -9999, size, size);

    // IMPORTANT:
    // sensor=true means "detect overlaps but don't push"
    // collider must NOT be "none" or overlaps often won't work
    p.sensor = true;
    p.collider = "dynamic"; // keep a collider so overlapping() works
    p.mass = 0.0001; // effectively weightless
    p.rotationLock = true;

    p.visible = false;
    p.layer = 999;

    // reduce physics side effects
    p.friction = 0;
    p.bounciness = 0;

    return p;
  };

  e.footProbe = makeProbe();
  e.frontProbe = makeProbe();
  e.groundProbe = makeProbe();
}

function updateBoarProbes(level, e) {
  const forward = Number(level.tuning.boar?.probes?.forward ?? 10);
  const frontY = Number(level.tuning.boar?.probes?.frontY ?? 0);
  const headY = Number(level.tuning.boar?.probes?.headY ?? 0);

  const forwardX = e.x + e.dir * forward;
  placeProbe(e.frontProbe, forwardX, e.y + frontY);
  placeProbe(e.footProbe, forwardX, e.y - headY);
}

function updateGroundProbe(level, e, fallbackH) {
  const h = boarHeight(
    e,
    Number(fallbackH ?? level.tuning.boar?.collider?.h ?? 12),
  );
  placeProbe(e.groundProbe, e.x, e.y + h / 2 + 4);
}

function frontProbeHasGroundAhead(level, e) {
  const p = e.frontProbe;
  return (
    p.overlapping(level.ground) ||
    p.overlapping(level.groundDeep) ||
    p.overlapping(level.platformsL) ||
    p.overlapping(level.platformsR)
  );
}

function multiPointGroundDetection(level, e, fallbackW) {
  // Check ground at 3 horizontal points ahead: left, center, right of the boar
  // This catches platform edges that a single probe might miss
  if (!e) return true;

  const forward = Number(level.tuning.boar?.probes?.forward ?? 10);
  const footY = Math.max(0, (e.y ?? 0) + 4); // Slightly below boar center
  const halfW = boarWidth(e, fallbackW) / 2;

  // Check 3 points: left edge, center, right edge of boar width ahead
  const checkPoints = [
    (e.x ?? 0) + (e.dir ?? 1) * forward - halfW, // left edge
    (e.x ?? 0) + (e.dir ?? 1) * forward, // center
    (e.x ?? 0) + (e.dir ?? 1) * forward + halfW, // right edge
  ];

  // Create temporary test sprite to check ground at these points
  for (const checkX of checkPoints) {
    // Check if there's ground at this position by testing overlap
    const hasGround =
      testPointOverlapsGround(level, checkX, footY) ||
      testPointOverlapsGround(level, checkX, footY + 4) ||
      testPointOverlapsGround(level, checkX, footY + 8);

    if (!hasGround) {
      // At least one point has no ground ahead = hazard
      return false;
    }
  }

  return true;
}

function testPointOverlapsGround(level, x, y) {
  // Test if a point at (x, y) overlaps with any ground group
  // We do this by checking if the point is within any ground sprite's bounds
  for (const group of [
    level.ground,
    level.groundDeep,
    level.platformsL,
    level.platformsR,
  ]) {
    if (!group) continue;
    for (const sprite of group) {
      if (!sprite || sprite?.visible === false) continue;
      const halfW = spriteHalfW(sprite, 12);
      const halfH = spriteHalfH(sprite, 12);
      const overlapX = Math.abs(x - (sprite.x ?? 0)) <= halfW + 2;
      const overlapY = Math.abs(y - (sprite.y ?? 0)) <= halfH + 2;
      if (overlapX && overlapY) return true;
    }
  }
  return false;
}

function frontProbeHitsWall(level, e) {
  const p = e.frontProbe;
  const probeHits = p.overlapping(level.wallsL) || p.overlapping(level.wallsR);

  // Geometry-based fallback if probe fails
  if (!probeHits) {
    return wallAheadByBounds(level, e);
  }

  return probeHits;
}

function wallAheadByBounds(level, e) {
  if (!e) return false;

  const forward = Number(level.tuning.boar?.probes?.forward ?? 10);
  const probeSize = Number(level.tuning.boar?.probes?.size ?? 4);
  const frontY = Number(level.tuning.boar?.probes?.frontY ?? 0);

  const probeX = (e.x ?? 0) + (e.dir ?? 1) * forward;
  const probeY = (e.y ?? 0) + frontY;
  const pHalf = probeSize / 2;

  // Check both wall groups
  for (const walls of [level.wallsL, level.wallsR]) {
    if (!walls) continue;
    for (const wall of walls) {
      if (wall?.active === false || wall?.visible === false) continue;

      const wHalfW = spriteHalfW(wall, 12);
      const wHalfH = spriteHalfH(wall, 24);

      const overlapX = Math.abs(probeX - (wall.x ?? 0)) <= pHalf + wHalfW;
      const overlapY = Math.abs(probeY - (wall.y ?? 0)) <= pHalf + wHalfH;
      if (overlapX && overlapY) return true;
    }
  }

  return false;
}

function boarGrounded(level, e) {
  const p = e.groundProbe;
  return (
    p.overlapping(level.ground) ||
    p.overlapping(level.groundDeep) ||
    p.overlapping(level.platformsL) ||
    p.overlapping(level.platformsR)
  );
}

function boarTouchesFire(level, e) {
  if (!level.fire || !e) return false;

  const bodyTouchesViaPhysics =
    typeof e.overlapping === "function" ? e.overlapping(level.fire) : false;
  if (bodyTouchesViaPhysics) return true;

  const eHalfW = boarWidth(e, 18) / 2;
  const eHalfH = boarHeight(e, 12) / 2;

  for (const fire of level.fire) {
    if (fire?.active === false || fire?.visible === false) continue;

    const fHalfW = spriteHalfW(fire, 18);
    const fHalfH = spriteHalfH(fire, 16);

    const overlapX = Math.abs((e.x ?? 0) - (fire.x ?? 0)) <= eHalfW + fHalfW;
    const overlapY = Math.abs((e.y ?? 0) - (fire.y ?? 0)) <= eHalfH + fHalfH;
    if (overlapX && overlapY) return true;
  }

  return false;
}

function fireAheadByBounds(level, e, fallbackW, fallbackH) {
  if (!level.fire || !e) return false;

  const forward = Number(level.tuning.boar?.probes?.forward ?? 10);
  const frontY = Number(level.tuning.boar?.probes?.frontY ?? 0);
  const probeSize = Number(level.tuning.boar?.probes?.size ?? 4);

  const probeX = (e.x ?? 0) + (e.dir ?? 1) * forward;
  const probeY = (e.y ?? 0) + frontY;
  const pHalf = probeSize / 2;

  for (const fire of level.fire) {
    if (fire?.active === false || fire?.visible === false) continue;

    const fHalfW = spriteHalfW(fire, 18);
    const fHalfH = spriteHalfH(fire, 16);

    const overlapX = Math.abs(probeX - (fire.x ?? 0)) <= pHalf + fHalfW;
    const overlapY = Math.abs(probeY - (fire.y ?? 0)) <= pHalf + fHalfH;
    if (overlapX && overlapY) return true;
  }

  return false;
}

function spriteHalfW(sprite, fallback = 18) {
  const w = Number(sprite?.width ?? sprite?.w ?? fallback) || fallback;
  return w / 2;
}

function spriteHalfH(sprite, fallback = 16) {
  const h = Number(sprite?.height ?? sprite?.h ?? fallback) || fallback;
  return h / 2;
}

function shouldTurnNow(e, dangerNow, blockedNow = false) {
  // Turn on rising edge of danger (when we newly detect danger)
  const risingEdge = dangerNow && !e.wasDanger;
  // Also turn if blocked and in danger (stuck against obstacle)
  const stuckInDanger = dangerNow && blockedNow;
  // Note: wasDanger is updated at END of frame, so we don't reset it here
  e.wasDanger = dangerNow;
  return risingEdge || stuckInDanger;
}

function turnBoar(level, e, newDir) {
  const cooldown = Number(level.tuning.boar?.turning?.turnCooldownFrames ?? 6);
  if (e.turnTimer > 0) return;

  e.dir = newDir;
  e.turnTimer = cooldown;
  e.x += e.dir * 2;
  e.vel.x = 0;
}

function groundAheadForDir(level, e, dir) {
  const old = e.dir;
  e.dir = dir;
  updateBoarProbes(level, e);

  const ok =
    e.frontProbe.overlapping(level.ground) ||
    e.frontProbe.overlapping(level.groundDeep) ||
    e.frontProbe.overlapping(level.platformsL) ||
    e.frontProbe.overlapping(level.platformsR);

  e.dir = old;
  return ok;
}

function fixSpawnEdgeCase(level, e) {
  const leftOk = groundAheadForDir(level, e, -1);
  const rightOk = groundAheadForDir(level, e, 1);

  if (leftOk && !rightOk) e.dir = -1;
  else if (rightOk && !leftOk) e.dir = 1;

  updateBoarProbes(level, e);
  e.vel.x = 0;
  e.turnTimer = 0;
  e.wasDanger = false;
}
