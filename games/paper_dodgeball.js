(() => {
  const PLAYER_COLOR = "#49d8c4";
  const ENEMY_COLOR = "#ff7285";
  const STARTING_HEALTH = 3;
  const MAX_AMMO = 12;
  const ENEMY_SPAWN_MS = 3000;
  const GRAB_RADIUS = 190;
  const THROW_SPEED = 27;
  const THROW_MULTIPLIER = 1.2;
  const PARTICLE_LIMIT = 220;

  let gameCanvas = null;
  let status = null;
  let projectiles = [];
  let particles = [];
  let playerCore = null;
  let opponentCore = null;
  let playerHealth = STARTING_HEALTH;
  let opponentHealth = STARTING_HEALTH;
  let gameOver = false;
  let collisionHandler = null;
  let heldProjectiles = null;
  let previousHand = null;
  let boxDrag = null;
  let lastGripAt = -Infinity;
  let nextEnemyVolleyAt = 0;
  let arenaSplitX = 0;

  let restartButton = null;
  let timerMenu = null, durationButton = null, roundStartButton = null;
  let duration = 30, roundEndsAt = 0, roundRunning = false, roundNumber = 0;
  let resultText = "", finalCounts = { player: 0, opponent: 0 };
  let menuTarget = null, menuSince = null;
  let actingSide = "player";
  let handStates = [];
  const timedReady = new Set();
  function connected() { return typeof window.isMultiplayerConnected === "function" && window.isMultiplayerConnected(); }
  function authority() { return !connected() || window.isMinigameAuthority(); }
  function localSide() {
    return connected() && window.sharedSpace.localOwnerId > window.sharedSpace.remoteOwnerId ? "opponent" : "player";
  }
  function acceptTimedReady(ownerId) {
    timedReady.add(ownerId);
    if (!timedReady.has(window.sharedSpace.localOwnerId) || !timedReady.has(window.sharedSpace.remoteOwnerId)) return;
    const event={type:"fling-start",round:roundNumber,seconds:duration};
    window.GameEngine.sendGameEvent(event);
    if(gameOver) restartGame();
    startRound(event.seconds);
  }
  function startRound(seconds) {
    if (roundRunning) return;
    duration = seconds;
    roundRunning = true;
    gameOver = false;
    resultText = "";
    roundEndsAt = performance.now() + seconds * 1000;
    nextEnemyVolleyAt = performance.now() + 1200;
    durationButton.disabled = true;
    roundStartButton.disabled = true;
    roundStartButton.textContent = "Playing";
    if (status) status("Round started! Drag your box to get shapes and fling them across.");
  }
  function showTimedResult(counts) {
    finalCounts = counts;
    timedReady.clear();
    roundRunning = false;
    gameOver = true;
    heldProjectiles = null;
    boxDrag = null;
    handStates = [];
    const mine = counts[localSide()];
    const theirs = counts[localSide() === "player" ? "opponent" : "player"];
    resultText = mine === theirs ? "DRAW!" : mine > theirs ? "YOU WIN!" : "YOU LOSE!";
    durationButton.disabled = false;
    roundStartButton.disabled = false;
    roundStartButton.textContent = "Play again";
    for (const projectile of projectiles) {
      const body = bodyFor(projectile);
      if (body && !body.isStatic) Matter.Body.setStatic(body, true);
    }
    if (status) status(resultText + " Objects across: " + mine + " – " + theirs);
  }
  function handleEvent(event, ownerId) {
    if (!connected() || !event || event.round !== roundNumber) return;
    const trusted = ownerId === window.sharedSpace.authorityOwnerId;
    if (event.type === "fling-duration-request" && authority() && !roundRunning) { durationButton.click(); return; }
    if (event.type === "fling-duration" && trusted && !roundRunning && [15,30,45,60].includes(event.seconds)) {
      duration = event.seconds; durationButton.textContent = "Time: " + duration + "s";
    } else if (event.type === "fling-start-request" && authority()) {
      acceptTimedReady(ownerId);
    } else if (event.type === "fling-start" && trusted && [15,30,45,60].includes(event.seconds)) {
      if (gameOver) restartGame();
      startRound(event.seconds);
    } else if (event.type === "fling-result" && trusted && event.counts &&
        Number.isInteger(event.counts.player) && Number.isInteger(event.counts.opponent)) showTimedResult(event.counts);
  }
  function createTimerMenu() {
    timerMenu = document.createElement("div");
    timerMenu.className = "fling-timer-menu";
    durationButton = document.createElement("button");
    durationButton.type = "button";
    durationButton.textContent = "Time: " + duration + "s";
    durationButton.title = "Hold your pointer for 2 seconds to switch duration";
    durationButton.addEventListener("click", () => {
      if (roundRunning) return;
      if(connected() && !authority()){window.GameEngine.sendGameEvent({type:"fling-duration-request",round:roundNumber});return;}
      const times = [15,30,45,60]; duration = times[(times.indexOf(duration)+1)%times.length];
      durationButton.textContent = "Time: " + duration + "s";
      if (connected()) window.GameEngine.sendGameEvent({type:"fling-duration",round:roundNumber,seconds:duration});
    });
    roundStartButton = document.createElement("button");
    roundStartButton.type = "button"; roundStartButton.textContent = "Start";
    roundStartButton.addEventListener("click", () => {
      if (roundRunning) return;
      if(connected()) {
        roundStartButton.disabled=true;
        roundStartButton.textContent="Waiting for friend…";
        if(authority()) acceptTimedReady(window.sharedSpace.localOwnerId);
        else window.GameEngine.sendGameEvent({type:"fling-start-request",round:roundNumber});
        return;
      }
      if(gameOver) restartGame();
      startRound(duration);
    });
    timerMenu.append(durationButton,roundStartButton);
    gameCanvas.parentElement.appendChild(timerMenu);
  }
  function updateTimerPointer(nowMs) {
    const rect = gameCanvas.getBoundingClientRect();
    let target = null;
    function check(point, seen) {
      if (!point || nowMs-seen>120) return;
      const element = document.elementFromPoint(rect.left+point.x*rect.width/gameCanvas.width,
        rect.top+point.y*rect.height/gameCanvas.height);
      if ((element===durationButton || element===roundStartButton) && !element.disabled) target=element;
    }
    if (typeof primaryHandPresent!=="undefined" && primaryHandPresent) check(penVis||pen,lastSeenMs);
    if (!target && typeof secondaryHandPresent!=="undefined" && secondaryHandPresent) check(h2.vis||h2.pen,h2.seen);
    if (target!==menuTarget) {
      if(menuTarget)menuTarget.style.setProperty("--hold-progress","0%");
      menuTarget=target;menuSince=target?nowMs:null;
    }
    if (!target || menuSince===null) return;
    const hold=target===durationButton?2000:700;
    target.style.setProperty("--hold-progress",Math.min(100,(nowMs-menuSince)/hold*100)+"%");
    if(nowMs-menuSince>=hold){menuSince=null;target.click();}
  }

  function rootBody(body) {
    return body && (body.parent || body);
  }

  function bodyFor(item) {
    return item && (item.body || (Array.isArray(item.bodies) && item.bodies[0])) || null;
  }

  function makeCore(x, y, side, color) {
    const width = Math.max(54, gameCanvas.width * 0.075);
    const height = Math.max(74, gameCanvas.height * 0.15);
    const body = Matter.Bodies.rectangle(x, y, width, height, {
      isStatic: true,
      isSensor: true,
      label: "Paper Dodgeball " + side + " core"
    });
    body.plugin = body.plugin || {};
    body.plugin.paperDodgeballSide = side;
    Matter.Composite.add(world, body);
    const points = [
      { x: -width / 2, y: -height / 2 },
      { x: width / 2, y: -height / 2 },
      { x: width / 2, y: height / 2 },
      { x: -width / 2, y: height / 2 }
    ];
    const object = {
      kind: "solid",
      shapeType: side + " Core",
      behaviorText: side + " Dodgeball Core",
      gameRole: "paper-dodgeball-" + side.toLowerCase() + "-core",
      body: body,
      bodies: [body],
      local: points,
      polyLocal: points.map((point) => ({ x: point.x, y: point.y })),
      hue: side === "Player" ? 167 : 350,
      color: color
    };
    objects.push(object);
    return { body: body, object: object, color: color };
  }

  function localVertices(body) {
    const cos = Math.cos(-body.angle);
    const sin = Math.sin(-body.angle);
    return body.vertices.map((vertex) => {
      const dx = vertex.x - body.position.x;
      const dy = vertex.y - body.position.y;
      return { x: dx * cos - dy * sin, y: dx * sin + dy * cos };
    });
  }

  function addProjectile(points, side, options) {
    if (!points || points.length < 3) return null;
    const settings = options || {};
    const center = points.reduce((sum, point) => ({
      x: sum.x + point.x / points.length,
      y: sum.y + point.y / points.length
    }), { x: 0, y: 0 });
    const body = Matter.Bodies.fromVertices(center.x, center.y, [points], {
      density: settings.density || 0.0016,
      friction: 0.46,
      frictionAir: 0.0025,
      restitution: 0.56,
      label: "Paper Dodgeball " + side + " projectile"
    }, true);
    if (!body) return null;
    body.plugin = body.plugin || {};
    body.plugin.paperDodgeballProjectile = true;
    body.plugin.paperDodgeballSide = side;
    Matter.Composite.add(world, body);
    const color = side === "player" ? PLAYER_COLOR : ENEMY_COLOR;
    const object = {
      kind: "solid",
      shapeType: "Paper Ammo",
      behaviorText: "Paper Dodgeball",
      gameRole: "paper-dodgeball-projectile",
      gameSide: side,
      body: body,
      bodies: [body],
      local: localVertices(body),
      polyLocal: localVertices(body),
      hue: side === "player" ? 167 : 350,
      color: color,
      born: performance.now()
    };
    if (typeof assignLocalObjectIdentity === "function") assignLocalObjectIdentity(object);
    objects.push(object);
    if (typeof sendObjectCreation === "function") sendObjectCreation(object);
    projectiles.push(object);
    return object;
  }

  function dispenseShape(point, nowMs) {
    if (projectiles.filter((item) => item.gameSide === actingSide && objects.includes(item) &&
        (actingSide === "player" ? bodyFor(item).position.x < arenaSplitX : bodyFor(item).position.x > arenaSplitX)).length >= MAX_AMMO) {
      if (status) status("Throw your existing shapes before getting more ammo.");
      return;
    }
    const sides = [3, 4, 5, 6, 12][Math.floor(Math.random() * 5)];
    const radius = 20 + Math.random() * 10;
    const points = Array.from({ length: sides }, (_, index) => {
      const angle = index * Math.PI * 2 / sides;
      return { x: point.x + Math.cos(angle) * radius, y: point.y + Math.sin(angle) * radius };
    });
    const projectile = addProjectile(points, actingSide);
    if (!projectile) return;
    heldProjectiles = { point: { ...point }, at: nowMs, velocity: { x: 0, y: 0 },
      items: [{ projectile, offsetX: 0, offsetY: 0 }] };
    if (status) status("Shape ready! Flick toward the opponent and open your hand to throw.");
  }

  function spawnEnemyProjectile(nowMs) {
    const center = opponentCore.body.position;
    const radius = 15 + Math.random() * 10;
    const points = [];
    const sides = 5 + Math.floor(Math.random() * 3);
    for (let index = 0; index < sides; index++) {
      const angle = index * Math.PI * 2 / sides;
      points.push({
        x: center.x - 44 + Math.cos(angle) * radius,
        y: center.y + Math.sin(angle) * radius
      });
    }
    const projectile = addProjectile(points, "opponent", { density: 0.0014 });
    if (!projectile) return;
    Matter.Body.setVelocity(projectile.body, {
      x: (-8 - Math.random() * 5) * THROW_MULTIPLIER,
      y: (Math.random() - 0.5) * 3
    });
    Matter.Body.setAngularVelocity(projectile.body, (Math.random() - 0.5) * 0.12);
    projectile.born = nowMs;
  }

  function bodyBoundsContain(body, point, padding) {
    return point.x >= body.bounds.min.x - padding && point.x <= body.bounds.max.x + padding &&
      point.y >= body.bounds.min.y - padding && point.y <= body.bounds.max.y + padding;
  }

  function getHand(landmarks) {
    const points = landmarks.map((point) => ({
      x: (1 - point.x) * gameCanvas.width,
      y: point.y * gameCanvas.height
    }));
    const rawPoint = { x: (points[4].x + points[8].x) / 2, y: (points[4].y + points[8].y) / 2 };
    const gain = typeof REACH_LEVELS !== "undefined" ? REACH_LEVELS[reachIdx] : 1;
    const anchorY = gameCanvas.height * (typeof REACH_ANCHOR_Y !== "undefined" ? REACH_ANCHOR_Y : 0.55);
    let point = {
      x: Math.max(0, Math.min(gameCanvas.width, gameCanvas.width / 2 + (rawPoint.x - gameCanvas.width / 2) * gain)),
      y: Math.max(0, Math.min(gameCanvas.height, anchorY + (rawPoint.y - anchorY) * gain))
    };
    // Match a locally rendered ring to its raw hand, without borrowing another hand's pointer.
    const nowMs = performance.now();
    if (typeof realPen !== "undefined" && realPen && typeof pen !== "undefined" && pen &&
        nowMs - lastSeenMs <= 120 && Math.hypot(realPen.x - rawPoint.x, realPen.y - rawPoint.y) < 45) {
      point = typeof penVis !== "undefined" && penVis ? penVis : pen;
    } else if (typeof h2 !== "undefined" && h2.realPen && h2.pen && nowMs - h2.seen <= 120 &&
        Math.hypot(h2.realPen.x - rawPoint.x, h2.realPen.y - rawPoint.y) < 45) {
      point = h2.vis || h2.pen;
    }
    return {
      point: { x: point.x, y: point.y },
      pinching: Math.hypot(points[4].x - points[8].x, points[4].y - points[8].y) <
        Math.hypot(points[0].x - points[9].x, points[0].y - points[9].y) * 0.28,
      pose: typeof classifyPose === "function" ? classifyPose(points) : null
    };
  }

  function particleBurst(x, y, color, count) {
    for (let index = 0; index < count && particles.length < PARTICLE_LIMIT; index++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 7;
      particles.push({
        x: x,
        y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0,
        maxLife: 24 + Math.random() * 22,
        color: color,
        size: 2 + Math.random() * 4
      });
    }
    if (typeof spawnSparks === "function") {
      spawnSparks(x, y, count);
      spawnSparks(x - 14, y + 8, Math.max(12, count - 8));
      spawnSparks(x + 14, y - 8, Math.max(12, count - 8));
    }
  }

  function removeProjectile(projectile) {
    if (!projectile) return;
    if (typeof removeObject === "function") removeObject(projectile);
    else {
      Matter.Composite.remove(world, projectile.body);
      const index = objects.indexOf(projectile);
      if (index >= 0) objects.splice(index, 1);
    }
    projectiles = projectiles.filter((item) => item !== projectile);
    if (heldProjectiles) {
      heldProjectiles.items = heldProjectiles.items.filter((item) => item.projectile !== projectile);
      if (!heldProjectiles.items.length) heldProjectiles = null;
    }
  }

  function onCollisionStart() {
    // Keep all projectiles in play until the timer ends.
  }

  function releaseHeld() {
    if (!heldProjectiles) return;
    const vx = heldProjectiles.velocity.x;
    const vy = heldProjectiles.velocity.y;
    const flick = vx * (actingSide === "player" ? 1 : -1) > 1.1;
    for (const held of heldProjectiles.items) {
      const body = bodyFor(held.projectile);
      if (!body || !objects.includes(held.projectile)) continue;
      Matter.Body.setVelocity(body, {
        x: (flick ? Math.max(THROW_SPEED, Math.min(38, 20 + vx * 0.55)) : 3) * THROW_MULTIPLIER * (actingSide === "player" ? 1 : -1),
        y: Math.max(-20, Math.min(20, vy * 1.3)) * THROW_MULTIPLIER
      });
      Matter.Body.setAngularVelocity(body, (Math.random() - 0.5) * 0.2);
    }
    heldProjectiles = null;
    if (status) status(flick
      ? "Volley thrown toward the opponent!"
      : "Fist released. Flick your wrist toward the opponent to throw.");
  }

  function dragSupplyBox(hand, nowMs) {
    if (heldProjectiles) return false;
    if (!boxDrag && bodyBoundsContain(actingSide === "player" ? playerCore.body : opponentCore.body, hand.point, 28)) {
      boxDrag = { startX: hand.point.x, point: hand.point };
    }
    if (!boxDrag) return false;
    boxDrag.point = hand.point;
    if ((hand.point.x - boxDrag.startX) * (actingSide === "player" ? 1 : -1) >= Math.max(65, gameCanvas.width * 0.1)) {
      boxDrag = null;
      dispenseShape(hand.point, nowMs);
    }
    return true;
  }

  function grabOrMove(hand, nowMs) {
    if (!heldProjectiles) {
      const candidates = projectiles.filter((item) => {
        const body = bodyFor(item);
        return item.gameSide === actingSide && body && objects.includes(item) &&
          Math.hypot(body.position.x - hand.point.x, body.position.y - hand.point.y) <= GRAB_RADIUS;
      });
      if (!candidates.length) return;
      heldProjectiles = {
        point: hand.point,
        at: nowMs,
        velocity: { x: 0, y: 0 },
        items: candidates.map((projectile) => ({
          projectile: projectile,
          offsetX: bodyFor(projectile).position.x - hand.point.x,
          offsetY: bodyFor(projectile).position.y - hand.point.y
        }))
      };
    }
    const elapsed = Math.max(1, nowMs - heldProjectiles.at);
    heldProjectiles.velocity = {
      x: (hand.point.x - heldProjectiles.point.x) * 16.667 / elapsed,
      y: (hand.point.y - heldProjectiles.point.y) * 16.667 / elapsed
    };
    for (const held of heldProjectiles.items) {
      const body = bodyFor(held.projectile);
      if (!body || !objects.includes(held.projectile)) continue;
      Matter.Body.setPosition(body, {
        x: hand.point.x + held.offsetX,
        y: hand.point.y + held.offsetY
      });
      Matter.Body.setVelocity(body, { x: 0, y: 0 });
      Matter.Body.setAngularVelocity(body, 0);
    }
    heldProjectiles.point = hand.point;
    heldProjectiles.at = nowMs;
  }

  function processHand(landmarks) {
    if (!gameCanvas || gameOver || !roundRunning) return;
    const handLandmarks = (landmarks || []).find((candidate) => candidate && candidate.length >= 21);
    if (!handLandmarks) {
      releaseHeld();
      previousHand = null;
      boxDrag = null;
      return;
    }
    const nowMs = performance.now();
    const hand = getHand(handLandmarks);
    const selectedBox = typeof selected !== "undefined" && selected.has(actingSide === "player" ? playerCore.object : opponentCore.object);
    const gripping = hand.pose === "FIST" || hand.pinching;
    if (gripping) lastGripAt = nowMs;
    if (gripping || (boxDrag && selectedBox) ||
        (selectedBox && bodyBoundsContain(actingSide === "player" ? playerCore.body : opponentCore.body, hand.point, 28)) ||
        ((boxDrag || heldProjectiles) && nowMs - lastGripAt < 150)) {
      if (!dragSupplyBox(hand, nowMs)) grabOrMove(hand, nowMs);
    } else {
      boxDrag = null;
      releaseHeld();
    }
    previousHand = { point: hand.point, at: nowMs, direction: previousHand ? previousHand.direction : 0 };
  }

  function setHands(landmarks) {
    const count = connected() ? Math.min(2, (landmarks || []).length) : 1;
    for (let index=0;index<count;index++) {
      actingSide = index===0 ? "player" : "opponent";
      const state=handStates[index] || {};
      heldProjectiles=state.held || null; boxDrag=state.drag || null;
      previousHand=state.previous || null; lastGripAt=state.gripAt || -Infinity;
      processHand(landmarks && landmarks[index] ? [landmarks[index]] : []);
      handStates[index]={held:heldProjectiles,drag:boxDrag,previous:previousHand,gripAt:lastGripAt};
    }
  }

  function restartGame() {
    roundNumber++;
    timedReady.clear();
    if (typeof window.GameEngine.clearRoundDrawings === "function") window.GameEngine.clearRoundDrawings();
    for (const projectile of projectiles.slice()) removeProjectile(projectile);
    playerHealth = STARTING_HEALTH;
    opponentHealth = STARTING_HEALTH;
    gameOver = false;
    roundRunning = false;
    roundEndsAt = 0;
    handStates = [];
    heldProjectiles = null;
    particles = [];
    previousHand = null;
    boxDrag = null;
    lastGripAt = -Infinity;
    nextEnemyVolleyAt = performance.now() + 1200;
    if (restartButton) restartButton.hidden = true;
    if (status) status("Grab your box and drag toward the opponent to get a random shape. Flick and release to throw.");
  }

  function init(context) {
    roundNumber=0; duration=30; roundRunning=false; timedReady.clear();
    gameCanvas = context.canvas;
    status = context.setStatus;
    arenaSplitX = gameCanvas.width / 2;
    playerHealth = STARTING_HEALTH;
    opponentHealth = STARTING_HEALTH;
    projectiles = [];
    particles = [];
    gameOver = false;
    roundRunning = false;
    roundEndsAt = 0;
    handStates = [];
    heldProjectiles = null;
    previousHand = null;
    boxDrag = null;
    playerCore = makeCore(gameCanvas.width * 0.07, gameCanvas.height * 0.52, "Player", PLAYER_COLOR);
    opponentCore = makeCore(gameCanvas.width * 0.93, gameCanvas.height * 0.52, "Opponent", ENEMY_COLOR);
    createTimerMenu();
    const controls = null;
    if (controls) {
      restartButton = document.createElement("button");
      restartButton.type = "button";
      restartButton.className = "game-control-button";
      restartButton.textContent = "Restart Paper Dodgeball";
      restartButton.hidden = true;
      restartButton.addEventListener("click", restartGame);
      controls.appendChild(restartButton);
    }
    nextEnemyVolleyAt = performance.now() + 1200;
    collisionHandler = onCollisionStart;
    Matter.Events.on(engine, "collisionStart", collisionHandler);
    if (status) status("Grab your box and drag toward the opponent to get a random shape. Flick and release to throw.");
  }

  function update(nowMs) {
    if (!gameCanvas) return;
    updateTimerPointer(nowMs);
    if (!roundRunning || gameOver) return;
    if (nowMs >= roundEndsAt) {
      if (authority()) {
        const counts = {player:0,opponent:0};
        for (const projectile of projectiles) {
          const body=bodyFor(projectile);
          if (!body || !objects.includes(projectile)) continue;
          if(projectile.gameSide==="player" && body.position.x>arenaSplitX) counts.player++;
          if(projectile.gameSide==="opponent" && body.position.x<arenaSplitX) counts.opponent++;
        }
        if(connected()) window.GameEngine.sendGameEvent({type:"fling-result",round:roundNumber,counts});
        showTimedResult(counts);
      }
      return;
    }
    if (!connected() && nowMs >= nextEnemyVolleyAt) {
      spawnEnemyProjectile(nowMs);
      nextEnemyVolleyAt = nowMs + ENEMY_SPAWN_MS + Math.random()*1200;
    }
    projectiles = projectiles.filter((item)=>objects.includes(item));
    for (const projectile of projectiles) {
      const body=bodyFor(projectile); if(!body)continue;
      const radius=30;
      const x=Math.max(radius,Math.min(gameCanvas.width-radius,body.position.x));
      const y=Math.max(radius,Math.min(gameCanvas.height-radius,body.position.y));
      if(x!==body.position.x || y!==body.position.y){
        const vx=x!==body.position.x?-body.velocity.x*.5:body.velocity.x;
        const vy=y!==body.position.y?-body.velocity.y*.5:body.velocity.y;
        Matter.Body.setPosition(body,{x,y});
        Matter.Body.setVelocity(body,{x:vx,y:vy});
      }
    }
    const dt = Math.min(50, Math.max(0, nowMs - (update.lastAt || nowMs))) / 16.667;
    update.lastAt = nowMs;
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
  }

  function drawCore(context, core, label) {
    const body = core.body;
    context.save();
    context.shadowColor = core.color;
    context.shadowBlur = 24;
    context.fillStyle = core.color + "45";
    context.strokeStyle = core.color;
    context.lineWidth = 4;
    context.fillRect(body.bounds.min.x, body.bounds.min.y,
      body.bounds.max.x - body.bounds.min.x, body.bounds.max.y - body.bounds.min.y);
    context.strokeRect(body.bounds.min.x, body.bounds.min.y,
      body.bounds.max.x - body.bounds.min.x, body.bounds.max.y - body.bounds.min.y);
    context.shadowBlur = 0;
    context.font = "bold 13px Arial, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "bottom";
    context.fillStyle = "#171717";
    context.fillText(label, body.position.x, body.bounds.min.y - 8);
    context.restore();
  }

  function render(context) {
    if (!gameCanvas || !playerCore || !opponentCore) return;
    context.save();
    context.strokeStyle = "rgba(23, 23, 23, 0.42)";
    context.lineWidth = 2;
    context.setLineDash([10, 10]);
    context.beginPath();
    context.moveTo(arenaSplitX, 0);
    context.lineTo(arenaSplitX, gameCanvas.height);
    context.stroke();
    context.setLineDash([]);
    context.textAlign = "center";
    context.textBaseline = "top";
    context.font = "bold 13px Arial, sans-serif";
    context.fillStyle = PLAYER_COLOR;
    context.fillText("PLAYER SIDE", gameCanvas.width * 0.25, 92);
    context.fillStyle = ENEMY_COLOR;
    context.fillText("OPPONENT SIDE", gameCanvas.width * 0.75, 92);
    context.restore();
    drawCore(context, playerCore, "PLAYER CORE");
    drawCore(context, opponentCore, "OPPONENT CORE");

    for (const particle of particles) {
      context.save();
      context.globalAlpha = Math.max(0, 1 - particle.life / particle.maxLife);
      context.fillStyle = particle.color;
      context.shadowColor = particle.color;
      context.shadowBlur = 12;
      context.fillRect(particle.x - particle.size / 2, particle.y - particle.size / 2,
        particle.size, particle.size);
      context.restore();
    }
    context.save();
    context.textAlign = "center";
    context.textBaseline = "top";
    context.font = "bold 18px Arial, sans-serif";
    context.fillStyle = "#171717";
    context.shadowColor = "#ffffff";
    context.shadowBlur = 5;
    context.fillText(roundRunning ? "TIME: " + Math.max(0, Math.ceil((roundEndsAt-performance.now())/1000)) + "s" : "CHOOSE TIME & START", gameCanvas.width*0.5,65);
    if (!projectiles.some((item) => item.gameSide === "player" && objects.includes(item))) {
      context.font = "bold 16px Arial, sans-serif";
      context.fillStyle = "#171717";
      context.shadowColor = PLAYER_COLOR;
      context.shadowBlur = 12;
      context.fillText("GRAB YOUR BOX AND DRAG RIGHT!", gameCanvas.width * 0.25, gameCanvas.height * 0.25);
    }
    if (boxDrag) {
      const bounds = playerCore.body.bounds;
      const width = bounds.max.x - bounds.min.x;
      const height = bounds.max.y - bounds.min.y;
      context.save();
      context.globalAlpha = 0.65;
      context.fillStyle = PLAYER_COLOR;
      context.strokeStyle = "#ffffff";
      context.lineWidth = 3;
      context.fillRect(boxDrag.point.x - width / 2, boxDrag.point.y - height / 2, width, height);
      context.strokeRect(boxDrag.point.x - width / 2, boxDrag.point.y - height / 2, width, height);
      context.restore();
    }
    if (heldProjectiles) {
      context.font = "bold 14px Arial, sans-serif";
      context.fillStyle = "#171717";
      context.shadowColor = "#ffd95a";
      context.shadowBlur = 12;
      context.fillText("FLICK RIGHT TO THROW!", gameCanvas.width * 0.25, gameCanvas.height * 0.31);
    }
    if (gameOver) {
      context.textBaseline = "middle";
      context.font = "bold 42px Arial, sans-serif";
      context.fillStyle = resultText === "YOU LOSE!" ? "#ff526b" : "#3eae74";
      context.shadowColor = context.fillStyle;
      context.shadowBlur = 22;
      context.fillText(resultText, gameCanvas.width/2,gameCanvas.height*.43);
      context.font="bold 22px Arial, sans-serif";
      context.fillText("Objects across: "+finalCounts.player+" – "+finalCounts.opponent,gameCanvas.width/2,gameCanvas.height*.51);
    }
    context.restore();
  }

  function unload() {
    if(timerMenu)timerMenu.remove();
    timerMenu=null; menuTarget=null; menuSince=null; handStates=[]; roundRunning=false;
    if (collisionHandler) Matter.Events.off(engine, "collisionStart", collisionHandler);
    collisionHandler = null;
    for (const projectile of projectiles.slice()) removeProjectile(projectile);
    for (const core of [playerCore, opponentCore]) {
      if (!core) continue;
      Matter.Composite.remove(world, core.body);
      const index = objects.indexOf(core.object);
      if (index >= 0) objects.splice(index, 1);
    }
    playerCore = null;
    opponentCore = null;
    if (restartButton) restartButton.remove();
    restartButton = null;
    heldProjectiles = null;
    previousHand = null;
    boxDrag = null;
    particles = [];
    status = null;
    gameCanvas = null;
    gameOver = false;
    update.lastAt = 0;
  }

  window.GameEngine.registerGame({
    isComplete: () => gameOver,
    id: "paper-dodgeball",
    name: "Paper-Fling Dodgeball",
    init: init,
    update: update,
    render: render,
    unload: unload,
    setHands: setHands,
    captureInput: true,
    handleEvent: handleEvent,
    consumedPoses: ["FIST"]
  });
})();
