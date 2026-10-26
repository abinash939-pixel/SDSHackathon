(() => {
  const SHAPES = ["Circle", "Triangle", "Zigzag", "Cup"];
  const MAX_PARTICLES = 180;
  const STARTING_LIVES = 5;
  const SEGMENT_WINDOW_MS = 10000;
  let gameCanvas = null;
  let previousDrawMode = null;
  let controls = null;
  let score = 0;
  let lives = STARTING_LIVES;
  let targets = [];
  let particles = [];
  let collisionHandler = null;
  let restartButton = null;
  let gameOver = false;
  let nextSpawnAt = 0;
  let lastUpdateAt = 0;
  let initialObjects = new Set();
  let mismatchedObjects = new Set();
  let originalObjectStyles = new Map();
  let originalCanvasTransform = "";
  let shakeUntil = 0;

  function normalizedShape(shapeType) {
    const label = String(shapeType || "").trim().toLowerCase();
    if (label === "circle") return "Circle";
    if (label === "triangle") return "Triangle";
    if (label === "zigzag") return "Zigzag";
    if (label === "cup") return "Cup";
    return null;
  }

  function targetInterval() {
    return Math.max(850, 2400 - score * 5);
  }

  function targetSpeed() {
    return Math.min(4.2, 0.81 + score / (125 / 0.6));
  }

  function targetRadius() {
    return Math.min(Math.max(1, gameCanvas.width / 2 - 12),
      Math.max(48, Math.min(72, gameCanvas.width * 0.078)));
  }

  function segmentJoinDistance() {
    return Math.min(72, Math.max(28, gameCanvas.width * 0.06));
  }

  function createTarget(nowMs) {
    const shape = SHAPES[Math.floor(Math.random() * SHAPES.length)];
    const radius = targetRadius();
    const margin = radius + 12;
    const x = margin + Math.random() * Math.max(1, gameCanvas.width - margin * 2);
    const y = -radius;
    const options = {
      isSensor: true,
      frictionAir: 0,
      friction: 0,
      restitution: 0,
      density: 0.001,
      label: "Shape Sorter target " + shape
    };
    let body;
    if (shape === "Circle") {
      body = Matter.Bodies.circle(x, y, radius, options);
    } else if (shape === "Triangle") {
      body = Matter.Bodies.polygon(x, y, 3, radius, options);
    } else {
      body = Matter.Bodies.rectangle(x, y, radius * 1.6, radius * 1.15, options);
    }
    body.plugin = body.plugin || {};
    body.plugin.shapeSorterTarget = true;
    body.plugin.shapeSorterShape = shape;
    Matter.Composite.add(world, body);
    targets.push({ body: body, shape: shape, radius: radius, speed: targetSpeed(), bornAt: nowMs });
  }

  function removeTarget(target) {
    const index = targets.indexOf(target);
    if (index < 0) return;
    Matter.Composite.remove(world, target.body);
    targets.splice(index, 1);
  }

  function bodyRoot(body) {
    return body && (body.parent || body);
  }

  function objectForBody(body) {
    if (typeof objects === "undefined") return null;
    const root = bodyRoot(body);
    return objects.find((item) => Array.isArray(item.bodies) &&
      item.bodies.some((part) => part === body || bodyRoot(part) === root)) || null;
  }

  function targetForBody(body) {
    const root = bodyRoot(body);
    return targets.find((target) => target.body === body || bodyRoot(target.body) === root) || null;
  }

  function strokePoints(item) {
    const points = Array.isArray(item.raw) ? item.raw : item.simple;
    return Array.isArray(points) ? points.filter((point) =>
      point && Number.isFinite(point.x) && Number.isFinite(point.y)
    ) : [];
  }

  function segmentedShapeFor(seed, nowMs) {
    if (!seed || seed.kind !== "platform" || typeof classifyShape !== "function") return null;
    const joinDistance = segmentJoinDistance();
    const eligible = objects.filter((item) => item && item.kind === "platform" &&
      !initialObjects.has(item) && canEditObject(item) &&
      nowMs - (Number.isFinite(item.born) ? item.born : nowMs) <= SEGMENT_WINDOW_MS &&
      strokePoints(item).length >= 2);
    const group = [seed];
    const endpoints = (item) => {
      const points = strokePoints(item);
      return [points[0], points[points.length - 1]];
    };
    let changed = true;
    while (changed) {
      changed = false;
      const groupEnds = group.flatMap(endpoints);
      for (const candidate of eligible) {
        if (group.includes(candidate)) continue;
        if (endpoints(candidate).some((point) =>
          groupEnds.some((end) => Math.hypot(point.x - end.x, point.y - end.y) <= joinDistance)
        )) {
          group.push(candidate);
          changed = true;
        }
      }
    }
    if (group.length < 2) return null;

    const matchedSegments = group.slice();
    const ordered = [group.shift()];
    const pointsFor = (item) => strokePoints(item).map((point) => ({ x: point.x, y: point.y }));
    let path = pointsFor(ordered[0]);
    while (group.length) {
      let bestIndex = -1;
      let bestDistance = Infinity;
      let prepend = false;
      let reverse = false;
      for (let index = 0; index < group.length; index++) {
        const candidatePoints = pointsFor(group[index]);
        if (candidatePoints.length < 2) continue;
        const options = [
          { distance: Math.hypot(path[path.length - 1].x - candidatePoints[0].x,
            path[path.length - 1].y - candidatePoints[0].y), prepend: false, reverse: false },
          { distance: Math.hypot(path[path.length - 1].x - candidatePoints[candidatePoints.length - 1].x,
            path[path.length - 1].y - candidatePoints[candidatePoints.length - 1].y), prepend: false, reverse: true },
          { distance: Math.hypot(path[0].x - candidatePoints[candidatePoints.length - 1].x,
            path[0].y - candidatePoints[candidatePoints.length - 1].y), prepend: true, reverse: false },
          { distance: Math.hypot(path[0].x - candidatePoints[0].x,
            path[0].y - candidatePoints[0].y), prepend: true, reverse: true }
        ];
        for (const option of options) {
          if (option.distance < bestDistance) {
            bestDistance = option.distance;
            bestIndex = index;
            prepend = option.prepend;
            reverse = option.reverse;
          }
        }
      }
      if (bestIndex < 0 || bestDistance > joinDistance) break;
      let next = pointsFor(group.splice(bestIndex, 1)[0]);
      if (reverse) next.reverse();
      path = prepend ? next.slice(0, -1).concat(path) : path.concat(next.slice(1));
    }
    if (group.length) return null;
    const classification = classifyShape(path);
    return classification && classification.label
      ? { shape: normalizedShape(classification.label), objects: matchedSegments }
      : null;
  }

  function burst(x, y, color, count) {
    for (let i = 0; i < count && particles.length < MAX_PARTICLES; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 6;
      particles.push({
        x: x,
        y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0,
        maxLife: 25 + Math.random() * 24,
        color: color
      });
    }
    if (typeof spawnSparks === "function") {
      spawnSparks(x, y, 32);
      spawnSparks(x - 12, y + 8, 28);
      spawnSparks(x + 12, y - 8, 28);
    }
  }

  function removeDrawnObject(item) {
    if (!item || typeof removeObject !== "function") return;
    if (typeof canEditObject === "function" && !canEditObject(item)) return;
    removeObject(item);
  }

  function onMatch(target, item, matchedSegments) {
    const point = target.body.position;
    removeTarget(target);
    for (const segment of matchedSegments || [item]) removeDrawnObject(segment);
    burst(point.x, point.y, "#78ff91", 48);
    score += 50;
    if (typeof playTone === "function") {
      playTone(880, 0.1);
      playTone(1175, 0.16);
    }
  }

  function onMismatch(target, item, segments = [item]) {
    if (mismatchedObjects.has(item)) return;
    for (const segment of segments) {
      mismatchedObjects.add(segment);
      removeDrawnObject(segment);
    }
    if (typeof playTone === "function") playTone(170, 0.12);
    if (typeof spawnSparks === "function") spawnSparks(target.body.position.x, target.body.position.y, 8);
  }

  function onCollisionStart(event) {
    if (gameOver) return;
    for (const pair of event.pairs) {
      const target = targetForBody(pair.bodyA) || targetForBody(pair.bodyB);
      if (!target) continue;
      const drawnBody = targetForBody(pair.bodyA) ? pair.bodyB : pair.bodyA;
      const item = objectForBody(drawnBody);
      if (!item || initialObjects.has(item) || mismatchedObjects.has(item) ||
          (typeof canEditObject === "function" && !canEditObject(item))) continue;
      const segmented = item.kind === "platform" ? segmentedShapeFor(item, performance.now()) : null;
      if (normalizedShape(item.shapeType) === target.shape) onMatch(target, item);
      else if (segmented && segmented.shape === target.shape) onMatch(target, item, segmented.objects);
      else if (segmented) onMismatch(target, item, segmented.objects);
      else if (item.kind !== "platform" ||
          performance.now() - (Number.isFinite(item.born) ? item.born : 0) > SEGMENT_WINDOW_MS) {
        onMismatch(target, item);
      }
    }
  }

  function loseLife(target) {
    if (gameOver) return;
    removeTarget(target);
    lives = Math.max(0, lives - 1);
    shakeUntil = performance.now() + 280;
    if (typeof playTone === "function") playTone(95, 0.28);
    if (typeof spawnSparks === "function") spawnSparks(gameCanvas.width / 2, gameCanvas.height - 8, 20);
    if (lives === 0) {
      gameOver = true;
      if (restartButton) restartButton.hidden = false;
    }
  }

  function restoreObjectStyles() {
    for (const [item, style] of originalObjectStyles) {
      if (!item || (typeof objects !== "undefined" && !objects.includes(item))) continue;
      item.color = style.color;
      item.hue = style.hue;
      item.behaviorText = style.behaviorText;
    }
    originalObjectStyles.clear();
    mismatchedObjects.clear();
  }

  function resetGame() {
    for (const target of targets.slice()) removeTarget(target);
    restoreObjectStyles();
    score = 0;
    lives = STARTING_LIVES;
    gameOver = false;
    particles = [];
    nextSpawnAt = performance.now();
    lastUpdateAt = 0;
    initialObjects = new Set(typeof objects === "undefined" ? [] : objects);
    if (restartButton) restartButton.hidden = true;
  }

  function createControls(context) {
    controls = context.controls;
    if (!controls) return;
    restartButton = document.createElement("button");
    restartButton.type = "button";
    restartButton.className = "game-control-button";
    restartButton.textContent = "Restart Shape Sorter";
    restartButton.hidden = true;
    restartButton.addEventListener("click", resetGame);
    controls.appendChild(restartButton);
  }

  function init(context) {
    previousDrawMode = typeof drawModeOn === "undefined" ? null : drawModeOn;
    if (typeof window.setDrawMode === "function") window.setDrawMode(true);
    gameCanvas = context.canvas;
    controls = context.controls;
    score = 0;
    lives = STARTING_LIVES;
    targets = [];
    particles = [];
    gameOver = false;
    nextSpawnAt = performance.now();
    lastUpdateAt = 0;
    initialObjects = new Set(typeof objects === "undefined" ? [] : objects);
    mismatchedObjects = new Set();
    originalObjectStyles = new Map();
    originalCanvasTransform = gameCanvas.style.transform;
    shakeUntil = 0;
    createControls(context);
    collisionHandler = onCollisionStart;
    Matter.Events.on(engine, "collisionStart", collisionHandler);
    Matter.Events.on(engine, "collisionActive", collisionHandler);
  }

  function update(nowMs) {
    if (gameOver || !gameCanvas) return;
    if (nowMs >= nextSpawnAt) {
      createTarget(nowMs);
      nextSpawnAt = nowMs + targetInterval();
    }
    for (const target of targets.slice()) {
      Matter.Body.setVelocity(target.body, { x: 0, y: target.speed });
      if (target.body.position.y - target.radius > gameCanvas.height) loseLife(target);
    }
    const dt = Math.min(50, Math.max(0, nowMs - (lastUpdateAt || nowMs))) / 16.667;
    lastUpdateAt = nowMs;
    const particleDrag = Math.pow(0.98, dt);
    let liveParticles = 0;
    for (let index = 0; index < particles.length; index++) {
      const particle = particles[index];
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vy += 0.1 * dt;
      particle.vx *= particleDrag;
      particle.life += dt;
      if (particle.life < particle.maxLife) particles[liveParticles++] = particle;
    }
    particles.length = liveParticles;
    if (nowMs < shakeUntil) {
      const offset = Math.round((Math.random() - 0.5) * 8);
      gameCanvas.style.transform = "translate3d(" + offset + "px, 0, 0)";
    } else if (gameCanvas.style.transform !== originalCanvasTransform) {
      gameCanvas.style.transform = originalCanvasTransform;
    }
  }

  function drawTarget(context, target) {
    const x = target.body.position.x;
    const y = target.body.position.y;
    const r = target.radius;
    context.save();
    context.beginPath();
    if (target.shape === "Circle") {
      context.arc(x, y, r, 0, Math.PI * 2);
    } else if (target.shape === "Triangle") {
      context.moveTo(x, y - r);
      context.lineTo(x + r * 0.88, y + r * 0.65);
      context.lineTo(x - r * 0.88, y + r * 0.65);
      context.closePath();
    } else if (target.shape === "Zigzag") {
      context.moveTo(x - r, y + r * 0.45);
      context.lineTo(x - r * 0.5, y - r * 0.45);
      context.lineTo(x, y + r * 0.45);
      context.lineTo(x + r * 0.5, y - r * 0.45);
      context.lineTo(x + r, y + r * 0.45);
    } else {
      context.moveTo(x - r * 0.85, y - r * 0.55);
      context.lineTo(x - r * 0.65, y + r * 0.55);
      context.lineTo(x + r * 0.65, y + r * 0.55);
      context.lineTo(x + r * 0.85, y - r * 0.55);
    }
    context.strokeStyle = "#e5fbff";
    context.lineWidth = 4;
    context.shadowColor = "#64f5ff";
    context.shadowBlur = 20;
    context.setLineDash([8, 5]);
    context.stroke();
    context.restore();
  }

  function render(context) {
    if (!gameCanvas) return;
    for (const target of targets) drawTarget(context, target);
    for (const particle of particles) {
      context.save();
      context.globalAlpha = Math.max(0, 1 - particle.life / particle.maxLife);
      context.fillStyle = particle.color;
      context.shadowColor = particle.color;
      context.shadowBlur = 12;
      context.fillRect(particle.x - 2, particle.y - 2, 4, 4);
      context.restore();
    }

    context.save();
    context.textAlign = "center";
    context.textBaseline = "top";
    context.font = "bold 20px 'Courier New', monospace";
    context.fillStyle = "#f6fbff";
    context.shadowColor = "#64f5ff";
    context.shadowBlur = 12;
    context.fillText("SCORE: " + score, gameCanvas.width / 2, 14);
    context.fillStyle = "#ff7b93";
    context.font = "bold 18px 'Courier New', monospace";
    context.fillText("LIVES: " + "\u2665".repeat(lives) + "\u2661".repeat(STARTING_LIVES - lives),
      gameCanvas.width / 2, 40);
    let currentTarget = null;
    for (const target of targets) {
      if (!currentTarget || target.body.position.y > currentTarget.body.position.y) currentTarget = target;
    }
    if (currentTarget && !gameOver) {
      context.fillStyle = "#ffe27a";
      context.font = "bold 17px 'Courier New', monospace";
      context.fillText("DRAW A " + currentTarget.shape.toUpperCase() + "!", gameCanvas.width / 2, 66);
    }
    if (gameOver) {
      context.fillStyle = "#ff315f";
      context.font = "bold 50px 'Courier New', monospace";
      context.shadowColor = "#ff1744";
      context.shadowBlur = 24;
      context.fillText("GAME OVER", gameCanvas.width / 2, gameCanvas.height * 0.43);
      context.font = "bold 18px 'Courier New', monospace";
      context.fillStyle = "#ffffff";
      context.fillText("FINAL SCORE: " + score, gameCanvas.width / 2, gameCanvas.height * 0.43 + 58);
    }
    context.restore();
  }

  function unload() {
    if (previousDrawMode !== null && typeof window.setDrawMode === "function") {
      window.setDrawMode(previousDrawMode);
    }
    previousDrawMode = null;
    if (collisionHandler) Matter.Events.off(engine, "collisionStart", collisionHandler);
    if (collisionHandler) Matter.Events.off(engine, "collisionActive", collisionHandler);
    collisionHandler = null;
    for (const target of targets) Matter.Composite.remove(world, target.body);
    targets = [];
    restoreObjectStyles();
    if (gameCanvas) gameCanvas.style.transform = originalCanvasTransform;
    if (restartButton) restartButton.remove();
    restartButton = null;
    controls = null;
    gameCanvas = null;
    particles = [];
    initialObjects.clear();
    gameOver = false;
    lastUpdateAt = 0;
  }

  window.GameEngine.registerGame({
    isComplete: () => gameOver,
    id: "shape-sorter",
    name: "Quick-Draw Shape Sorter",
    init: init,
    update: update,
    render: render,
    unload: unload
  });
})();
