(() => {
  const GOLD = "#ffd95a";
  const MASS_PER_AREA = 0.02;
  const WEIGHT_STEP = 5;
  const MIN_TARGET_WEIGHT = 80;
  const MAX_TARGET_WEIGHT = 300;
  const LEVELS = [
    { shape: "Circle", mass: 120 },
    { shape: "Triangle", mass: 160 },
    { shape: "Square", mass: 200 },
    { shape: "Rectangle", mass: 240 },
    { shape: "Diamond", mass: 180 }
  ];

  let gameCanvas = null;
  let status = null;
  let crucibleBodies = [];
  let crucibleBounds = null;
  let level = 0;
  let target = null;
  let previousTargetWeight = null;
  let currentMass = 0;
  let hasWon = false;
  let winPanel = null;
  let round = 0;
  let winner = null;
  let finishRequested = false;
  let replayButton = null;
  const readyPlayers = new Set();

  function connected() {
    return typeof window.isMultiplayerConnected === "function" && window.isMultiplayerConnected();
  }

  function authority() {
    return !connected() || window.isMinigameAuthority();
  }

  function localId() {
    return window.sharedSpace ? window.sharedSpace.localOwnerId : "local";
  }

  function send(payload) {
    window.GameEngine.sendGameEvent(payload);
  }

  function resetRound(nextTarget, nextRound) {
    clearAll();
    if (winPanel) winPanel.remove();
    winPanel = null;
    replayButton = null;
    level++;
    round = nextRound;
    target = nextTarget;
    previousTargetWeight = target.mass;
    currentMass = 0;
    hasWon = false;
    winner = null;
    finishRequested = false;
    readyPlayers.clear();
    resetPose();
    if (status) status("New challenge! Match the target weight.");
  }

  function handleEvent(event, ownerId) {
    if (!connected() || !event || !Number.isInteger(event.round)) return;
    const trusted = ownerId === window.sharedSpace.authorityOwnerId;
    if (event.type === "next" && trusted && event.round === round + 1 && hasWon && replayButton && replayButton.disabled &&
        event.target && Number.isFinite(event.target.mass) &&
        event.target.mass >= MIN_TARGET_WEIGHT && event.target.mass <= MAX_TARGET_WEIGHT &&
        event.target.mass % WEIGHT_STEP === 0 &&
        LEVELS.some((entry) => entry.shape === event.target.shape)) {
      resetRound(event.target, event.round);
      return;
    }
    if (event.round !== round) return;
    if (event.type === "finish" && authority() && !winner && event.mass === target.mass) {
      winner = ownerId;
      send({ type: "result", round: round, winner: winner });
      showWin(winner === localId());
    } else if (event.type === "result" && trusted && !hasWon &&
        (event.winner === localId() || event.winner === window.sharedSpace.remoteOwnerId)) {
      winner = event.winner;
      showWin(winner === localId());
    } else if (event.type === "ready" && authority() && hasWon) {
      readyPlayers.add(ownerId);
      if (readyPlayers.has(localId()) && readyPlayers.has(window.sharedSpace.remoteOwnerId)) {
        generateTarget();
        const next = { type: "next", round: round + 1, target: target };
        send(next);
        resetRound(next.target, next.round);
      }
    }
  }

  function playAgain() {
    if (connected()) {
      replayButton.disabled = true;
      replayButton.textContent = "Waiting for your friend…";
      const event = { type: "ready", round: round };
      if (authority()) handleEvent(event, localId());
      else send(event);
    } else {
      generateTarget();
      resetRound(target, round + 1);
    }
  }

  let poseCandidate = null;
  let poseStartedAt = 0;
  let poseAnchor = null;
  let poseFired = false;
  let previousGravity = null;
  let previousDrawMode = null;

  const isolatedBodies = new Map();

  function isolatePartnerShapes() {
    const space = window.sharedSpace;
    if (!space) return;
    for (const item of objects) {
      if (!item || !item.ownerId || item.ownerId === space.localOwnerId) continue;
      const bodies = item.body ? (item.body.parts || [item.body]) : item.bodies || [];
      for (const body of bodies) {
        if (!body || !body.collisionFilter || isolatedBodies.has(body)) continue;
        isolatedBodies.set(body, {
          mask: body.collisionFilter.mask,
          group: body.collisionFilter.group
        });
        // Clear group overrides as well as the mask, including compound parts.
        body.collisionFilter.group = 0;
        body.collisionFilter.mask = 0;
      }
    }
  }

  function restorePartnerCollisions() {
    Matter.Events.off(engine, "beforeUpdate", isolatePartnerShapes);
    for (const [body, filter] of isolatedBodies) {
      body.collisionFilter.mask = filter.mask;
      body.collisionFilter.group = filter.group;
    }
    isolatedBodies.clear();
  }

  function roundWeight(mass) {
    return Math.round(mass / WEIGHT_STEP) * WEIGHT_STEP;
  }

  function generateTarget() {
    const count = (MAX_TARGET_WEIGHT - MIN_TARGET_WEIGHT) / WEIGHT_STEP + 1;
    const previousIndex = (previousTargetWeight - MIN_TARGET_WEIGHT) / WEIGHT_STEP;
    const excludePrevious = previousTargetWeight !== null &&
      Number.isInteger(previousIndex) && previousIndex >= 0 && previousIndex < count;
    // Pick from all available weights except the previous one, without retrying.
    let index = Math.floor(Math.random() * (count - (excludePrevious ? 1 : 0)));
    if (excludePrevious && index >= previousIndex) index++;
    previousTargetWeight = MIN_TARGET_WEIGHT + index * WEIGHT_STEP;
    target = {
      shape: LEVELS[level % LEVELS.length].shape,
      mass: previousTargetWeight
    };
  }

  function currentTarget() {
    return target;
  }

  function createCrucible() {
    const innerWidth = Math.min(330, Math.max(180, gameCanvas.width * 0.28));
    const wallHeight = Math.min(160, Math.max(100, gameCanvas.height * 0.24));
    const wallThickness = Math.max(16, Math.min(22, gameCanvas.width * 0.018));
    const floorHeight = Math.max(18, wallThickness);
    const centerX = gameCanvas.width / 2;
    const floorY = gameCanvas.height - floorHeight / 2 - 10;
    const innerLeft = centerX - innerWidth / 2;
    const innerRight = centerX + innerWidth / 2;
    const wallCenterY = floorY - floorHeight / 2 - wallHeight / 2 + 2;
    const options = {
      isStatic: true,
      friction: 0.88,
      restitution: 0.08,
      label: "Alchemist's Scale crucible"
    };
    const floor = Matter.Bodies.rectangle(
      centerX, floorY, innerWidth + wallThickness * 2, floorHeight, options
    );
    const leftWall = Matter.Bodies.rectangle(
      innerLeft - wallThickness / 2, wallCenterY, wallThickness, wallHeight, options
    );
    const rightWall = Matter.Bodies.rectangle(
      innerRight + wallThickness / 2, wallCenterY, wallThickness, wallHeight, options
    );
    crucibleBodies = [floor, leftWall, rightWall];
    Matter.Composite.add(world, crucibleBodies);
    crucibleBounds = {
      left: innerLeft,
      right: innerRight,
      top: wallCenterY - wallHeight / 2,
      bottom: floorY - floorHeight / 2
    };
  }

  function bodyOf(item) {
    return item && (item.body || (Array.isArray(item.bodies) && item.bodies[0])) || null;
  }

  function polygonArea(points) {
    if (!points || points.length < 3) return 0;
    let twiceArea = 0;
    for (let index = 0; index < points.length; index++) {
      const current = points[index];
      const next = points[(index + 1) % points.length];
      twiceArea += current.x * next.y - next.x * current.y;
    }
    return Math.abs(twiceArea) / 2;
  }

  function clipPolygon(points, axis, boundary, keepGreater) {
    if (!points.length) return [];
    const output = [];
    let previous = points[points.length - 1];
    let previousInside = keepGreater ? previous[axis] >= boundary : previous[axis] <= boundary;
    for (const current of points) {
      const currentInside = keepGreater ? current[axis] >= boundary : current[axis] <= boundary;
      if (currentInside !== previousInside) {
        const distance = current[axis] - previous[axis];
        if (distance !== 0) {
          const ratio = (boundary - previous[axis]) / distance;
          output.push({
            x: previous.x + (current.x - previous.x) * ratio,
            y: previous.y + (current.y - previous.y) * ratio
          });
        }
      }
      if (currentInside) output.push(current);
      previous = current;
      previousInside = currentInside;
    }
    return output;
  }

  function areaInsideCrucible(body) {
    if (!body || !Array.isArray(body.vertices) || body.vertices.length < 3) return 0;
    // Matter bounds enclose the vertices, including its velocity padding.
    // Most bodies are entirely outside or inside; only edge overlaps need clipping.
    const bounds = body.bounds;
    if (bounds) {
      if (bounds.max.x <= crucibleBounds.left || bounds.min.x >= crucibleBounds.right ||
          bounds.max.y <= crucibleBounds.top || bounds.min.y >= crucibleBounds.bottom) return 0;
      if (Number.isFinite(body.area) && body.area > 0 &&
          bounds.min.x >= crucibleBounds.left && bounds.max.x <= crucibleBounds.right &&
          bounds.min.y >= crucibleBounds.top && bounds.max.y <= crucibleBounds.bottom) return body.area;
    }
    const fullPolygonArea = polygonArea(body.vertices);
    if (fullPolygonArea <= 0) return 0;
    const clipped = clipPolygon(body.vertices, "x", crucibleBounds.left, true);
    const clippedRight = clipPolygon(clipped, "x", crucibleBounds.right, false);
    const clippedTop = clipPolygon(clippedRight, "y", crucibleBounds.top, true);
    const clippedBounds = clipPolygon(clippedTop, "y", crucibleBounds.bottom, false);
    const clippedPolygonArea = polygonArea(clippedBounds);
    if (clippedPolygonArea <= 0) return 0;
    const bodyArea = Number.isFinite(body.area) ? body.area : fullPolygonArea;
    return bodyArea * Math.min(1, clippedPolygonArea / fullPolygonArea);
  }

  function measureMass() {
    let mass = 0;
    for (const item of objects) {
      if (!item || !canEditObject(item)) continue;
      const root = item.body;
      const compound = root && root.parts && root.parts.length > 1;
      const bodies = root ? (compound ? root.parts : null) : item.bodies;
      const count = root && !compound ? 1 : Array.isArray(bodies) ? bodies.length : 0;
      let objectArea = 0;
      for (let index = compound ? 1 : 0; index < count; index++) {
        const body = bodies ? bodies[index] : root;
        const bodyArea = Number.isFinite(body.area) ? body.area : 0;
        if (bodyArea <= 0) continue;
        const areaInside = areaInsideCrucible(body);
        if (areaInside > bodyArea * 0.001) objectArea += areaInside;
      }
      mass += objectArea * MASS_PER_AREA;
    }
    return mass;
  }

  function cloneSelectedShapes() {
    const activeObjects = new Set(objects);
    const sources = Array.from(selected).filter((item) =>
      activeObjects.has(item) && canEditObject(item) && bodyOf(item)
    );
    if (!sources.length) {
      if (status) status("Select a drawn shape, then hold a Peace sign to clone it.");
      return;
    }
    let cloned = 0;
    for (const source of sources) {
      const existing = new Set(objects);
      if (cloneObject(source)) {
        const copy = objects.find((item) => !existing.has(item));
        if (copy) {
          selected.add(copy);
          cloned++;
        }
      }
    }
    if (status) {
      status(cloned
        ? "Cloned " + cloned + " shape(s). Pinch with both hands to scale; bring two pieces together to merge."
        : "That shape could not be cloned.");
    }
  }

  function resetPose() {
    poseCandidate = null;
    poseAnchor = null;
    poseFired = false;
  }

  function setHands(hands) {
    if (!gameCanvas || hasWon) {
      resetPose();
      return;
    }
    if (!Array.isArray(hands)) hands = [];
    let pose = null;
    let points = null;
    for (const landmarks of hands) {
      if (!Array.isArray(landmarks) || landmarks.length < 21) continue;
      let valid = true;
      for (let index = 0; index < 21; index++) {
        const point = landmarks[index];
        if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
          valid = false;
          break;
        }
      }
      if (!valid) continue;
      const candidatePoints = new Array(21);
      for (let index = 0; index < 21; index++) {
        const point = landmarks[index];
        candidatePoints[index] = {
          x: (1 - point.x) * gameCanvas.width,
          y: point.y * gameCanvas.height
        };
      }
      const candidatePose = classifyPose(candidatePoints);
      if (candidatePose === "PEACE") {
        pose = candidatePose;
        points = candidatePoints;
        break;
      }
    }
    if (!pose || !points) {
      resetPose();
      return;
    }
    const wrist = points[0];
    const handSize = Math.hypot(points[0].x - points[9].x, points[0].y - points[9].y);
    if (pose !== poseCandidate) {
      poseCandidate = pose;
      poseStartedAt = performance.now();
      poseAnchor = wrist;
      poseFired = false;
      return;
    }
    if (poseAnchor && handSize > 0 &&
        Math.hypot(wrist.x - poseAnchor.x, wrist.y - poseAnchor.y) > handSize * 0.5) {
      poseStartedAt = performance.now();
      poseAnchor = wrist;
      poseFired = false;
      return;
    }
    const holdMs = typeof POSE_HOLD_MS !== "undefined" ? POSE_HOLD_MS.PEACE || 500 : 500;
    if (!poseFired && performance.now() - poseStartedAt >= holdMs) {
      poseFired = true;
      cloneSelectedShapes();
    }
  }

  function showWin(won = true) {
    if (hasWon) return;
    hasWon = true;
    resetPose();
    const host = gameCanvas.parentElement;
    if (host) {
      winPanel = document.createElement("div");
      winPanel.className = "alchemist-win-panel";
      winPanel.setAttribute("role", "status");
      const title = document.createElement("strong");
      title.textContent = won ? "You win!" : "You lose!";
      const result = document.createElement("p");
      result.textContent = won ? "Perfect balance: " + target.mass + "g" : "Your friend finished first.";
      const again = document.createElement("button");
      again.type = "button";
      again.textContent = "Play again";
      replayButton = again;
      again.addEventListener("click", playAgain);
      winPanel.append(title, result, again);
      host.appendChild(winPanel);
    }
    const x = gameCanvas.width / 2;
    const y = (crucibleBounds.top + crucibleBounds.bottom) / 2;
    if (won && typeof spawnSparks === "function") spawnSparks(x, y, 64);
    if (won && typeof playTone === "function") {
      playTone(880, 0.12);
      playTone(1175, 0.16);
      playTone(1568, 0.22);
    }
    if (status) status((won ? "You win!" : "You lose!") + " Choose Play again for the next challenge.");
  }

  function update() {
    if (!gameCanvas || !crucibleBounds || hasWon) return;
    const target = currentTarget();
    currentMass = roundWeight(measureMass());
    if (currentMass === target.mass && !finishRequested) {
      if (connected()) {
        finishRequested = true;
        const event = { type: "finish", round: round, mass: currentMass };
        if (authority()) handleEvent(event, localId());
        else send(event);
      } else showWin();
    }
  }

  function drawCrucible(context) {
    if (!crucibleBounds) return;
    context.save();
    context.shadowColor = GOLD;
    context.shadowBlur = 24;
    context.fillStyle = "rgba(255, 217, 90, 0.32)";
    for (const body of crucibleBodies) {
      const width = body.bounds.max.x - body.bounds.min.x;
      const height = body.bounds.max.y - body.bounds.min.y;
      context.fillRect(body.bounds.min.x, body.bounds.min.y, width, height);
    }
    context.strokeStyle = GOLD;
    context.lineWidth = 3;
    context.beginPath();
    context.moveTo(crucibleBounds.left, crucibleBounds.top);
    context.lineTo(crucibleBounds.left, crucibleBounds.bottom);
    context.lineTo(crucibleBounds.right, crucibleBounds.bottom);
    context.lineTo(crucibleBounds.right, crucibleBounds.top);
    context.stroke();
    context.restore();
  }

  function render(context) {
    if (!gameCanvas || !crucibleBounds) return;
    drawCrucible(context);
    const target = currentTarget();
    const progress = Math.min(1, currentMass / target.mass);
    const barWidth = Math.min(280, gameCanvas.width * 0.48);
    const barX = (gameCanvas.width - barWidth) / 2;
    const barY = 72;
    context.save();
    context.textAlign = "center";
    context.textBaseline = "top";
    context.font = "bold 19px Arial, sans-serif";
    context.fillStyle = "#171717";
    context.shadowColor = GOLD;
    context.shadowBlur = 10;
    context.fillText("TARGET: " + target.shape.toUpperCase() + " - " + target.mass + "g",
      gameCanvas.width / 2, 14);
    context.shadowBlur = 0;
    context.font = "bold 16px Arial, sans-serif";
    context.fillText("CURRENT: " + currentMass + "g", gameCanvas.width / 2, 42);
    context.fillStyle = "#171717";
    context.fillRect(barX, barY, barWidth, 15);
    context.fillStyle = GOLD;
    context.fillRect(barX + 2, barY + 2, (barWidth - 4) * progress, 11);
    context.strokeStyle = "#171717";
    context.lineWidth = 2;
    context.strokeRect(barX, barY, barWidth, 15);
    context.font = "bold 12px Arial, sans-serif";
    context.fillStyle = "#171717";
    context.fillText("LEVEL " + (level + 1) + "  |  SELECT + PEACE: CLONE  |  TWO-HAND PINCH: SCALE",
      gameCanvas.width / 2, barY + 21);
    context.restore();
  }

  function init(context) {
    gameCanvas = context.canvas;
    status = context.setStatus;
    level = 0;
    round = 0;
    winner = null;
    finishRequested = false;
    readyPlayers.clear();
    // Session-seeded randomness gives both players the same opening target.
    previousTargetWeight = null;
    generateTarget();
    currentMass = 0;
    hasWon = false;
    resetPose();
    previousDrawMode = typeof drawModeOn === "undefined" ? null : drawModeOn;
    if (typeof window.setDrawMode === "function") window.setDrawMode(true);
    previousGravity = {
      x: engine.gravity.x,
      y: engine.gravity.y,
      scale: engine.gravity.scale,
      gravityOn: typeof gravityOn === "undefined" ? true : gravityOn
    };
    if (typeof setGravityEnabled === "function") setGravityEnabled(true, false);
    else {
      engine.gravity.x = 0;
      engine.gravity.y = 1;
    }
    createCrucible();
    isolatePartnerShapes();
    Matter.Events.on(engine, "beforeUpdate", isolatePartnerShapes);
    if (status) {
      status("Draw a shape, select it, and hold Peace to clone. Use two-hand pinching to scale; bring two grabbed shapes together to merge.");
    }
  }

  function unload() {
    restorePartnerCollisions();
    if (winPanel) winPanel.remove();
    winPanel = null;
    replayButton = null;
    readyPlayers.clear();
    if (crucibleBodies.length) Matter.Composite.remove(world, crucibleBodies);
    crucibleBodies = [];
    crucibleBounds = null;
    hasWon = false;
    resetPose();
    if (previousGravity) {
      if (typeof setGravityEnabled === "function") {
        setGravityEnabled(previousGravity.gravityOn, false);
      }
      engine.gravity.x = previousGravity.x;
      engine.gravity.y = previousGravity.y;
      engine.gravity.scale = previousGravity.scale;
      previousGravity = null;
    }
    if (previousDrawMode !== null && typeof window.setDrawMode === "function") {
      window.setDrawMode(previousDrawMode);
    }
    previousDrawMode = null;
    gameCanvas = null;
    status = null;
  }

  window.GameEngine.registerGame({
    isComplete: () => hasWon,
    id: "alchemist-scale",
    name: "The Alchemist's Scale",
    init: init,
    update: update,
    render: render,
    unload: unload,
    setHands: setHands,
    handleEvent: handleEvent,
    consumedPoses: ["PEACE"]
  });
})();
