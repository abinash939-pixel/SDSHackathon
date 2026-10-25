(() => {
  const BASE_COLOR = "#42f5ff";
  const ASTEROID_COLOR = "#ffb347";
  const LASER_COLOR = "#ff315f";
  const ASTEROID_MIN_DELAY = 2600;
  const ASTEROID_MAX_DELAY = 3800;
  const ASTEROID_LIMIT = 18;
  const LASER_LIMIT = 12;
  const LASER_SPEED = 30;
  const AIM_LENGTH_RATIO = 0.9;
  const AIM_WIDTH = 3;
  const HAND_TIMEOUT_MS = 200;
  const LASER_LIFETIME_MS = 2400;
  const asteroidByBody = new Map();
  const laserByBody = new Map();
  const aimBodies = [];
  const aimEnd = { x: 0, y: 0 };
  const posePoints = Array.from({ length: 21 }, () => ({ x: 0, y: 0 }));
  const AIM_DASH = [12, 9];
  const NO_DASH = [];
  let gameCanvas = null;
  let previousDrawMode = null;
  let base = null;
  let asteroids = [];
  let lasers = [];
  let particles = [];
  let score = 0;
  let health = 5;
  let nextSpawnAt = 0;
  let gameOver = false;
  let collisionHandler = null;
  let hands = [];
  let restartButton = null;
  let resultPanel = null;
  let resultTitle = null;
  let resultScore = null;
  let openPalmSince = null;

  let round = 0;
  let losingPlayer = null;
  let resultText = "GAME OVER";
  const readyPlayers = new Set();

  function connected() {
    return typeof window.isMultiplayerConnected === "function" && window.isMultiplayerConnected();
  }

  function localId() {
    return window.sharedSpace ? window.sharedSpace.localOwnerId : "local";
  }

  function authority() {
    return !connected() || window.isMinigameAuthority();
  }

  function stopRound() {
    gameOver = true;
    nextSpawnAt = Infinity;
    openPalmSince = null;
    while (asteroids.length) removeAsteroid(asteroids[asteroids.length - 1]);
    while (lasers.length) removeLaser(lasers[lasers.length - 1]);
  }

  function showResult(loser) {
    losingPlayer = loser;
    stopRound();
    resultText = loser === localId() ? "YOU LOSE!" : "YOU WIN!";
    if (restartButton) {
      restartButton.hidden = false;
      restartButton.disabled = false;
      restartButton.textContent = "Play again";
    }
    showResultPanel();
    if (typeof showToast === "function") showToast(resultText);
  }

  function handleEvent(event, ownerId) {
    if (!connected() || !event || !Number.isInteger(event.round)) return;
    const trusted = ownerId === window.sharedSpace.authorityOwnerId;
    if (event.type === "asteroid-replay" && trusted && event.round === round + 1 && losingPlayer &&
        restartButton && restartButton.disabled) {
      round = event.round;
      restartGame();
      return;
    }
    if (event.round !== round) return;
    if (event.type === "asteroid-defeat" && authority() && !losingPlayer) {
      showResult(ownerId);
      window.GameEngine.sendGameEvent({ type: "asteroid-result", round: round, loser: ownerId });
    } else if (event.type === "asteroid-result" && trusted && !losingPlayer &&
        (event.loser === localId() || event.loser === window.sharedSpace.remoteOwnerId)) {
      showResult(event.loser);
    } else if (event.type === "asteroid-ready" && authority() && losingPlayer) {
      readyPlayers.add(ownerId);
      if (readyPlayers.has(localId()) && readyPlayers.has(window.sharedSpace.remoteOwnerId)) {
        window.GameEngine.sendGameEvent({ type: "asteroid-replay", round: round + 1 });
        round++;
        restartGame();
      }
    }
  }

  function requestReplay() {
    if (!connected()) {
      restartGame();
      return;
    }
    if (!losingPlayer || restartButton.disabled) return;
    restartButton.disabled = true;
    restartButton.textContent = "Waiting for your friend…";
    const event = { type: "asteroid-ready", round: round };
    if (authority()) handleEvent(event, localId());
    else window.GameEngine.sendGameEvent(event);
  }

  function tagBody(body, kind) {
    body.plugin = body.plugin || {};
    body.plugin.asteroidShooterKind = kind;
  }

  function addWorldObject(object) {
    objects.push(object);
    return object;
  }

  function removeWorldObject(object) {
    if (!object) return;
    for (const body of object.bodies || []) Matter.Composite.remove(world, body);
    const index = objects.indexOf(object);
    if (index >= 0) objects.splice(index, 1);
    if (typeof selected !== "undefined") selected.delete(object);
    if (typeof grabbed !== "undefined" && grabbed && grabbed.obj === object) grabbed = null;
    if (typeof h2 !== "undefined" && h2.grab && h2.grab.obj === object) h2.grab = null;
  }

  function makeBase() {
    const width = Math.min(gameCanvas.width * 0.48, 460);
    const height = Math.max(24, gameCanvas.height * 0.055);
    const x = gameCanvas.width / 2;
    const y = gameCanvas.height - height / 2 - 2;
    const body = Matter.Bodies.rectangle(x, y, width, height, {
      isStatic: true,
      friction: 0.85,
      restitution: 0.35,
      label: "Asteroid Shooter base"
    });
    tagBody(body, "base");
    Matter.Composite.add(world, body);
    const local = [
      { x: -width / 2, y: -height / 2 },
      { x: width / 2, y: -height / 2 },
      { x: width / 2, y: height / 2 },
      { x: -width / 2, y: height / 2 }
    ];
    base = addWorldObject({
      kind: "solid",
      shapeType: "Defense Base",
      gameRole: "asteroid-base",
      behaviorText: "Defense Base",
      hue: 185,
      color: BASE_COLOR,
      body: body,
      bodies: [body],
      local: local,
      polyLocal: local.map((point) => ({ x: point.x, y: point.y })),
      raw: local.map((point) => ({ x: x + point.x, y: y + point.y })),
      born: performance.now()
    });
  }

  function spawnAsteroid(nowMs) {
    if (gameOver || asteroids.length >= ASTEROID_LIMIT) return;
    const radius = 24 + Math.random() * 24;
    const x = radius + Math.random() * Math.max(1, gameCanvas.width - radius * 2);
    const y = -radius - 8;
    const sides = 9 + Math.floor(Math.random() * 4);
    const vertices = [];
    for (let index = 0; index < sides; index++) {
      const angle = index * Math.PI * 2 / sides;
      const distance = radius * (0.72 + Math.random() * 0.48);
      vertices.push({
        x: x + Math.cos(angle) * distance,
        y: y + Math.sin(angle) * distance
      });
    }
    const body = Matter.Bodies.fromVertices(x, y, [vertices], {
      density: 0.004 + Math.random() * 0.003,
      friction: 0.72,
      frictionAir: 0.004,
      restitution: 0.22,
      label: "Falling asteroid"
    }, true);
    if (!body) return;
    tagBody(body, "asteroid");
    Matter.Composite.add(world, body);
    const local = vertices.map((point) => ({
      x: point.x - body.position.x,
      y: point.y - body.position.y
    }));
    const asteroid = addWorldObject({
      kind: "solid",
      shapeType: "Asteroid",
      gameRole: "asteroid-enemy",
      behaviorText: "Falling Asteroid",
      hue: 28,
      color: ASTEROID_COLOR,
      body: body,
      bodies: [body],
      local: local,
      polyLocal: local.map((point) => ({ x: point.x, y: point.y })),
      raw: vertices.map((point) => ({ x: point.x, y: point.y })),
      born: nowMs
    });
    const vx = (Math.random() - 0.5) * 3;
    const vy = 0.9 + Math.random() * 1.7;
    Matter.Body.setVelocity(body, { x: vx, y: vy });
    Matter.Body.setAngularVelocity(body, (Math.random() - 0.5) * 0.05);
    asteroids.push(asteroid);
    asteroidByBody.set(body, asteroid);
  }

  function spawnLaser(point, direction, nowMs) {
    if (lasers.length >= LASER_LIMIT) {
      removeLaser(lasers[0]);
    }
    const width = 9;
    const length = 30;
    const angle = Math.atan2(direction.y, direction.x) + Math.PI / 2;
    const body = Matter.Bodies.rectangle(
      point.x + direction.x * 18,
      point.y + direction.y * 18,
      width,
      length,
      {
        density: 0.0002,
        friction: 0,
        frictionAir: 0,
        restitution: 0,
        label: "Player laser"
      }
    );
    body.gravityScale = 0;
    body.isSensor = true;
    tagBody(body, "laser");
    Matter.Body.setAngle(body, angle);
    Matter.Body.setVelocity(body, { x: direction.x * LASER_SPEED, y: direction.y * LASER_SPEED });
    Matter.Composite.add(world, body);
    const object = addWorldObject({
      kind: "line",
      shapeType: "Laser",
      gameRole: "asteroid-laser",
      behaviorText: "Laser",
      hue: 345,
      color: LASER_COLOR,
      body: body,
      bodies: [body],
      local: [],
      lineLocal: [
        { x: -width / 2, y: -length / 2 },
        { x: width / 2, y: -length / 2 },
        { x: width / 2, y: length / 2 },
        { x: -width / 2, y: length / 2 }
      ],
      raw: [],
      born: nowMs
    });
    const laser = { body: body, object: object, born: nowMs };
    lasers.push(laser);
    laserByBody.set(body, laser);
  }

  function makeFingerGun(landmarks) {
    const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    const wrist = landmarks[0];
    const extended = (tip, pip) => distance(landmarks[tip], wrist) >
      distance(landmarks[pip], wrist) * 1.08;
    const handScale = distance(wrist, landmarks[9]);
    return handScale > 0 && extended(8, 6) &&
      !extended(12, 10) && !extended(16, 14) && !extended(20, 18);
  }

  function mapPoint(point) {
    return { x: (1 - point.x) * gameCanvas.width, y: point.y * gameCanvas.height };
  }

  function classifyRestartPose(landmarks) {
    if (typeof classifyPose !== "function") return null;
    for (let index = 0; index < posePoints.length; index++) {
      const point = posePoints[index];
      point.x = (1 - landmarks[index].x) * gameCanvas.width;
      point.y = landmarks[index].y * gameCanvas.height;
    }
    return classifyPose(posePoints);
  }

  function updateHand(landmarks, index, nowMs) {
    const prior = hands[index] || {};
    if (!landmarks || landmarks.length < 21) {
      hands[index] = null;
      return;
    }
    const palmCenter = {
      x: (landmarks[0].x + landmarks[5].x + landmarks[9].x + landmarks[13].x + landmarks[17].x) *
        gameCanvas.width / 5 * -1 + gameCanvas.width,
      y: (landmarks[0].y + landmarks[5].y + landmarks[9].y + landmarks[13].y + landmarks[17].y) *
        gameCanvas.height / 5
    };
    const dt = prior.at ? Math.max(1, nowMs - prior.at) / 1000 : 1 / 60;
    const vy = prior.center ? (palmCenter.y - prior.center.y) / dt : 0;
    const accelerationY = prior.vy === undefined ? 0 : (vy - prior.vy) / dt;
    const tip = mapPoint(landmarks[8]);
    let dx = (landmarks[5].x - landmarks[8].x) * gameCanvas.width;
    let dy = (landmarks[8].y - landmarks[5].y) * gameCanvas.height;
    if (dy > -0.12 * Math.hypot(dx, dy)) dy = -Math.abs(dy) - Math.abs(dx) * 0.55;
    const magnitude = Math.hypot(dx, dy) || 1;
    dx /= magnitude;
    dy /= magnitude;
    const fingerGun = makeFingerGun(landmarks);
    const gesturePose = classifyRestartPose(landmarks);

    const hand = {
      tip: tip,
      direction: { x: dx, y: dy },
      center: palmCenter,
      vy: vy,
      accelerationY: accelerationY,
      at: nowMs,
      lastShotAt: prior.lastShotAt || 0,
      lastFistAt: prior.lastFistAt || 0,
      fingerGun: fingerGun,
      fist: gesturePose === "FIST",
      restartPose: gesturePose
    };
    if (gesturePose === "OPEN PALM" && gameOver && !connected()) {
      if (!openPalmSince) openPalmSince = nowMs;
      if (nowMs - openPalmSince >= 650) requestReplay();
    } else if (index === 0) {
      openPalmSince = null;
    }
    if (!gameOver && hand.fist && !prior.fist && nowMs - hand.lastFistAt > 500) {
      destroyNearbyAsteroid(palmCenter);
      hand.lastFistAt = nowMs;
    }
    const flickedUp = vy < -360 && accelerationY < -650 || vy < -800;
    if (!gameOver && fingerGun && flickedUp && nowMs - hand.lastShotAt > 300) {
      spawnLaser(tip, hand.direction, nowMs);
      hand.lastShotAt = nowMs;
    }
    hands[index] = hand;
  }

  function setHands(landmarks) {
    const nowMs = performance.now();
    const detected = landmarks || [];
    updateHand(detected[0], 0, nowMs);
    updateHand(detected[1], 1, nowMs);
    if (detected.length === 0) openPalmSince = null;
  }

  function bodyTag(body) {
    const parent = body.parent || body;
    return parent.plugin && parent.plugin.asteroidShooterKind;
  }

  function removeAsteroid(asteroid) {
    if (!asteroid) return;
    const index = asteroids.indexOf(asteroid);
    if (index < 0) return;
    asteroidByBody.delete(asteroid.body);
    asteroids.splice(index, 1);
    removeWorldObject(asteroid);
  }

  function removeLaser(laser) {
    if (!laser) return;
    const index = lasers.indexOf(laser);
    if (index < 0) return;
    laserByBody.delete(laser.body);
    lasers.splice(index, 1);
    removeWorldObject(laser.object);
  }

  function burst(x, y, color, count) {
    for (let index = 0; index < count; index++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 7;
      particles.push({
        x: x,
        y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0,
        maxLife: 24 + Math.random() * 20,
        color: color
      });
    }
    if (typeof spawnSparks === "function") {
      spawnSparks(x, y, 30);
      spawnSparks(x - 10, y + 6, 24);
      spawnSparks(x + 10, y - 6, 24);
    }
  }

  function hitAsteroid(laser, asteroid) {
    removeLaser(laser);
    shatterAsteroid(asteroid);
  }

  function shatterAsteroid(asteroid) {
    if (!asteroid || !asteroidByBody.has(asteroid.body)) return;
    const point = asteroid.body.position;
    burst(point.x, point.y, "#66f7ff", 42);
    removeAsteroid(asteroid);
    score += 100;
    if (typeof playTone === "function") playTone(1046, 0.16);
  }

  function destroyNearbyAsteroid(point) {
    let nearest = null;
    let nearestDistance = Math.max(90, gameCanvas.width * 0.12) ** 2;
    for (const asteroid of asteroids) {
      const dx = asteroid.body.position.x - point.x;
      const dy = asteroid.body.position.y - point.y;
      const distance = dx * dx + dy * dy;
      if (distance <= nearestDistance) {
        nearest = asteroid;
        nearestDistance = distance;
      }
    }
    if (nearest) shatterAsteroid(nearest);
  }

  function asteroidReachedBase(asteroid, nowMs) {
    const point = asteroid.body.position;
    burst(point.x, point.y, "#ff334f", 28);
    removeAsteroid(asteroid);
    health = Math.max(0, health - 1);
    if (typeof playTone === "function") playTone(95, 0.22);
    if (health === 0) endGame(nowMs);
  }

  function collisionStart(event) {
    if (gameOver) return;
    for (const pair of event.pairs) {
      if (gameOver) break;
      const a = pair.bodyA.parent || pair.bodyA;
      const b = pair.bodyB.parent || pair.bodyB;
      const kindA = bodyTag(a);
      const kindB = bodyTag(b);
      if (kindA === "laser" && kindB === "asteroid") {
        const laser = laserByBody.get(a);
        const asteroid = asteroidByBody.get(b);
        if (laser && asteroid) hitAsteroid(laser, asteroid);
      } else if (kindB === "laser" && kindA === "asteroid") {
        const laser = laserByBody.get(b);
        const asteroid = asteroidByBody.get(a);
        if (laser && asteroid) hitAsteroid(laser, asteroid);
      } else if ((kindA === "base" && kindB === "asteroid") ||
                 (kindB === "base" && kindA === "asteroid")) {
        const asteroidBody = kindA === "asteroid" ? a : b;
        const asteroid = asteroidByBody.get(asteroidBody);
        if (asteroid) asteroidReachedBase(asteroid, performance.now());
      }
    }
  }

  function endGame(nowMs) {
    if (gameOver) return;
    if (connected()) {
      stopRound();
      resultText = "ROUND FINISHED";
      const event = { type: "asteroid-defeat", round: round };
      if (authority()) handleEvent(event, localId());
      else window.GameEngine.sendGameEvent(event);
      return;
    }
    resultText = "GAME OVER";
    gameOver = true;
    nextSpawnAt = Infinity;
    openPalmSince = null;
    if (restartButton) restartButton.hidden = false;
    showResultPanel();
    if (typeof showToast === "function") showToast("Base destroyed - game over");
  }

  function restartGame() {
    if (typeof window.GameEngine.clearRoundDrawings === "function") window.GameEngine.clearRoundDrawings();
    if (resultPanel) resultPanel.hidden = true;
    losingPlayer = null;
    readyPlayers.clear();
    resultText = "GAME OVER";
    hands = [];
    update.lastAt = performance.now();
    if (restartButton) {
      restartButton.disabled = false;
      restartButton.textContent = "Play again";
    }
    while (asteroids.length) removeAsteroid(asteroids[asteroids.length - 1]);
    while (lasers.length) removeLaser(lasers[lasers.length - 1]);
    particles = [];
    score = 0;
    health = 5;
    gameOver = false;
    openPalmSince = null;
    nextSpawnAt = performance.now() + 900;
    if (restartButton) restartButton.hidden = true;
  }

  function showResultPanel() {
    if (!resultPanel) return;
    resultTitle.textContent = resultText;
    resultScore.textContent = "Final score: " + score;
    resultPanel.hidden = false;
  }

  function createRestartButton(context) {
    const host = context.canvas.parentElement;
    if (!host) return;
    restartButton = document.createElement("button");
    restartButton.type = "button";
    restartButton.className = "asteroid-play-again";
    restartButton.textContent = "Play again";
    restartButton.hidden = true;
    restartButton.addEventListener("click", requestReplay);
    resultPanel = document.createElement("div");
    resultPanel.className = "alchemist-win-panel asteroid-result-panel";
    resultPanel.hidden = true;
    resultPanel.setAttribute("role", "status");
    resultTitle = document.createElement("strong");
    resultScore = document.createElement("p");
    resultPanel.append(resultTitle, resultScore, restartButton);
    host.appendChild(resultPanel);
  }

  function init(context) {
    previousDrawMode = typeof drawModeOn === "undefined" ? null : drawModeOn;
    if (typeof clearAll === "function") clearAll();
    // Partner-owned drawings are removed locally without deleting the partner's data.
    for (const object of objects.slice()) removeWorldObject(object);
    if (typeof window.setDrawMode === "function") window.setDrawMode(false);
    round = 0;
    losingPlayer = null;
    resultText = "GAME OVER";
    readyPlayers.clear();
    gameCanvas = context.canvas;
    asteroids = [];
    lasers = [];
    asteroidByBody.clear();
    laserByBody.clear();
    particles = [];
    score = 0;
    health = 5;
    gameOver = false;
    hands = [];
    openPalmSince = null;
    makeBase();
    createRestartButton(context);
    nextSpawnAt = performance.now() + 700;
    update.lastAt = performance.now();
    collisionHandler = collisionStart;
    Matter.Events.on(engine, "collisionStart", collisionHandler);
  }

  function updateAimHits(nowMs) {
    if (gameOver || !asteroids.length) return;
    let snapshotReady = false;
    const aimLength = gameCanvas.height * AIM_LENGTH_RATIO;
    for (const hand of hands) {
      if (!hand || !hand.fingerGun || nowMs - hand.at > HAND_TIMEOUT_MS) continue;
      if (!snapshotReady) {
        aimBodies.length = asteroids.length;
        for (let index = 0; index < asteroids.length; index++) aimBodies[index] = asteroids[index].body;
        snapshotReady = true;
      }
      aimEnd.x = hand.tip.x + hand.direction.x * aimLength;
      aimEnd.y = hand.tip.y + hand.direction.y * aimLength;
      // Removed bodies in this frame's snapshot are ignored by the lookup below.
      const hits = Matter.Query.ray(aimBodies, hand.tip, aimEnd, AIM_WIDTH);
      for (const hit of hits) {
        const body = hit.bodyA.parent || hit.bodyA;
        const asteroid = asteroidByBody.get(body);
        if (asteroid) shatterAsteroid(asteroid);
      }
    }
    aimBodies.length = 0;
  }

  function update(nowMs) {
    updateAimHits(nowMs);
    if (!gameOver && nowMs >= nextSpawnAt) {
      spawnAsteroid(nowMs);
      nextSpawnAt = nowMs + ASTEROID_MIN_DELAY +
        Math.random() * (ASTEROID_MAX_DELAY - ASTEROID_MIN_DELAY);
    }
    for (let index = lasers.length - 1; index >= 0; index--) {
      const laser = lasers[index];
      const body = laser.body;
      if (nowMs - laser.born > LASER_LIFETIME_MS ||
          body.position.y < -80 || body.position.x < -80 || body.position.x > gameCanvas.width + 80) {
        removeLaser(laser);
        continue;
      }
      body.gravityScale = 0;
      Matter.Body.applyForce(body, body.position, {
        x: 0,
        y: -engine.gravity.y * engine.gravity.scale * body.mass
      });
    }
    const delta = Math.min(50, Math.max(0, nowMs - (update.lastAt || nowMs))) / 16.667;
    update.lastAt = nowMs;
    const drag = Math.pow(0.97, delta);
    let liveCount = 0;
    for (let index = 0; index < particles.length; index++) {
      const particle = particles[index];
      particle.x += particle.vx * delta;
      particle.y += particle.vy * delta;
      particle.vy += 0.12 * delta;
      particle.vx *= drag;
      particle.life += delta;
      if (particle.life < particle.maxLife) particles[liveCount++] = particle;
    }
    particles.length = liveCount;
  }

  function render(context) {
    if (!gameCanvas || !base) return;
    const nowMs = performance.now();
    const aimLength = gameCanvas.height * AIM_LENGTH_RATIO;
    context.save();
    context.strokeStyle = "rgba(255, 49, 95, 0.9)";
    context.lineWidth = AIM_WIDTH;
    context.setLineDash(AIM_DASH);
    context.beginPath();
    for (const hand of hands) {
      if (!hand || !hand.fingerGun || nowMs - hand.at > HAND_TIMEOUT_MS) continue;
      context.moveTo(hand.tip.x, hand.tip.y);
      context.lineTo(
        hand.tip.x + hand.direction.x * aimLength,
        hand.tip.y + hand.direction.y * aimLength
      );
    }
    context.stroke();
    context.setLineDash(NO_DASH);
    context.restore();

    context.save();
    context.strokeStyle = LASER_COLOR;
    context.lineWidth = 7;
    context.shadowColor = LASER_COLOR;
    context.shadowBlur = 18;
    for (const laser of lasers) {
      const body = laser.body;
      const angle = body.angle;
      const half = 18;
      const dx = Math.cos(angle - Math.PI / 2) * half;
      const dy = Math.sin(angle - Math.PI / 2) * half;
      context.beginPath();
      context.moveTo(body.position.x - dx, body.position.y - dy);
      context.lineTo(body.position.x + dx, body.position.y + dy);
      context.stroke();
    }
    context.restore();

    context.save();
    context.shadowBlur = 12;
    for (const particle of particles) {
      context.globalAlpha = Math.max(0, 1 - particle.life / particle.maxLife);
      context.fillStyle = particle.color;
      context.shadowColor = particle.color;
      context.fillRect(particle.x - 3, particle.y - 3, 6, 6);
    }
    context.restore();

    context.save();
    context.textAlign = "center";
    context.textBaseline = "top";
    context.font = "bold 23px 'Courier New', monospace";
    context.fillStyle = "#f1fbff";
    context.shadowColor = BASE_COLOR;
    context.shadowBlur = 12;
    context.fillText("SCORE: " + score, gameCanvas.width / 2, 16);
    context.font = "bold 18px 'Courier New', monospace";
    context.fillText("BASE HEALTH: " + "\u2665".repeat(health) + "\u2661".repeat(5 - health),
      gameCanvas.width / 2, 48);
    context.font = "14px 'Courier New', monospace";
    context.fillText("AIM RED LINE: DESTROY  |  FIST: SHATTER  |  FLICK: SHOOT",
      gameCanvas.width / 2, 74);
    context.restore();
  }

  function unload() {
    if (previousDrawMode !== null) {
      drawModeOn = previousDrawMode;
      if (typeof updateDrawModeButton === "function") updateDrawModeButton();
    }
    previousDrawMode = null;
    if (collisionHandler) Matter.Events.off(engine, "collisionStart", collisionHandler);
    collisionHandler = null;
    while (asteroids.length) removeAsteroid(asteroids[asteroids.length - 1]);
    while (lasers.length) removeLaser(lasers[lasers.length - 1]);
    if (base) {
      removeWorldObject(base);
      base = null;
    }
    if (resultPanel) resultPanel.remove();
    resultPanel = null;
    resultTitle = null;
    resultScore = null;
    restartButton = null;
    particles = [];
    hands = [];
    gameCanvas = null;
    gameOver = false;
  }

  window.GameEngine.registerGame({
    isComplete: () => gameOver,
    id: "asteroid-shooter",
    name: "Asteroid Shooter",
    init: init,
    update: update,
    render: render,
    unload: unload,
    setHands: setHands,
    captureInput: true,
    handleEvent: handleEvent,
    consumedPoses: ["OPEN PALM", "FIST"]
  });
})();
