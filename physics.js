// ------------------------------------------------------------
// Physics world (Matter.js), Dual-Handed Physics & Object Behaviours
// ------------------------------------------------------------

const { Engine, Bodies, Body, Composite, Vertices } = Matter;

// Safe fallbacks in case config.js or geometry.js is cached
if (typeof window.LABEL_SHOW_MS === "undefined") window.LABEL_SHOW_MS = 3200;
if (typeof window.showLabels === "undefined") window.showLabels = true;

if (typeof window.makeCirclePoints !== "function") {
  window.makeCirclePoints = function (center, radius, count = 32) {
    const pts = [];
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      pts.push({ x: center.x + Math.cos(a) * radius, y: center.y + Math.sin(a) * radius });
    }
    return pts;
  };
}

// Tell Matter about poly-decomp so it can split concave (non-convex) shapes.
const concaveSupport = !!window.decomp;
if (concaveSupport && Matter.Common && Matter.Common.setDecomp) {
  Matter.Common.setDecomp(window.decomp);
}

const engine = Engine.create({ enableSleeping: true });
engine.gravity.x = 0;
engine.gravity.y = 1;
engine.positionIterations = 8;   // more solver passes = steadier stacking
engine.velocityIterations = 6;
const world = engine.world;

// Small isolated Matter.js world used by the landing-page physics preview.
window.createLandingPhysicsDemo = function (width, height) {
  const demoEngine = Engine.create();
  demoEngine.gravity.x = 0;
  demoEngine.gravity.y = 0.9;
  demoEngine.positionIterations = 6;
  demoEngine.velocityIterations = 4;

  let worldWidth = width;
  let worldHeight = height;
  let walls = [];
  const shapes = [];
  const sparks = [];
  const fixedStep = 1000 / 60;
  let accumulator = 0;

  function burstSparks(shape) {
    const center = shape.body.position;
    const count = 12 + Math.floor(Math.random() * 5);
    for (let i = 0; i < count; i += 1) {
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.35;
      const speed = 1.4 + Math.random() * 3.2;
      sparks.push({
        x: center.x,
        y: center.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        age: 0,
        life: 300 + Math.random() * 220,
        color: Math.random() < 0.28 ? "#ffe66d" : shape.color
      });
    }
  }

  function rebuildWalls() {
    Composite.remove(demoEngine.world, walls);
    walls = [
      Bodies.rectangle(worldWidth / 2, worldHeight + 14, worldWidth + 40, 28, { isStatic: true }),
      Bodies.rectangle(-14, worldHeight / 2, 28, worldHeight * 2, { isStatic: true }),
      Bodies.rectangle(worldWidth + 14, worldHeight / 2, 28, worldHeight * 2, { isStatic: true })
    ];
    Composite.add(demoEngine.world, walls);
  }

  rebuildWalls();

  function spawn() {
    const radius = 12 + Math.random() * 12;
    const x = radius + 8 + Math.random() * Math.max(1, worldWidth - radius * 2 - 16);
    const options = {
      restitution: 0.62,
      friction: 0.035,
      frictionAir: 0.002,
      density: 0.0015,
      render: { visible: false }
    };
    const kind = Math.floor(Math.random() * 4);
    let body;
    if (kind === 0) body = Bodies.circle(x, -radius, radius, options);
    else if (kind === 1) body = Bodies.rectangle(x, -radius, radius * 1.7, radius * 1.7, options);
    else body = Bodies.polygon(x, -radius, kind === 2 ? 3 : 5, radius * 1.25, options);

    const now = performance.now();
    const shape = {
      body: body,
      color: ["#ff777b", "#b99af5", "#62d5c1", "#f3c64e"][Math.floor(Math.random() * 4)],
      expiresAt: now + 4800,
      popAt: null,
      popDuration: 300,
      grabbing: false,
      grabbedAt: null
    };
    Composite.add(demoEngine.world, body);
    shapes.push(shape);
    if (shapes.length > 14) {
      Composite.remove(demoEngine.world, shapes.shift().body);
    }
  }

  function isActive(shape) {
    return shapes.includes(shape) && shape.popAt === null;
  }

  return {
    spawn: spawn,
    shapeAt: (x, y) => {
      const point = { x: x, y: y };
      for (let index = shapes.length - 1; index >= 0; index -= 1) {
        const shape = shapes[index];
        if (isActive(shape) && Vertices.contains(shape.body.vertices, point)) return shape;
      }
      return null;
    },
    moveShape: (shape, x, y) => {
      if (!isActive(shape)) return;
      Body.setPosition(shape.body, { x: x, y: y });
      Body.setVelocity(shape.body, { x: 0, y: 0 });
    },
    setGrabbed: (shape, grabbed) => {
      if (!isActive(shape) || shape.grabbing === grabbed) return;
      if (grabbed) {
        shape.grabbing = true;
        shape.grabbedAt = performance.now();
        return;
      }
      shape.expiresAt += performance.now() - shape.grabbedAt;
      shape.grabbedAt = null;
      shape.grabbing = false;
    },
    popShape: (shape) => {
      if (!isActive(shape)) return;
      shape.popAt = performance.now();
      burstSparks(shape);
    },
    resize: (nextWidth, nextHeight) => {
      worldWidth = nextWidth;
      worldHeight = nextHeight;
      rebuildWalls();
    },
    update: (deltaMs) => {
      accumulator += Math.min(deltaMs, 80);
      while (accumulator >= fixedStep) {
        Engine.update(demoEngine, fixedStep);
        accumulator -= fixedStep;
      }
      const now = performance.now();
      for (let i = shapes.length - 1; i >= 0; i--) {
        const shape = shapes[i];
        if (shape.popAt === null && !shape.grabbing && now >= shape.expiresAt) {
          shape.popAt = now;
          burstSparks(shape);
        }
        if (shape.popAt !== null && now >= shape.popAt + shape.popDuration) {
          Composite.remove(demoEngine.world, shapes[i].body);
          shapes.splice(i, 1);
        }
      }
      for (let i = sparks.length - 1; i >= 0; i -= 1) {
        const spark = sparks[i];
        spark.age += deltaMs;
        spark.x += spark.vx * (deltaMs / 16.67);
        spark.y += spark.vy * (deltaMs / 16.67);
        spark.vx *= 0.97;
        spark.vy = spark.vy * 0.97 + 0.035 * (deltaMs / 16.67);
        if (spark.age >= spark.life) sparks.splice(i, 1);
      }
    },
    draw: (context) => {
      const now = performance.now();
      for (const shape of shapes) {
        const popProgress = shape.popAt === null ? 0 : Math.max(0, Math.min(1, (now - shape.popAt) / shape.popDuration));
        const popScale = popProgress < 0.22
          ? 1 + (popProgress / 0.22) * 0.42
          : 1.42 - ((popProgress - 0.22) / 0.78) * 1.18;
        const vertices = shape.body.vertices;
        const center = shape.body.position;
        context.beginPath();
        vertices.forEach((vertex, index) => {
          const x = center.x + (vertex.x - center.x) * popScale;
          const y = center.y + (vertex.y - center.y) * popScale;
          if (index === 0) context.moveTo(x, y);
          else context.lineTo(x, y);
        });
        context.closePath();
        context.globalAlpha = 1 - popProgress;
        context.fillStyle = shape.color;
        context.fill();
        context.lineWidth = 2;
        context.strokeStyle = "#171717";
        context.stroke();
      }
      for (const spark of sparks) {
        const lifeProgress = Math.max(0, 1 - spark.age / spark.life);
        context.globalAlpha = lifeProgress;
        context.strokeStyle = spark.color;
        context.lineWidth = 2 + lifeProgress;
        context.shadowColor = spark.color;
        context.shadowBlur = 7 * lifeProgress;
        context.beginPath();
        context.moveTo(spark.x, spark.y);
        context.lineTo(spark.x - spark.vx * 3.5, spark.y - spark.vy * 3.5);
        context.stroke();
      }
      context.shadowBlur = 0;
      context.globalAlpha = 1;
    }
  };
};

const STEP_MS = 1000 / 60;       // physics always advances in equal 1/60 s steps
let accumulator = 0;
let lastFrameMs = performance.now();

let walls = [];
let objects = [];                // every drawn object
const selected = new Set();      // objects chosen for Reverse / Powers

const particles = [];
let MAX_PARTICLES = 360;
let mergeCooldownUntil = 0;
let mergeCandidate = null;
let mergeProgress = 0;
let demergeCandidate = null;
let demergeProgress = 0;
var scaleSession = null;
var shockwaves = [];

function spawnShockwave(x, y, hue = 280) {
  shockwaves.push({ x: x, y: y, r: 8, maxR: 200, hue: hue, alpha: 1, speed: 7.5 });
  setTimeout(() => {
    shockwaves.push({ x: x, y: y, r: 4, maxR: 150, hue: (hue + 45) % 360, alpha: 0.9, speed: 6 });
  }, 70);
}

function scaleObject(o, factor) {
  if (!o || !Number.isFinite(factor) || factor <= 0) return;
  const currentScale = o.scaleMultiplier || 1;
  const nextScale = Math.max(0.25, Math.min(4.5, currentScale * factor));
  factor = nextScale / currentScale;
  if (Math.abs(factor - 1) < 0.001) return;
  o.scaleMultiplier = nextScale;

  if (o.body) {
    Body.scale(o.body, factor, factor);
  } else if (o.bodies && o.raw) {
    const center = centroid(o.raw);
    for (const body of o.bodies) Body.scale(body, factor, factor, center);
  }

  const geometryArrays = o.subParts ? [o.lineLocal] : [o.local, o.polyLocal, o.lineLocal];
  for (const points of geometryArrays) {
    if (!points) continue;
    for (const point of points) {
      point.x *= factor;
      point.y *= factor;
    }
  }
  if (o.raw) {
    const center = centroid(o.raw);
    for (const point of o.raw) {
      point.x = center.x + (point.x - center.x) * factor;
      point.y = center.y + (point.y - center.y) * factor;
    }
  }
  if (o.subParts) {
    for (const part of o.subParts) {
      for (const points of [part.local, part.polyLocal]) {
        if (!points) continue;
        for (const point of points) {
          point.x *= factor;
          point.y *= factor;
        }
      }
    }
  }
  if (o.wellRadius) o.wellRadius *= factor;
  o.impactAt = performance.now();
  o.impactStrength = 0.09;
}

function checkDualHandScale() {
  const first = penVis || pen;
  const second = h2 && (h2.vis || h2.pen);
  const target = Array.from(selected).find((o) => objects.includes(o) && canEditObject(o));
  const bothPinching = pinching && h2 && h2.pinching;
  const overToolbar = typeof toolbarPanelAt === "function" &&
    (toolbarPanelAt(first) || toolbarPanelAt(second));
  const overTab = (first && tabAt(first)) || (second && tabAt(second));

  if (target && bothPinching && first && second && !overToolbar && !overTab) {
    const currentDistance = dist(first, second);
    if (!scaleSession || scaleSession.target !== target) {
      scaleSession = { target: target, prevDist: currentDistance };
      current = null;
      h2.current = null;
      grabCandidate = null;
      h2.grabCandidate = null;
    } else {
      const factor = currentDistance / (scaleSession.prevDist || currentDistance);
      scaleSession.prevDist = currentDistance;
      if (Math.abs(factor - 1) > 0.003) {
        scaleObject(target, factor);
        sendObjectMove(target);
      }
    }
  } else if (scaleSession) {
    showToast("Scale: " + Math.round((scaleSession.target.scaleMultiplier || 1) * 100) + "%");
    scaleSession = null;
  }
}

// ------------------------------------------------------------
// Collision Behaviours: Zigzag Springs, Star Bumpers, Diamonds & Sparks
// ------------------------------------------------------------
Matter.Events.on(engine, "collisionStart", (ev) => {
  const now = performance.now();
  const springs = new Map(), stars = new Map(), diamonds = new Map();
  const directBodies = new Map();
  for (let index = 0; index < objects.length; index++) {
    const object = objects[index];
    if (object.body) {
      const entries = directBodies.get(object.body);
      if (entries) entries.push(object);
      else directBodies.set(object.body, [object]);
    }
    if (object.kind !== "spring" && object.shapeType !== "Star" && object.shapeType !== "Diamond") continue;
    const entry = { object, index };
    for (const body of object.bodies) {
      if (object.kind === "spring" && !springs.has(body)) springs.set(body, entry);
      if (object.shapeType === "Star" && !stars.has(body)) stars.set(body, entry);
      if (object.shapeType === "Diamond" && !diamonds.has(body)) diamonds.set(body, entry);
    }
  }
  function firstMatch(lookup, a, b) {
    const first = lookup.get(a), second = lookup.get(b);
    return first && (!second || first.index <= second.index) ? first.object : second ? second.object : null;
  }
  for (const pair of ev.pairs) {
    const a = pair.bodyA.parent || pair.bodyA;
    const b = pair.bodyB.parent || pair.bodyB;
    const rel = Math.hypot(a.velocity.x - b.velocity.x, a.velocity.y - b.velocity.y);
    const sup = pair.collision.supports && pair.collision.supports[0];

    // 1. Zigzag Spring Behaviour: launches colliding dynamic objects upward
    const springObj = firstMatch(springs, a, b);
    if (springObj && springObj.body) {
      const other = springObj.bodies.includes(a) ? b : a;
      if (other && !other.isStatic && !springObj.bodies.includes(other)) {
        const dx = other.position.x - springObj.body.position.x;
        const dy = other.position.y - springObj.body.position.y;
        const d = Math.hypot(dx, dy) || 1;
        const launchSpeed = Math.min(22, Math.max(10, rel * 1.35));
        Body.setVelocity(other, {
          x: other.velocity.x * 0.4 + (dx / d) * launchSpeed * 0.65,
          y: Math.min(-launchSpeed, (dy / d) * launchSpeed)
        });
        springObj.boingUntil = now + 480;
        if (typeof playTone === "function") playTone(340, 0.12);
        if (sup) spawnSparks(sup.x, sup.y, 14);
        continue;
      }
    }

    // 2. Star Super-Bumper Behaviour: pinball-style radial knockback
    const starObj = firstMatch(stars, a, b);
    if (starObj && starObj.body) {
      const other = starObj.bodies.includes(a) ? b : a;
      if (other && !other.isStatic && !starObj.bodies.includes(other)) {
        const dx = other.position.x - starObj.body.position.x;
        const dy = other.position.y - starObj.body.position.y;
        const d = Math.hypot(dx, dy) || 1;
        const boost = Math.min(20, Math.max(9, rel * 1.25));
        Body.setVelocity(other, { x: (dx / d) * boost, y: (dy / d) * boost - 2 });
        starObj.impactAt = now;
        starObj.impactStrength = 0.26;
        if (typeof playTone === "function") playTone(580, 0.10);
        if (sup) spawnSparks(sup.x, sup.y, 16);
        continue;
      }
    }

    // 3. Diamond Gem Chime on impact
    const diamondObj = firstMatch(diamonds, a, b);
    if (diamondObj && rel > 3) {
      if (typeof playTone === "function") playTone(740, 0.07);
      if (sup) spawnSparks(sup.x, sup.y, 10);
    }

    // 4. Squash-and-stretch impulse on solid objects
    if (rel > 4) {
      for (const body of a === b ? [a] : [a, b]) {
        for (const object of directBodies.get(body) || []) {
          object.impactAt = now;
          object.impactStrength = Math.min(0.28, rel * 0.016);
        }
      }
    }

    if (rel < 5) continue;
    if (rel > 8 && typeof playTone === "function") playTone(110 + rel * 6, 0.04);
    if (sup) spawnSparks(sup.x, sup.y, rel);
  }
});

function buildWalls() {
  const W = canvas.width;
  const H = canvas.height;
  const T = 100; // thick walls so fast objects cannot pass through
  const opts = { isStatic: true, friction: 0.8, restitution: 0.2 };
  walls = [
    Bodies.rectangle(W / 2, H + T / 2, W + T * 2, T, opts),   // floor
    Bodies.rectangle(-T / 2, H / 2, T, H * 4, opts),          // left wall
    Bodies.rectangle(W + T / 2, H / 2, T, H * 4, opts)        // right wall
  ];
  Composite.add(world, walls);
}

function removeObject(o) {
  if (!o) return;
  if (!canEditObject(o)) return;
  if (typeof window.broadcastObjectRemoval === "function") {
    window.broadcastObjectRemoval(o);
  }
  if (grabbed && grabbed.obj === o) grabbed = null;
  if (h2.grab && h2.grab.obj === o) h2.grab = null;
  for (const b of o.bodies) Composite.remove(world, b);
  if (o.springConstraint) Composite.remove(world, o.springConstraint);
  for (let i = links.length - 1; i >= 0; i--) {
    if (links[i].a === o || links[i].b === o) {
      Composite.remove(world, links[i].c);
      links.splice(i, 1);
    }
  }
  selected.delete(o);
  const i = objects.indexOf(o);
  if (i !== -1) objects.splice(i, 1);
}

function clearObjects() {
  for (const o of objects.slice()) removeObject(o);
}

function trimObjects() {
  while (objects.length > MAX_OBJECTS) {
    const oldestOwned = objects.find((o) => canEditObject(o));
    if (!oldestOwned) break;
    removeObject(oldestOwned);
  }
}

let nextObjectId = 1;

function makeObjectId() {
  const ownerId = window.sharedSpace ? window.sharedSpace.localOwnerId : "local";
  return ownerId + ":" + nextObjectId++;
}

function canEditObject(o) {
  if (window.sharedSpace && window.sharedSpace.applyingRemoteUpdate) return true;
  if (!o || !o.ownerId || !window.sharedSpace) return true;
  return o.ownerId === window.sharedSpace.localOwnerId;
}

function assignLocalObjectIdentity(o) {
  if (!o) return;
  o.ownerId = window.sharedSpace ? window.sharedSpace.localOwnerId : "local";
  o.objectId = makeObjectId();
}

function sendObjectCreation(o) {
  if (!o || typeof window.broadcastObjectCreation !== "function") return;
  window.broadcastObjectCreation(o);
}

function sendObjectMove(o, force = false) {
  if (!o || !canEditObject(o) || typeof window.broadcastObjectMove !== "function") return;
  const now = performance.now();
  if (!force && now - (o.lastMoveSyncAt || 0) < 40) return;
  o.lastMoveSyncAt = now;
  window.broadcastObjectMove(o);
}

function spawnSparks(x, y, strength) {
  const n = Math.min(6, Math.max(2, Math.floor(strength / 2)));
  for (let i = 0; i < n && particles.length < MAX_PARTICLES; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 1.5 + Math.random() * Math.min(5, strength * 0.5);
    particles.push({
      x: x,
      y: y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp - 1,
      life: 0,
      max: 22 + Math.random() * 16
    });
  }
}

function updateParticles(k) {
  const drag = Math.pow(0.97, k);
  let liveParticles = 0;
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    p.x += p.vx * k;
    p.y += p.vy * k;
    p.vy += 0.12 * k;
    p.vx *= drag;
    p.life += k;
    if (p.life < p.max) particles[liveParticles++] = p;
  }
  particles.length = liveParticles;
}

// Spiral Gravity Well Behaviour: pulls nearby dynamic objects toward the spiral center
function applySpiralWells() {
  for (const w of objects) {
    if (w.kind !== "spiral" || !w.body) continue;
    const wx = w.body.position.x;
    const wy = w.body.position.y;
    const range = Math.max(180, (w.wellRadius || 45) * 4.2);

    Body.setAngle(w.body, w.body.angle + 0.045 * (w.spiralDir || 1));

    for (const o of objects) {
      if (o === w || !o.body || o.body.isStatic) continue;
      if ((grabbed && grabbed.obj === o) || (h2.grab && h2.grab.obj === o)) continue;
      const b = o.body;
      const dx = wx - b.position.x;
      const dy = wy - b.position.y;
      const d = Math.hypot(dx, dy);
      if (d < 14 || d > range) continue;

      const strength = (1 - d / range) * 0.0016 * b.mass;
      const nx = dx / d;
      const ny = dy / d;
      const swirl = 0.35 * (w.spiralDir || 1);
      Body.applyForce(b, b.position, {
        x: (nx - ny * swirl) * strength,
        y: (ny + nx * swirl) * strength
      });
    }
  }
}

function stepPhysics(nowMs) {
  const dt = Math.min(nowMs - lastFrameMs, 100);
  lastFrameMs = nowMs;
  checkDualHandScale();
  checkMergeAndDemerge(nowMs);
  if (pausedWorld) {
    accumulator = 0;
    updateParticles(dt / STEP_MS);
    moveGrabbedStatic();
    driveHeldPaused();
    return;
  }
  updateReturns(nowMs);
  moveGrabbedStatic();
  accumulator += dt;
  // An empty or fully static scene has no motion or dynamic collisions to solve.
  if (!Matter.Composite.allBodies(world).some((body) => !body.isStatic)) {
    accumulator = 0;
    updateParticles(dt / STEP_MS);
    return;
  }
  while (accumulator >= STEP_MS) {
    driveGrabbedDynamic();
    driveGrab2();
    applyFloat(performance.now());
    applySpiralWells();
    for (const o of objects) {
      for (const b of o.bodies) {
        // Gesture-driven velocity changes must wake bodies just like a collision does.
        if (b.isSleeping && (b.speed > 0.1 || Math.abs(b.angularVelocity) > 0.01 ||
            (grabbed && grabbed.obj === o) || (h2.grab && h2.grab.obj === o))) {
          Matter.Sleeping.set(b, false);
        }
        if (!b.isStatic && !b.isSleeping) {
          const previous = b._ip || (b._ip = { x: 0, y: 0, a: 0 });
          previous.x = b.position.x;
          previous.y = b.position.y;
          previous.a = b.angle;
        }
      }
    }
    Engine.update(engine, STEP_MS);
    accumulator -= STEP_MS;
  }
  updateParticles(dt / STEP_MS);
  for (const o of objects.slice()) {
    if (o.body && o.body.position.y > canvas.height + 600) removeObject(o);
  }
}

function getObjectsEdgeGap(objA, objB) {
  if (!objA || !objB) return Infinity;
  if (objA.body && objB.body) {
    const collision = Matter.Collision.collides(objA.body, objB.body);
    if (collision && collision.collided) return 0;
  }
  const getBounds = (o) => o.body ? o.body.bounds : o.bodies[0].bounds;
  const a = getBounds(objA), b = getBounds(objB);
  const dx = Math.max(0, a.min.x - b.max.x, b.min.x - a.max.x);
  const dy = Math.max(0, a.min.y - b.max.y, b.min.y - a.max.y);
  return Math.hypot(dx, dy);
}

function objectWorldGeometry(o) {
  if (!o.body || !o.local) {
    const points = o.raw || [];
    return { visual: points.map((p) => ({ x: p.x, y: p.y })), shape: points.map((p) => ({ x: p.x, y: p.y })) };
  }
  const body = o.body;
  const c = Math.cos(body.angle), s = Math.sin(body.angle);
  const toWorld = (arr) => (arr || []).map((p) => ({
    x: body.position.x + p.x * c - p.y * s,
    y: body.position.y + p.x * s + p.y * c
  }));
  return {
    visual: toWorld(o.local),
    shape: toWorld(o.kind === "solid" ? o.polyLocal : (o.lineLocal || o.local))
  };
}

function mergeObjects(objA, objB) {
  if (!objA || !objB || objA === objB || objA.isMerged || objB.isMerged ||
      !canEditObject(objA) || !canEditObject(objB) ||
      !objects.includes(objA) || !objects.includes(objB)) return null;

  const makeParts = (o, dx, dy) => {
    const source = o.body
      ? (o.body.parts.length > 1 ? o.body.parts.slice(1) : [o.body])
      : o.bodies;
    return source.map((part) => {
      const vertices = part.vertices.map((v) => ({ x: v.x + dx, y: v.y + dy }));
      return Bodies.fromVertices(part.position.x + dx, part.position.y + dy, [vertices], {
        friction: part.friction || 0.4,
        restitution: part.restitution || 0.35,
        density: part.density || 0.0014
      }, true);
    }).filter(bodyIsOk);
  };

  const gap = getObjectsEdgeGap(objA, objB);
  const posA = objA.body ? objA.body.position : objA.bodies[0].position;
  const posB = objB.body ? objB.body.position : objB.bodies[0].position;
  const direction = Math.atan2(posA.y - posB.y, posA.x - posB.x);
  const snapDistance = Math.max(0, gap + 4);
  const dx = Math.cos(direction) * snapDistance;
  const dy = Math.sin(direction) * snapDistance;
  const parts = makeParts(objA, 0, 0).concat(makeParts(objB, dx, dy));
  let body = parts.length >= 2 ? Body.create({ parts: parts, friction: 0.4, restitution: 0.35 }) : null;

  const geometryA = objectWorldGeometry(objA);
  const geometryB = objectWorldGeometry(objB);
  const shift = (points, x, y) => points.map((p) => ({ x: p.x + x, y: p.y + y }));
  const visualA = geometryA.visual;
  const visualB = shift(geometryB.visual, dx, dy);
  const shapeA = geometryA.shape;
  const shapeB = shift(geometryB.shape, dx, dy);
  if (!body || !bodyIsOk(body)) {
    const all = visualA.concat(visualB);
    body = buildBody(hullOf(all));
  }
  if (!body || !bodyIsOk(body)) return null;

  const c = Math.cos(-body.angle), s = Math.sin(-body.angle);
  const toLocal = (points) => points.map((p) => {
    const x = p.x - body.position.x, y = p.y - body.position.y;
    return { x: x * c - y * s, y: x * s + y * c };
  });
  const subParts = [
    { source: objA, visual: visualA, shape: shapeA },
    { source: objB, visual: visualB, shape: shapeB }
  ].map(({ source, visual, shape }) => ({
    kind: source.kind,
    shapeType: source.shapeType,
    behaviorText: source.behaviorText,
    hue: source.hue,
    wellRadius: source.wellRadius,
    spiralDir: source.spiralDir,
    local: toLocal(visual),
    polyLocal: toLocal(shape)
  }));
  const wasSelected = selected.has(objA) || selected.has(objB);
  const merged = {
    kind: "compound",
    shapeType: "Merged",
    behaviorText: "Fused Compound",
    isMerged: true,
    scaleMultiplier: 1,
    hue: Math.round(((objA.hue || 190) + (objB.hue || 190)) / 2),
    bodies: [body],
    body: body,
    local: subParts.flatMap((part) => part.local),
    polyLocal: subParts.flatMap((part) => part.polyLocal),
    subParts: subParts,
    origin: { x: body.position.x, y: body.position.y, angle: body.angle },
    born: performance.now()
  };

  removeObject(objA);
  removeObject(objB);
  Composite.add(world, body);
  objects.push(merged);
  if (wasSelected) {
    selected.add(merged);
    pinObject(merged);
  }
  assignLocalObjectIdentity(merged);
  sendObjectCreation(merged);
  if (pen) startGrab(merged);
  if (h2.pen) startGrab2(merged);
  spawnSparks(body.position.x, body.position.y, 28);
  spawnShockwave(body.position.x, body.position.y, merged.hue);
  showToast("Merged into one object");
  syncButtons();
  return merged;
}

function demergeObject(merged) {
  if (!merged || !merged.isMerged || !merged.subParts || merged.subParts.length !== 2 || !canEditObject(merged)) return;
  const body = merged.body;
  const c = Math.cos(body.angle), s = Math.sin(body.angle);
  const toWorld = (points) => points.map((p) => ({
    x: body.position.x + p.x * c - p.y * s,
    y: body.position.y + p.x * s + p.y * c
  }));
  const targets = [penVis || pen, h2.vis || h2.pen];
  const data = merged.subParts.map((part, i) => {
    const visual = toWorld(part.local);
    const shape = toWorld(part.polyLocal);
    const currentCenter = centroid(visual);
    const target = targets[i] || currentCenter;
    const dx = target.x - currentCenter.x, dy = target.y - currentCenter.y;
    const move = (points) => points.map((p) => ({ x: p.x + dx, y: p.y + dy }));
    if (part.kind === "platform") {
      return { k: "platform", shapeType: part.shapeType, raw: move(visual) };
    }
    return {
      k: part.kind,
      shapeType: part.shapeType,
      behaviorText: part.behaviorText,
      hue: part.hue,
      wellRadius: part.wellRadius,
      spiralDir: part.spiralDir,
      v: move(visual),
      s: move(shape)
    };
  });

  if (grabbed && grabbed.obj === merged) releaseGrab();
  if (h2.grab && h2.grab.obj === merged) releaseGrab2();
  removeObject(merged);
  const created = [];
  for (const item of data) {
    if (deserObj(item)) {
      const object = objects[objects.length - 1];
      created.push(object);
      sendObjectCreation(object);
    }
  }
  if (created[0] && pen) startGrab(created[0]);
  if (created[1] && h2.pen) startGrab2(created[1]);
  for (const target of targets) if (target) spawnSparks(target.x, target.y, 16);
  showToast("Split into two objects");
  syncButtons();
}

function checkMergeAndDemerge(nowMs) {
  if (grabbed && h2.grab && grabbed.obj === h2.grab.obj && grabbed.obj.isMerged) {
    mergeCandidate = null;
    mergeProgress = 0;
    const first = penVis || pen, second = h2.vis || h2.pen;
    if (!first || !second) return;
    const distance = dist(first, second);
    if (!demergeCandidate || demergeCandidate.obj !== grabbed.obj) {
      demergeCandidate = { obj: grabbed.obj, minDist: distance };
    } else {
      demergeCandidate.minDist = Math.min(demergeCandidate.minDist, distance);
      demergeProgress = Math.min(1, Math.max(0, distance - demergeCandidate.minDist - 10) / Math.max(1, DEMERGE_PULL_TOL - 10));
      if (demergeProgress >= 1) {
        const target = grabbed.obj;
        demergeCandidate = null;
        demergeProgress = 0;
        mergeCooldownUntil = nowMs + 1000;
        demergeObject(target);
      }
    }
    return;
  }
  demergeCandidate = null;
  demergeProgress = 0;

  const a = grabbed && grabbed.obj;
  const b = h2.grab && h2.grab.obj;
  if (!a || !b || a === b || !canEditObject(a) || !canEditObject(b) || a.isMerged || b.isMerged || nowMs < mergeCooldownUntil) {
    mergeCandidate = null;
    mergeProgress = 0;
    return;
  }
  const gap = getObjectsEdgeGap(a, b);
  if (gap > MERGE_PROXIMITY_PX) {
    mergeCandidate = null;
    mergeProgress = 0;
    return;
  }
  const posA = a.body ? a.body.position : a.bodies[0].position;
  const posB = b.body ? b.body.position : b.bodies[0].position;
  if (!mergeCandidate || mergeCandidate.objA !== a || mergeCandidate.objB !== b) {
    mergeCandidate = { objA: a, objB: b, startMs: nowMs };
  }
  mergeCandidate.midX = (posA.x + posB.x) / 2;
  mergeCandidate.midY = (posA.y + posB.y) / 2;
  mergeProgress = Math.min(1, (nowMs - mergeCandidate.startMs) / MERGE_HOLD_MS);

  if (!pausedWorld && a.body && !a.body.isStatic && b.body && !b.body.isStatic) {
    const distance = Math.max(1, dist(posA, posB));
    const force = 0.003 * mergeProgress;
    const nx = (posB.x - posA.x) / distance, ny = (posB.y - posA.y) / distance;
    Body.applyForce(a.body, a.body.position, { x: nx * force, y: ny * force });
    Body.applyForce(b.body, b.body.position, { x: -nx * force, y: -ny * force });
  }
  if (mergeProgress >= 1) {
    mergeObjects(a, b);
    mergeCandidate = null;
    mergeProgress = 0;
    mergeCooldownUntil = nowMs + 1000;
  }
}

// ------------------------------------------------------------
// Turning strokes into physics bodies
// ------------------------------------------------------------
function bodyOptions() {
  const mat = (typeof MATERIALS !== "undefined" && MATERIALS[matIdx]) ? MATERIALS[matIdx].o : {};
  return Object.assign({ friction: 0.4, restitution: 0.35, density: 0.0012, frictionAir: 0.01 }, mat);
}

function bodyIsOk(b) {
  return !!b && Number.isFinite(b.mass) && b.mass > 0 &&
    Number.isFinite(b.position.x) && Number.isFinite(b.position.y) &&
    b.vertices && b.vertices.length >= 3;
}

function buildBody(poly, customOpts) {
  const opts = customOpts || bodyOptions();
  const attempts = [poly];
  try { attempts.push(hullOf(poly)); } catch (e) { /* ignore */ }
  for (const verts of attempts) {
    if (!verts || verts.length < 3) continue;
    try {
      const c = centroid(verts);
      const copy = verts.map((p) => ({ x: p.x, y: p.y }));
      const b = Bodies.fromVertices(c.x, c.y, [copy], opts, true);
      if (bodyIsOk(b)) return b;
    } catch (e) { /* try next */ }
  }
  const bb = boundsOf(poly);
  const r = Math.max(10, Math.min(bb.w, bb.h) / 2);
  return Bodies.circle(bb.minX + bb.w / 2, bb.minY + bb.h / 2, r, opts);
}

function addCircleObject(raw, circleData) {
  const baseOpts = bodyOptions();
  const opts = Object.assign({}, baseOpts, {
    friction: 0.04,
    frictionAir: 0.004,
    restitution: Math.max(0.78, baseOpts.restitution || 0.78)
  });
  const body = Bodies.circle(circleData.center.x, circleData.center.y, circleData.radius, opts);
  if (!bodyIsOk(body)) return false;

  const cleanPts = (circleData.poly && circleData.poly.length >= 16)
    ? circleData.poly
    : window.makeCirclePoints(circleData.center, circleData.radius, 32);
  const local = cleanPts.map((p) => ({ x: p.x - body.position.x, y: p.y - body.position.y }));
  const polyLocal = cleanPts.map((p) => ({ x: p.x - body.position.x, y: p.y - body.position.y }));

  Composite.add(world, body);
  objects.push({
    kind: "solid",
    shapeType: "Circle",
    behaviorText: "Roller Ball",
    hue: 45 + Math.floor(Math.random() * 40),
    bodies: [body],
    body: body,
    local: local,
    polyLocal: polyLocal,
    simple: cleanPts,
    origin: { x: body.position.x, y: body.position.y, angle: body.angle },
    born: performance.now()
  });
  return true;
}

function addSolid(raw, poly, shapeLabel, behaviorLabel) {
  const label = shapeLabel || "Blob";
  const baseOpts = bodyOptions();
  const customOpts = Object.assign({}, baseOpts);
  let hue = Math.floor(Math.random() * 360);

  if (label === "Triangle") {
    customOpts.friction = 0.16;
    customOpts.restitution = 0.35;
    hue = 140;
  } else if (label === "Square") {
    customOpts.friction = 0.65;
    customOpts.restitution = 0.2;
    hue = 160;
  } else if (label === "Rectangle") {
    customOpts.density = 0.0022;
    customOpts.friction = 0.6;
    hue = 205;
  } else if (label === "Diamond") {
    customOpts.restitution = 0.88;
    customOpts.friction = 0.1;
    hue = 185;
  } else if (label === "Pentagon" || label === "Hexagon") {
    customOpts.friction = 0.5;
    customOpts.restitution = 0.4;
    hue = 120;
  } else if (label === "Star") {
    customOpts.restitution = 0.95;
    customOpts.friction = 0.2;
    hue = 52;
  }

  const body = buildBody(poly, customOpts);
  if (!body) return false;

  const pb = boundsOf(poly);
  const dx = (pb.minX + pb.maxX) / 2 - (body.bounds.min.x + body.bounds.max.x) / 2;
  const dy = (pb.minY + pb.maxY) / 2 - (body.bounds.min.y + body.bounds.max.y) / 2;
  if (Number.isFinite(dx) && Number.isFinite(dy)) {
    Body.translate(body, { x: dx, y: dy });
  }

  const local = raw.map((p) => ({ x: p.x - body.position.x, y: p.y - body.position.y }));
  const polyLocal = poly.map((p) => ({ x: p.x - body.position.x, y: p.y - body.position.y }));

  Composite.add(world, body);
  objects.push({
    kind: "solid",
    shapeType: label,
    behaviorText: behaviorLabel || "Solid Body",
    hue: hue,
    bodies: [body],
    body: body,
    local: local,
    polyLocal: polyLocal,
    simple: poly,
    origin: { x: body.position.x, y: body.position.y, angle: body.angle },
    born: performance.now()
  });
  return true;
}

function addCompoundObject(components) {
  if (!Array.isArray(components) || components.length < 2) return false;
  const parts = [];
  for (const component of components) {
    const shape = component.s || component.v || [];
    const isOpen = ["platform", "line", "cup", "spring", "spiral"].includes(component.k);
    if (isOpen && shape.length >= 2) {
      for (let i = 0; i < shape.length - 1; i++) {
        const a = shape[i], b = shape[i + 1];
        const length = dist(a, b);
        if (length < 2) continue;
        parts.push(Bodies.rectangle(
          (a.x + b.x) / 2,
          (a.y + b.y) / 2,
          length + PLATFORM_THICK * 0.5,
          PLATFORM_THICK,
          { angle: Math.atan2(b.y - a.y, b.x - a.x), friction: 0.5, restitution: 0.3 }
        ));
      }
    } else if (shape.length >= 3) {
      const body = buildBody(shape);
      if (bodyIsOk(body)) parts.push(body);
    }
  }
  if (parts.length < 2) return false;
  const body = Body.create({ parts: parts, friction: 0.4, restitution: 0.35 });
  if (!bodyIsOk(body)) return false;

  const c = Math.cos(-body.angle), s = Math.sin(-body.angle);
  const toLocal = (points) => (points || []).map((p) => {
    const dx = p.x - body.position.x, dy = p.y - body.position.y;
    return { x: dx * c - dy * s, y: dx * s + dy * c };
  });
  const subParts = components.map((component) => ({
    kind: component.k,
    shapeType: component.shapeType,
    behaviorText: component.behaviorText,
    hue: component.hue,
    wellRadius: component.wellRadius,
    spiralDir: component.spiralDir,
    local: toLocal(component.v),
    polyLocal: toLocal(component.s || component.v)
  }));
  const local = subParts.flatMap((part) => part.local);
  const polyLocal = subParts.flatMap((part) => part.polyLocal);

  Composite.add(world, body);
  objects.push({
    kind: "compound",
    shapeType: "Merged",
    behaviorText: "Fused Compound",
    isMerged: true,
    scaleMultiplier: 1,
    hue: Math.round(subParts.reduce((sum, part) => sum + (part.hue || 190), 0) / subParts.length),
    bodies: [body],
    body: body,
    local: local,
    polyLocal: polyLocal,
    subParts: subParts,
    origin: { x: body.position.x, y: body.position.y, angle: body.angle },
    born: performance.now()
  });
  return true;
}

function addSpiralWell(raw, spiralData) {
  const c = spiralData.center || centroid(raw);
  const r = Math.max(20, spiralData.radius || 36);
  const body = Bodies.circle(c.x, c.y, r * 0.45, {
    isStatic: true,
    isSensor: true
  });
  if (!bodyIsOk(body)) return false;

  const local = raw.map((p) => ({ x: p.x - body.position.x, y: p.y - body.position.y }));
  Composite.add(world, body);
  objects.push({
    kind: "spiral",
    shapeType: "Spiral",
    behaviorText: "Gravity Well",
    hue: 275,
    bodies: [body],
    body: body,
    local: local,
    lineLocal: local,
    raw: raw.map((p) => ({ x: p.x, y: p.y })),
    simple: raw,
    wellRadius: r,
    spiralDir: spiralData.dir || 1,
    origin: { x: body.position.x, y: body.position.y, angle: 0 },
    born: performance.now()
  });
  return true;
}

function addCup(raw, corners) {
  const parts = [];
  for (let i = 0; i < corners.length - 1; i++) {
    const a = corners[i];
    const b = corners[i + 1];
    const len = dist(a, b);
    if (len < 4) continue;
    parts.push(Bodies.rectangle(
      (a.x + b.x) / 2,
      (a.y + b.y) / 2,
      len + PLATFORM_THICK * 0.4,
      PLATFORM_THICK,
      {
        angle: Math.atan2(b.y - a.y, b.x - a.x),
        friction: 0.6,
        restitution: 0.15,
        density: 0.0018
      }
    ));
  }
  if (parts.length === 0) return false;

  const body = Body.create({
    parts: parts,
    isStatic: !linesFall,
    friction: 0.6,
    restitution: 0.15
  });
  if (!bodyIsOk(body)) return false;

  const c = Math.cos(-body.angle);
  const s = Math.sin(-body.angle);
  const local = raw.map((p) => {
    const dx = p.x - body.position.x;
    const dy = p.y - body.position.y;
    return { x: dx * c - dy * s, y: dx * s + dy * c };
  });
  const lineLocal = corners.map((p) => {
    const dx = p.x - body.position.x;
    const dy = p.y - body.position.y;
    return { x: dx * c - dy * s, y: dx * s + dy * c };
  });

  Composite.add(world, body);
  objects.push({
    kind: "cup",
    shapeType: "Cup",
    behaviorText: "Catcher Bowl",
    hue: 28,
    bodies: [body],
    body: body,
    local: local,
    lineLocal: lineLocal,
    raw: raw.map((p) => ({ x: p.x, y: p.y })),
    simple: corners,
    origin: { x: body.position.x, y: body.position.y, angle: body.angle },
    born: performance.now()
  });
  return true;
}

function addSpring(raw, corners) {
  const bb = boundsOf(raw);
  const cx = (bb.minX + bb.maxX) / 2;
  const cy = (bb.minY + bb.maxY) / 2;
  const w = Math.max(28, bb.w);
  const h = Math.max(28, bb.h);

  const opts = Object.assign(bodyOptions(), {
    isStatic: !linesFall,
    restitution: 0.95,
    friction: 0.5
  });

  const body = Bodies.rectangle(cx, cy, w, h, opts);
  if (!bodyIsOk(body)) return false;

  const local = raw.map((p) => ({ x: p.x - body.position.x, y: p.y - body.position.y }));
  const lineLocal = corners.map((p) => ({ x: p.x - body.position.x, y: p.y - body.position.y }));

  Composite.add(world, body);
  objects.push({
    kind: "spring",
    shapeType: "Zigzag",
    behaviorText: "Bouncy Spring",
    hue: 315,
    bodies: [body],
    body: body,
    local: local,
    lineLocal: lineLocal,
    raw: raw.map((p) => ({ x: p.x, y: p.y })),
    simple: corners,
    origin: { x: body.position.x, y: body.position.y, angle: body.angle },
    born: performance.now(),
    boingUntil: performance.now() + 380
  });
  return true;
}

function addPlatform(raw, line, shapeLabel) {
  const bodies = [];
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i];
    const b = line[i + 1];
    const len = dist(a, b);
    if (len < 2) continue;
    const piece = Bodies.rectangle(
      (a.x + b.x) / 2,
      (a.y + b.y) / 2,
      len + PLATFORM_THICK * 0.5,
      PLATFORM_THICK,
      {
        isStatic: true,
        angle: Math.atan2(b.y - a.y, b.x - a.x),
        friction: 0.7,
        restitution: 0.2
      }
    );
    bodies.push(piece);
  }
  if (bodies.length === 0) return false;
  Composite.add(world, bodies);
  objects.push({
    kind: "platform",
    shapeType: shapeLabel || "Line",
    behaviorText: "Fixed Ramp",
    hue: 190,
    bodies: bodies,
    body: null,
    raw: raw.map((p) => ({ x: p.x, y: p.y })),
    simple: line,
    born: performance.now()
  });
  return true;
}

function addFallingLine(raw, line, shapeLabel) {
  const parts = [];
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i];
    const b = line[i + 1];
    const len = dist(a, b);
    if (len < 2) continue;
    parts.push(Bodies.rectangle(
      (a.x + b.x) / 2,
      (a.y + b.y) / 2,
      len + PLATFORM_THICK * 0.5,
      PLATFORM_THICK,
      {
        angle: Math.atan2(b.y - a.y, b.x - a.x),
        friction: 0.5,
        restitution: 0.3,
        density: 0.0012,
        frictionAir: 0.01
      }
    ));
  }
  if (parts.length === 0) return false;

  const body = parts.length === 1 ? parts[0] : Body.create({ parts: parts });
  if (!bodyIsOk(body)) return false;

  const c = Math.cos(-body.angle);
  const s = Math.sin(-body.angle);
  const local = raw.map((p) => {
    const dx = p.x - body.position.x;
    const dy = p.y - body.position.y;
    return { x: dx * c - dy * s, y: dx * s + dy * c };
  });

  const lineLocal = line.map((p) => {
    const dx = p.x - body.position.x;
    const dy = p.y - body.position.y;
    return { x: dx * c - dy * s, y: dx * s + dy * c };
  });

  Composite.add(world, body);
  objects.push({
    kind: "line",
    shapeType: shapeLabel || "Line",
    behaviorText: "Falling Line",
    hue: 190,
    bodies: [body],
    body: body,
    local: local,
    lineLocal: lineLocal,
    simple: line,
    origin: { x: body.position.x, y: body.position.y, angle: body.angle },
    born: performance.now()
  });
  return true;
}

// Both Hand 1, Hand 2, and the mouse send their finished strokes here.
function commitStroke(points, fromNetwork = false, ownerId = null, objectId = null, color = null) {
  if (window.GameEngine && window.GameEngine.isGameRunning("asteroid-shooter")) return;
  const sourcePoints = points.slice();
  points = smoothStroke(points, 2);
  const len = pathLength(points);
  if (points.length < MIN_STROKE_POINTS || len < MIN_STROKE_LENGTH) {
    cancelled++;
    return;
  }

  const freeformVisual = simplify(points, 0.8);
  const classified = classifyShape(points);
  const isSnapped = !!(classified && classified.snapPoints && classified.snapPoints.length >= 2);
  const visual = isSnapped ? classified.snapPoints : freeformVisual;
  let made = false;
  const objectCount = objects.length;

  if (classified.type === "circle") {
    made = addCircleObject(visual, classified.data);
  } else if (
    classified.type === "triangle" ||
    classified.type === "square" ||
    classified.type === "rectangle" ||
    classified.type === "diamond" ||
    classified.type === "pentagon" ||
    classified.type === "hexagon" ||
    classified.type === "star"
  ) {
    made = addSolid(visual, classified.data.poly, classified.label, classified.behavior);
  } else if (classified.type === "spiral") {
    made = addSpiralWell(visual, classified.data);
  } else if (classified.type === "cup") {
    made = addCup(visual, classified.data.corners);
  } else if (classified.type === "zigzag") {
    made = addSpring(visual, classified.data.corners);
  } else if (classified.type === "blob") {
    made = addSolid(freeformVisual, classified.data.poly, "Blob", "Solid Body");
    if (made) {
      lastInfo = "closed shape, " + points.length + " points became " + classified.data.poly.length + " corners";
    }
  }

  if (made && isSnapped) {
    lastInfo = classified.label + " (" + classified.behavior + ")";
    if (typeof showToast === "function") {
      showToast("Identified: " + classified.label + " (" + classified.behavior + ")");
    }
  } else if (!made) {
    const line = (classified.data && classified.data.line)
      ? classified.data.line
      : simplifyCapped(points, PLATFORM_EPSILON, MAX_SEGMENTS + 1);
    const label = isSnapped ? classified.label : "Line";
    const ok = linesFall
      ? addFallingLine(visual, line, label)
      : addPlatform(visual, line, label);
    made = ok;
    if (ok) {
      if (isSnapped) {
        const beh = linesFall ? "Falling Rod" : "Fixed Ramp";
        lastInfo = label + " (" + beh + ")";
        if (typeof showToast === "function") {
          showToast("Identified: " + label + " (" + beh + ")");
        }
      } else {
        lastInfo = "open line (" + (linesFall ? "falls" : "fixed platform") + "), " +
          points.length + " points became " + line.length;
      }
    } else {
      cancelled++;
    }
  }
  if (made && objects.length > objectCount) {
    const o = objects[objects.length - 1];
    if (fromNetwork) {
      o.ownerId = ownerId;
      o.objectId = objectId;
      if (isValidDrawingColor(color)) o.color = color;
    } else {
      o.color = drawingColor;
      assignLocalObjectIdentity(o);
      if (typeof window.broadcastStroke === "function") {
        window.broadcastStroke(sourcePoints, o.ownerId, o.objectId, o.color);
      }
    }
  }
  trimObjects();
}

function spawnTestBall(x, y) {
  const r = 26;
  const pts = window.makeCirclePoints({ x: x, y: y }, r, 24);
  addCircleObject(pts, { center: { x: x, y: y }, radius: r, poly: pts });
  objects[objects.length - 1].color = drawingColor;
  assignLocalObjectIdentity(objects[objects.length - 1]);
  sendObjectCreation(objects[objects.length - 1]);
  trimObjects();
}

// ------------------------------------------------------------
// Dual-Handed Independent Grab, Carry, Throw, and Hover-Select
// ------------------------------------------------------------
function objectAtPoint(p) {
  if (!p) return null;
  const bodies = [];
  for (const o of objects) {
    for (const b of o.bodies) bodies.push(b);
  }
  if (bodies.length === 0) return null;
  const r = GRAB_PICK_RADIUS;
  const k = r * 0.7;
  const samples = [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r], [k, k], [-k, k], [k, -k], [-k, -k]];
  for (const [ox, oy] of samples) {
    const hits = Matter.Query.point(bodies, { x: p.x + ox, y: p.y + oy });
    if (hits.length > 0) {
      let hit = hits[0];
      for (const h of hits) {
        if (dist(h.position, p) < dist(hit.position, p)) hit = h;
      }
      const rootHit = hit.parent || hit;
      return objects.find((o) => o.bodies.includes(rootHit) || o.bodies.includes(hit)) || null;
    }
  }
  return null;
}

function shiftStatic(o, dx, dy) {
  o.shiftX = (o.shiftX || 0) + dx;
  o.shiftY = (o.shiftY || 0) + dy;
  for (const b of o.bodies) Body.translate(b, { x: dx, y: dy });
  if (o.raw) {
    for (const p of o.raw) {
      p.x += dx;
      p.y += dy;
    }
  }
}

// Hand 1 Grab functions
function startGrab(o) {
  if (!o || !pen || !canEditObject(o)) return;
  if (h2.grab && h2.grab.obj === o && !o.isMerged) return;
  returns = returns.filter((r) => r.obj !== o);
  if (o.body && !o.body.isStatic) {
    const heldByHand2 = h2.grab && h2.grab.obj === o;
    const origMass = heldByHand2 ? 0 : o.body.mass;
    if (!heldByHand2) Body.setMass(o.body, origMass * GRAB_MASS_MULT);
    grabbed = {
      obj: o,
      dynamic: true,
      origMass: origMass,
      h0: handAng,
      b0: o.body.angle,
      cvx: 0,
      cvy: 0,
      offX: o.body.position.x - pen.x,
      offY: o.body.position.y - pen.y,
      start: { x: o.body.position.x, y: o.body.position.y, angle: o.body.angle }
    };
  } else {
    const ref = o.bodies[0].position;
    grabbed = {
      obj: o,
      dynamic: false,
      offX: ref.x - pen.x,
      offY: ref.y - pen.y,
      totalDx: 0,
      totalDy: 0
    };
  }
  if (typeof playTone === "function") playTone(500, 0.05);
}

function restoreGrabMass(g) {
  if (g && g.dynamic && g.origMass && g.obj && g.obj.body && !g.obj.body.isStatic) {
    Body.setMass(g.obj.body, g.origMass);
  }
}

function releaseGrab() {
  const g = grabbed;
  grabbed = null;
  restoreGrabMass(g);
  if (!g || !objects.includes(g.obj)) return;
  if (g.dynamic && g.obj.body) {
    const b = g.obj.body;
    const sp = Math.hypot(b.velocity.x, b.velocity.y);
    if (sp > MAX_THROW) {
      Body.setVelocity(b, { x: b.velocity.x * MAX_THROW / sp, y: b.velocity.y * MAX_THROW / sp });
    }
    Body.setAngularVelocity(b, Math.max(-0.4, Math.min(0.4, b.velocity.x * 0.012)));
    if (Math.hypot(b.position.x - g.start.x, b.position.y - g.start.y) > 8) lastMoved = g.obj;
  } else if (Math.hypot(g.totalDx || 0, g.totalDy || 0) > 8) {
    lastMoved = g.obj;
  }
  sendObjectMove(g.obj, true);
  if (typeof syncButtons === "function") syncButtons();
}

// Hand 2 Grab functions (completely independent and symmetric with Hand 1)
function startGrab2(o) {
  if (!o || !h2.pen || !canEditObject(o)) return;
  if (grabbed && grabbed.obj === o && !o.isMerged) return;
  returns = returns.filter((r) => r.obj !== o);
  if (o.body && !o.body.isStatic) {
    const heldByHand1 = grabbed && grabbed.obj === o;
    const origMass = heldByHand1 ? 0 : o.body.mass;
    if (!heldByHand1) Body.setMass(o.body, origMass * GRAB_MASS_MULT);
    h2.grab = {
      obj: o,
      dynamic: true,
      st: false,
      origMass: origMass,
      om: origMass,
      h0: h2.ang,
      b0: o.body.angle,
      cvx: 0,
      cvy: 0,
      offX: o.body.position.x - h2.pen.x,
      offY: o.body.position.y - h2.pen.y,
      start: { x: o.body.position.x, y: o.body.position.y, angle: o.body.angle }
    };
  } else {
    const ref = o.bodies[0].position;
    h2.grab = {
      obj: o,
      dynamic: false,
      st: true,
      offX: ref.x - h2.pen.x,
      offY: ref.y - h2.pen.y,
      totalDx: 0,
      totalDy: 0
    };
  }
  if (typeof playTone === "function") playTone(540, 0.05);
}

function restoreGrabMass2(k) {
  const mass = k ? (k.origMass || k.om) : 0;
  if (k && !k.st && mass && k.obj && k.obj.body && !k.obj.body.isStatic) {
    Body.setMass(k.obj.body, mass);
  }
}

function releaseGrab2() {
  const k = h2.grab;
  h2.grab = null;
  restoreGrabMass2(k);
  if (!k || !objects.includes(k.obj)) return;
  if (!k.st && k.obj.body) {
    const b = k.obj.body;
    const sp = Math.hypot(b.velocity.x, b.velocity.y);
    if (sp > MAX_THROW) {
      Body.setVelocity(b, { x: b.velocity.x * MAX_THROW / sp, y: b.velocity.y * MAX_THROW / sp });
    }
    Body.setAngularVelocity(b, Math.max(-0.4, Math.min(0.4, b.velocity.x * 0.012)));
    if (k.start && Math.hypot(b.position.x - k.start.x, b.position.y - k.start.y) > 8) lastMoved = k.obj;
  } else if (Math.hypot(k.totalDx || 0, k.totalDy || 0) > 8) {
    lastMoved = k.obj;
  }
  sendObjectMove(k.obj, true);
  if (typeof syncButtons === "function") syncButtons();
}

const platformsPushed = new Set();
const platformsPushed2 = new Set();

function notePush(ev) {
  const gb1 = (grabbed && grabbed.dynamic && grabbed.obj.body) ? grabbed.obj.body : null;
  const gb2 = (h2.grab && !h2.grab.st && h2.grab.obj && h2.grab.obj.body) ? h2.grab.obj.body : null;
  if (!gb1 && !gb2) return;

  for (const pair of ev.pairs) {
    const rootA = pair.bodyA.parent || pair.bodyA;
    const rootB = pair.bodyB.parent || pair.bodyB;

    if (gb1 && (rootA === gb1 || rootB === gb1)) {
      const other = rootA === gb1 ? rootB : rootA;
      if (other && other.isStatic) {
        const o = objects.find((x) => (x.kind === "platform" || (pushFrozen && x.pinned)) && x.bodies.includes(other));
        if (o) platformsPushed.add(o);
      }
    }
    if (gb2 && (rootA === gb2 || rootB === gb2)) {
      const other = rootA === gb2 ? rootB : rootA;
      if (other && other.isStatic) {
        const o = objects.find((x) => (x.kind === "platform" || (pushFrozen && x.pinned)) && x.bodies.includes(other));
        if (o) platformsPushed2.add(o);
      }
    }
  }
}
Matter.Events.on(engine, "collisionStart", notePush);
Matter.Events.on(engine, "collisionActive", notePush);

function driveGrabbedDynamic() {
  if (!grabbed || !grabbed.dynamic || !pen) return;
  if (!objects.includes(grabbed.obj) || !grabbed.obj.body) {
    grabbed = null;
    return;
  }
  const b = grabbed.obj.body;
  if (h2.grab && h2.grab.obj === grabbed.obj && grabbed.obj.isMerged) {
    const p1 = penVis || pen;
    const p2 = h2.vis || h2.pen;
    if (p1 && p2) {
      const vx = ((p1.x + p2.x) / 2 - b.position.x) * 0.35;
      const vy = ((p1.y + p2.y) / 2 - b.position.y) * 0.35;
      Body.setVelocity(b, { x: vx, y: vy });
      const targetAngle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
      Body.setAngle(b, b.angle + angDiff(targetAngle, b.angle) * 0.15);
      sendObjectMove(grabbed.obj);
      return;
    }
  }
  const pv = penVis || pen;
  let vx = (pv.x + grabbed.offX - b.position.x) * 0.3;
  let vy = (pv.y + grabbed.offY - b.position.y) * 0.3;
  const sp = Math.hypot(vx, vy);
  if (sp > 45) { vx = vx * 45 / sp; vy = vy * 45 / sp; }
  grabbed.cvx = grabbed.cvx === undefined ? vx : grabbed.cvx + (vx - grabbed.cvx) * 0.55;
  grabbed.cvy = grabbed.cvy === undefined ? vy : grabbed.cvy + (vy - grabbed.cvy) * 0.55;
  Body.setVelocity(b, { x: grabbed.cvx, y: grabbed.cvy });
  rotateHeld(b, grabbed, handAng);
  sendObjectMove(grabbed.obj);
  for (const o of platformsPushed) {
    if (objects.includes(o) && (!o.pinned || pushFrozen)) {
      shiftStatic(o, grabbed.cvx, grabbed.cvy);
      sendObjectMove(o);
    }
  }
  platformsPushed.clear();
}

function driveGrab2() {
  const k = h2.grab;
  if (!k || !h2.pen) return;
  if (grabbed && grabbed.obj === k.obj) return;
  if (!objects.includes(k.obj)) {
    h2.grab = null;
    return;
  }
  const pv2 = h2.vis || h2.pen;
  if (k.st || !k.obj.body) return;
  const b = k.obj.body;
  let vx = (pv2.x + k.offX - b.position.x) * 0.3;
  let vy = (pv2.y + k.offY - b.position.y) * 0.3;
  const sp = Math.hypot(vx, vy);
  if (sp > 45) { vx *= 45 / sp; vy *= 45 / sp; }
  k.cvx = k.cvx === undefined ? vx : k.cvx + (vx - k.cvx) * 0.55;
  k.cvy = k.cvy === undefined ? vy : k.cvy + (vy - k.cvy) * 0.55;
  Body.setVelocity(b, { x: k.cvx, y: k.cvy });
  rotateHeld(b, k, h2.ang);
  sendObjectMove(k.obj);
  for (const o of platformsPushed2) {
    if (objects.includes(o) && (!o.pinned || pushFrozen)) {
      shiftStatic(o, k.cvx, k.cvy);
      sendObjectMove(o);
    }
  }
  platformsPushed2.clear();
}

// Moves static platforms grabbed by either Hand 1 or Hand 2
function moveGrabbedStatic() {
  if (grabbed && !grabbed.dynamic && pen) {
    if (!objects.includes(grabbed.obj)) {
      grabbed = null;
    } else {
      const ref = grabbed.obj.bodies[0].position;
      const pv = penVis || pen;
      const dx = (pv.x + grabbed.offX - ref.x) * 0.5;
      const dy = (pv.y + grabbed.offY - ref.y) * 0.5;
      shiftStatic(grabbed.obj, dx, dy);
      grabbed.totalDx = (grabbed.totalDx || 0) + dx;
      grabbed.totalDy = (grabbed.totalDy || 0) + dy;
      sendObjectMove(grabbed.obj);
    }
  }
  if (h2.grab && h2.grab.st && h2.pen) {
    if (!objects.includes(h2.grab.obj)) {
      h2.grab = null;
    } else {
      const ref2 = h2.grab.obj.bodies[0].position;
      const pv2 = h2.vis || h2.pen;
      const dx2 = (pv2.x + h2.grab.offX - ref2.x) * 0.5;
      const dy2 = (pv2.y + h2.grab.offY - ref2.y) * 0.5;
      shiftStatic(h2.grab.obj, dx2, dy2);
      h2.grab.totalDx = (h2.grab.totalDx || 0) + dx2;
      h2.grab.totalDy = (h2.grab.totalDy || 0) + dy2;
      sendObjectMove(h2.grab.obj);
    }
  }
}

function toggleSelect(o, triggerPoint) {
  if (!o) return;
  if (selected.has(o)) {
    selected.delete(o);
    if (canEditObject(o)) unpinObject(o);
  } else {
    selected.add(o);
    lastSelectMs = performance.now();
    if (typeof playTone === "function") playTone(660, 0.08);
    const spPt = triggerPoint || pen || h2.pen;
    if (spPt) spawnSparks(spPt.x, spPt.y, 8);
    if (typeof showToast === "function") showToast("Selected: " + (o.shapeType || "Object"));
  }
  if (typeof syncButtons === "function") syncButtons();
}

function clearSelection() {
  for (const o of selected) {
    if (canEditObject(o)) unpinObject(o);
  }
  selected.clear();
  if (typeof syncButtons === "function") syncButtons();
}

// Independent hover-selection for both Hand 1 and Hand 2
function updateHoverSelect(nowMs) {
  // Hand 1 Hover Select
  let obj1 = null;
  const overBtn1 = (typeof toolbarPanelAt === "function" && showBar && pen) ? toolbarPanelAt(pen) : null;
  if (pen && !pinching && !grabbed && !overBtn1 && !(candPose && candPose !== "OPEN PALM")) {
    obj1 = objectAtPoint(pen);
  }
  if (hoverLock && obj1 !== hoverLock) hoverLock = null;
  if (!obj1 || obj1 === hoverLock) {
    hoverObj = null;
  } else if (obj1 !== hoverObj || !hoverStartPos || dist(pen, hoverStartPos) > HOVER_TOL) {
    hoverObj = obj1;
    hoverStartMs = nowMs;
    hoverStartPos = { x: pen.x, y: pen.y };
  } else if (nowMs - hoverStartMs >= SELECT_HOLD_MS) {
    toggleSelect(obj1, pen);
    hoverLock = obj1;
    hoverObj = null;
  }

  // Hand 2 Hover Select
  let obj2 = null;
  const overBtn2 = (typeof toolbarPanelAt === "function" && showBar && h2.pen) ? toolbarPanelAt(h2.pen) : null;
  if (h2.pen && !h2.pinching && !h2.grab && !overBtn2 && !(h2.candPose && h2.candPose !== "OPEN PALM")) {
    obj2 = objectAtPoint(h2.pen);
  }
  if (h2.hoverLock && obj2 !== h2.hoverLock) h2.hoverLock = null;
  if (!obj2 || obj2 === h2.hoverLock) {
    h2.hoverObj = null;
  } else if (obj2 !== h2.hoverObj || !h2.hoverStartPos || dist(h2.pen, h2.hoverStartPos) > HOVER_TOL) {
    h2.hoverObj = obj2;
    h2.hoverStartMs = nowMs;
    h2.hoverStartPos = { x: h2.pen.x, y: h2.pen.y };
  } else if (nowMs - h2.hoverStartMs >= SELECT_HOLD_MS) {
    toggleSelect(obj2, h2.pen);
    h2.hoverLock = obj2;
    h2.hoverObj = null;
  }
}

function clearMoves() {
  selected.clear();
  hoverObj = null;
  h2.hoverObj = null;
  restoreGrabMass(grabbed);
  restoreGrabMass2(h2.grab);
  grabbed = null;
  grabCandidate = null;
  h2.grab = null;
  h2.grabCandidate = null;
  tabHold = null;
  h2.tabHold = null;
  mergeCandidate = null;
  mergeProgress = 0;
  demergeCandidate = null;
  demergeProgress = 0;
  scaleSession = null;
  lastMoved = null;
  returns = [];
  if (typeof syncButtons === "function") syncButtons();
}

function pinObject(o) {
  if (o.body && !o.body.isStatic) Body.setStatic(o.body, true);
  o.pinned = true;
}

function unpinObject(o) {
  if (o.pinned && o.body && o.body.isStatic && o.kind !== "spiral") Body.setStatic(o.body, false);
  o.pinned = false;
}

function startReturn(o) {
  const t0 = performance.now();
  returns = returns.filter((r) => r.obj !== o);
  if (o.body && o.origin) {
    const b = o.body;
    const diff = (((o.origin.angle - b.angle + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    pinObject(o);
    returns.push({
      obj: o,
      dynamic: true,
      t0: t0,
      from: { x: b.position.x, y: b.position.y, angle: b.angle },
      to: { x: o.origin.x, y: o.origin.y },
      angleDiff: diff
    });
  } else {
    returns.push({
      obj: o,
      dynamic: false,
      t0: t0,
      dx: -(o.shiftX || 0),
      dy: -(o.shiftY || 0),
      ePrev: 0
    });
  }
}

function reverseMove() {
  const targets = [];
  if (selected.size > 0) {
    for (const o of selected) if (canEditObject(o)) targets.push(o);
  } else if (lastMoved && objects.includes(lastMoved) && canEditObject(lastMoved)) {
    targets.push(lastMoved);
    selected.add(lastMoved);
  }
  for (const o of targets) startReturn(o);
  if (typeof syncButtons === "function") syncButtons();
}

function updateReturns(nowMs) {
  for (let i = returns.length - 1; i >= 0; i--) {
    const r = returns[i];
    if (!objects.includes(r.obj)) {
      returns.splice(i, 1);
      continue;
    }
    const t = Math.min(1, (nowMs - r.t0) / RETURN_MS);
    const e = t * t * (3 - 2 * t);
    if (r.dynamic && r.obj.body) {
      const b = r.obj.body;
      Body.setPosition(b, {
        x: r.from.x + (r.to.x - r.from.x) * e,
        y: r.from.y + (r.to.y - r.from.y) * e
      });
      Body.setAngle(b, r.from.angle + r.angleDiff * e);
      Body.setVelocity(b, { x: 0, y: 0 });
      Body.setAngularVelocity(b, 0);
    } else {
      const d = e - r.ePrev;
      shiftStatic(r.obj, r.dx * d, r.dy * d);
      r.ePrev = e;
    }
    sendObjectMove(r.obj, t >= 1);
    if (t >= 1) {
      returns.splice(i, 1);
    }
  }
}

function applyFloat(nowMs) {
  const g = 0.001;
  const topZone = canvas.height * 0.12;
  for (const o of objects) {
    if (!o.floating || !o.body || o.body.isStatic) continue;
    if ((grabbed && grabbed.obj === o) || (h2.grab && h2.grab.obj === o)) continue;
    const b = o.body;
    let fy = -b.mass * (gravityOn ? 1.25 * g : 0.3 * g);
    if (b.position.y < topZone) {
      fy = gravityOn ? -b.mass * g : 0;
      Body.setVelocity(b, { x: b.velocity.x, y: b.velocity.y * 0.85 });
    }
    const sway = Math.sin(nowMs / 700 + b.id) * 0.00004 * b.mass;
    Body.applyForce(b, b.position, { x: sway, y: fy });
  }
}

function setFloating(o, on) {
  if (o.kind === "spiral") return;
  o.floating = on;
  if (o.body) o.body.frictionAir = on ? 0.035 : 0.01;
  if (on && o.pinned) unpinObject(o);
}

function floatSelected(mode) {
  const targets = Array.from(selected).filter((o) =>
    objects.includes(o) && canEditObject(o) && o.body && o.kind !== "spiral"
  );
  if (targets.length === 0) {
    if (typeof showToast === "function") showToast("Select a movable object first");
    return;
  }
  const on = mode === "on" ? true : (mode === "off" ? false : !targets.every((o) => o.floating));
  for (const o of targets) {
    setFloating(o, on);
    sendObjectMove(o);
  }
  if (typeof showToast === "function") showToast(on ? "Floating" : "Falling");
  if (typeof syncButtons === "function") syncButtons();
}

function worldPoints(o) {
  if (!o.body || !o.local) return o.raw || [];
  const b = o.body;
  const c = Math.cos(b.angle);
  const s = Math.sin(b.angle);
  return o.local.map((p) => ({
    x: b.position.x + p.x * c - p.y * s,
    y: b.position.y + p.x * s + p.y * c
  }));
}

function shatter(o) {
  const pts = o.kind === "platform" ? o.raw : worldPoints(o);
  if (!pts || pts.length === 0) return;
  let cx = 0, cy = 0;
  for (const p of pts) { cx += p.x; cy += p.y; }
  cx /= pts.length; cy /= pts.length;
  const step = Math.max(1, Math.floor(pts.length / 40));
  for (let i = 0; i < pts.length; i += step) {
    if (particles.length >= MAX_PARTICLES) break;
    const p = pts[i];
    const a = Math.atan2(p.y - cy, p.x - cx) + (Math.random() - 0.5) * 0.8;
    const sp = 2 + Math.random() * 5;
    particles.push({
      x: p.x,
      y: p.y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp - 1.5,
      life: 0,
      max: 40 + Math.random() * 35,
      hue: o.hue,
      color: o.color
    });
  }
}

function destroySelected() {
  const targets = Array.from(selected).filter((o) => objects.includes(o) && canEditObject(o));
  if (targets.length === 0) {
    if (typeof showToast === "function") showToast("Select an object first");
    return;
  }
  if (grabbed && targets.includes(grabbed.obj)) releaseGrab();
  if (h2.grab && targets.includes(h2.grab.obj)) releaseGrab2();
  for (const o of targets) {
    shatter(o);
    removeObject(o);
  }
  if (typeof playTone === "function") playTone(160, 0.2);
  if (typeof showToast === "function") showToast(targets.length === 1 ? "Destroyed" : "Destroyed " + targets.length);
  if (typeof syncButtons === "function") syncButtons();
}

function cloneObject(o) {
  const W = canvas.width;
  const H = canvas.height;
  if (o.isMerged) {
    const data = serObj(o);
    const points = data.components.flatMap((part) => part.v || []);
    const bb = boundsOf(points);
    const dx = bb.maxX + 44 > W ? -44 : 44;
    const dy = bb.maxY + 44 > H - 4 ? -44 : 44;
    const move = (arr) => (arr || []).map((point) => ({ x: point.x + dx, y: point.y + dy }));
    const components = data.components.map((part) => ({
      ...part,
      v: move(part.v),
      s: move(part.s)
    }));
    const made = addCompoundObject(components);
    if (made) {
      const clone = objects[objects.length - 1];
      clone.hue = o.hue;
      clone.scaleMultiplier = o.scaleMultiplier || 1;
      assignLocalObjectIdentity(clone);
      sendObjectCreation(clone);
    }
    return made;
  }
  let visual = null;
  let shape = null;
  if (o.kind === "platform") {
    visual = o.raw.map((p) => ({ x: p.x, y: p.y }));
  } else {
    const b = o.body;
    const c = Math.cos(b.angle);
    const s = Math.sin(b.angle);
    const toWorld = (arr) => arr.map((p) => ({
      x: b.position.x + p.x * c - p.y * s,
      y: b.position.y + p.x * s + p.y * c
    }));
    visual = toWorld(o.local);
    if (o.kind === "solid") {
      if (!o.polyLocal) return false;
      shape = toWorld(o.polyLocal);
    } else {
      if (!o.lineLocal) return false;
      shape = toWorld(o.lineLocal);
    }
  }
  if (!visual || visual.length < 2) return false;

  const bb = boundsOf(visual);
  const dx = bb.maxX + 44 > W ? -44 : 44;
  const dy = bb.maxY + 44 > H - 4 ? -44 : 44;
  const move = (arr) => arr.map((p) => ({ x: p.x + dx, y: p.y + dy }));
  visual = move(visual);

  let made = false;
  if (o.kind === "solid") {
    if (o.shapeType === "Circle") {
      const movedPoly = move(shape);
      const c = centroid(movedPoly);
      const r = Math.max(12, (bb.w + bb.h) / 4);
      made = addCircleObject(visual, { center: c, radius: r, poly: movedPoly });
    } else {
      made = addSolid(visual, move(shape), o.shapeType, o.behaviorText);
    }
  } else if (o.kind === "spring") {
    made = addSpring(visual, move(shape));
  } else if (o.kind === "cup") {
    made = addCup(visual, move(shape));
  } else if (o.kind === "spiral") {
    const movedCenter = { x: o.body.position.x + dx, y: o.body.position.y + dy };
    made = addSpiralWell(visual, { center: movedCenter, radius: o.wellRadius, dir: o.spiralDir });
  } else if (o.kind === "line") {
    made = addFallingLine(visual, move(shape), o.shapeType);
  } else {
    made = addPlatform(visual, simplifyCapped(visual, PLATFORM_EPSILON, MAX_SEGMENTS + 1), o.shapeType);
  }
  if (made) {
    const clone = objects[objects.length - 1];
    clone.hue = o.hue;
    clone.color = o.color;
    assignLocalObjectIdentity(clone);
    sendObjectCreation(clone);
  }
  return made;
}

function cloneSelected() {
  const targets = Array.from(selected).filter((o) => objects.includes(o));
  if (targets.length === 0) {
    if (typeof showToast === "function") showToast("Select an object first");
    return;
  }
  let n = 0;
  for (const o of targets) {
    if (cloneObject(o)) n++;
  }
  trimObjects();
  if (typeof showToast === "function") showToast(n === 1 ? "Cloned" : "Cloned " + n);
  if (typeof syncButtons === "function") syncButtons();
}

function angDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

function rotateHeld(b, k, ang) {
  if (!rotateOn || ang === null || k.h0 === null || k.h0 === undefined) {
    Body.setAngularVelocity(b, b.angularVelocity * 0.8);
    return;
  }
  const target = k.b0 + (ang - k.h0) * rotGain;
  const d = Math.max(-1.2, Math.min(1.2, target - b.angle));
  Body.setAngularVelocity(b, Math.max(-0.35, Math.min(0.35, d * 0.25)));
}

function driveHeldPaused() {
  const follow = (b, k, tx, ty, ang) => {
    Body.setPosition(b, {
      x: b.position.x + (tx - b.position.x) * 0.35,
      y: b.position.y + (ty - b.position.y) * 0.35
    });
    Body.setVelocity(b, { x: 0, y: 0 });
    Body.setAngularVelocity(b, 0);
    if (rotateOn && ang !== null && k.h0 !== null && k.h0 !== undefined) {
      const target = k.b0 + (ang - k.h0) * rotGain;
      Body.setAngle(b, b.angle + (target - b.angle) * 0.35);
    }
  };
  if (grabbed && grabbed.dynamic && objects.includes(grabbed.obj) && grabbed.obj.body && (penVis || pen)) {
    const pv = penVis || pen;
    follow(grabbed.obj.body, grabbed, pv.x + grabbed.offX, pv.y + grabbed.offY, handAng);
    sendObjectMove(grabbed.obj);
  }
  const k2 = h2.grab;
  if (k2 && !k2.st && h2.pen && objects.includes(k2.obj) && k2.obj.body) {
    const pv2 = h2.vis || h2.pen;
    follow(k2.obj.body, k2, pv2.x + k2.offX, pv2.y + k2.offY, h2.ang);
    sendObjectMove(k2.obj);
  }
}

function linkSelected() {
  const t = Array.from(selected).filter((o) => o.body && !o.body.isStatic);
  if (t.length !== 2) {
    if (typeof showToast === "function") showToast("Select 2 movable objects");
    return;
  }
  const a = t[0].body, b = t[1].body;
  const d = Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y);
  const o = {
    bodyA: a,
    bodyB: b,
    damping: 0.05,
    length: d,
    stiffness: linkType === "Spring" ? 0.02 : 0.9
  };
  if (linkType === "Hinge") {
    const mx = (a.position.x + b.position.x) / 2, my = (a.position.y + b.position.y) / 2;
    const loc = (bd) => {
      const dx = mx - bd.position.x, dy = my - bd.position.y;
      const c = Math.cos(-bd.angle), s = Math.sin(-bd.angle);
      return { x: dx * c - dy * s, y: dx * s + dy * c };
    };
    o.pointA = loc(a);
    o.pointB = loc(b);
    o.length = 0;
    o.stiffness = 1;
  }
  const c = Matter.Constraint.create(o);
  Composite.add(world, c);
  links.push({ c: c, a: t[0], b: t[1] });
  if (typeof showToast === "function") showToast(linkType + " linked");
}

function unlinkSelected() {
  let n = 0;
  for (let i = links.length - 1; i >= 0; i--) {
    if (selected.has(links[i].a) || selected.has(links[i].b)) {
      Composite.remove(world, links[i].c);
      links.splice(i, 1);
      n++;
    }
  }
  if (typeof showToast === "function") showToast(n ? "Unlinked" : "No links on selection");
}
