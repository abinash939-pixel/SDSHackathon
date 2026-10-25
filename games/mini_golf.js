(() => {
  const GOLD = "#ffd76a";
  const START_STROKE_DELAY_MS = 3000;
  const STUCK_SPEED = 0.55;
  let gameCanvas = null;
  let previousDrawMode = null;
  let controls = null;
  let status = null;
  let startButton = null;
  let ball = null;
  let hole = null;
  let courseWalls = [];
  let collisionHandler = null;
  let score = 0;
  let strokes = 0;
  let mode = "BUILD";
  let successUntil = 0;
  let stuckSince = 0;
  let lastUpdateAt = 0;
  let particles = [];
  let buildObjects = new Set();
  let pendingHoleScore = false;

  function removeBody(body) {
    if (body) Matter.Composite.remove(world, body);
  }

  function createCourse() {
    const width = gameCanvas.width;
    const height = gameCanvas.height;
    const holeX = width * (0.82 + Math.random() * 0.07);
    const holeY = height * (0.76 + Math.random() * 0.08);
    const holeRadius = Math.max(18, width * 0.022);

    hole = Matter.Bodies.circle(holeX, holeY, holeRadius, {
      isStatic: true,
      isSensor: true,
      label: "Mini Golf hole"
    });
    hole.plugin = hole.plugin || {};
    hole.plugin.miniGolfHole = true;
    Matter.Composite.add(world, hole);

    // The hole is an open sensor, with no solid bumpers blocking entry.
    courseWalls = [];

    const radius = Math.max(12, Math.min(20, Math.min(width, height) * 0.025));
    const start = {
      x: Math.max(radius + 12, width * 0.1),
      y: Math.max(radius + 20, height * 0.12)
    };
    ball = Matter.Bodies.circle(start.x, start.y, radius, {
      isStatic: true,
      density: 0.0022,
      friction: 0.08,
      frictionAir: 0.003,
      restitution: 0.72,
      label: "Mini Golf ball"
    });
    ball.plugin = ball.plugin || {};
    ball.plugin.miniGolfBall = true;
    ball.miniGolfStart = start;
    Matter.Composite.add(world, ball);
  }

  function setMode(nextMode) {
    mode = nextMode;
    if (startButton) {
      startButton.textContent = "Reset Ball";
      startButton.hidden = mode !== "PLAY";
    }
  }

  function resetBall() {
    if (!ball) return;
    if (!ball.isStatic) Matter.Body.setStatic(ball, true);
    Matter.Body.setPosition(ball, ball.miniGolfStart);
    Matter.Body.setAngle(ball, 0);
    Matter.Body.setVelocity(ball, { x: 0, y: 0 });
    Matter.Body.setAngularVelocity(ball, 0);
    stuckSince = 0;
    buildObjects = new Set(objects);
    setMode("BUILD");
  }

  function startDrop() {
    if (!ball) return;
    if (mode === "PLAY") {
      strokes++;
      resetBall();
      if (status) status("Mini-Golf: ball reset. Adjust your contraption and try again.");
      return;
    }
    setMode("PLAY");
    Matter.Body.setStatic(ball, false);
    stuckSince = 0;
    lastUpdateAt = performance.now();
    if (status) status("Mini-Golf: ball released. Guide it into the hole!");
  }

  function addSparks(x, y, count) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 7;
      particles.push({
        x: x,
        y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0,
        maxLife: 26 + Math.random() * 26
      });
    }
    if (typeof spawnSparks === "function") {
      spawnSparks(x, y, 40);
      spawnSparks(x - 12, y + 8, 36);
      spawnSparks(x + 12, y - 8, 36);
      spawnSparks(x, y - 14, 32);
    }
  }

  function scoreHole() {
    if (mode !== "PLAY" || !hole || !ball) return;
    score++;
    if (typeof clearAll === "function") clearAll();
    const x = hole.position.x;
    const y = hole.position.y;
    addSparks(x, y, 58);
    if (typeof playTone === "function") {
      playTone(988, 0.14);
      playTone(1318, 0.2);
      playTone(1568, 0.24);
    }
    successUntil = performance.now() + 1800;
    const radius = ball.circleRadius;
    const margin = radius + 12;
    ball.miniGolfStart = {
      x: margin + Math.random() * Math.max(0, gameCanvas.width - margin * 2),
      y: margin + Math.random() * Math.max(0, gameCanvas.height / 2 - margin * 2)
    };
    resetBall();
    if (status) status("In the hole! +1 point. Draw a new stroke to release the ball.");
  }

  function ballInsideHole() {
    if (!ball || !hole || mode !== "PLAY") return false;
    const dx = ball.position.x - hole.position.x;
    const dy = ball.position.y - hole.position.y;
    return dx * dx + dy * dy <= hole.circleRadius * hole.circleRadius;
  }

  function onCollisionStart(event) {
    if (mode !== "PLAY" || !ball || !hole) return;
    for (const pair of event.pairs) {
      if ((pair.bodyA === ball && pair.bodyB === hole) ||
          (pair.bodyB === ball && pair.bodyA === hole)) {
        if (ballInsideHole()) pendingHoleScore = true;
        return;
      }
    }
  }

  function createButton(context) {
    controls = context.controls;
    if (!controls) return;
    startButton = document.createElement("button");
    startButton.type = "button";
    startButton.className = "game-control-button";
    startButton.textContent = "Reset Ball";
    startButton.hidden = true;
    startButton.addEventListener("click", startDrop);
    controls.appendChild(startButton);
  }

  function init(context) {
    previousDrawMode = typeof drawModeOn === "undefined" ? null : drawModeOn;
    if (typeof window.setDrawMode === "function") window.setDrawMode(true);
    gameCanvas = context.canvas;
    status = context.setStatus;
    score = 0;
    pendingHoleScore = false;
    strokes = 0;
    mode = "BUILD";
    successUntil = 0;
    stuckSince = 0;
    lastUpdateAt = 0;
    particles = [];
    createCourse();
    buildObjects = new Set(objects);
    createButton(context);
    if (status) status("Draw one stroke to release the ball, then guide it into the hole!");
    collisionHandler = onCollisionStart;
    Matter.Events.on(engine, "collisionStart", collisionHandler);
  }

  function update(nowMs) {
    if (!gameCanvas || !ball) return;
    if (pendingHoleScore) {
      pendingHoleScore = false;
      if (mode === "PLAY") { scoreHole(); return; }
    }
    if (mode === "BUILD" && objects.some((item) =>
        item && !item.gameRole && !buildObjects.has(item))) startDrop();
    if (mode === "PLAY") {
      if (ballInsideHole()) { scoreHole(); return; }
      const dt = Math.min(50, Math.max(0, nowMs - (lastUpdateAt || nowMs)));
      lastUpdateAt = nowMs;
      if (ball.position.y > gameCanvas.height + ball.circleRadius) {
        strokes++;
        resetBall();
        if (typeof playTone === "function") playTone(120, 0.24);
        if (status) status("Ball lost. Stroke " + strokes + ". Adjust your drawing and try again.");
      } else {
        const worldPaused = typeof pausedWorld !== "undefined" && pausedWorld;
        const speed = Math.hypot(ball.velocity.x, ball.velocity.y);
        if (worldPaused) {
          stuckSince = 0;
        } else if (speed < STUCK_SPEED) {
          if (!stuckSince) stuckSince = nowMs;
          else if (nowMs - stuckSince >= START_STROKE_DELAY_MS) {
            strokes++;
            resetBall();
            if (typeof playTone === "function") playTone(130, 0.2);
            if (status) status("Ball stuck. Stroke " + strokes + ". Adjust your drawing and try again.");
          }
        } else {
          stuckSince = 0;
        }
        if (typeof engine !== "undefined" && engine.gravity.y === 0 && !ball.isStatic) {
          Matter.Body.applyForce(ball, ball.position, {
            x: 0,
            y: 0.0012 * ball.mass * (dt / (1000 / 60))
          });
        }
      }
    }

    const particleDt = Math.min(50, Math.max(0, nowMs - (update.lastParticlesAt || nowMs))) / 16.667;
    update.lastParticlesAt = nowMs;
    const particleDrag = Math.pow(0.98, particleDt);
    let liveParticles = 0;
    for (let index = 0; index < particles.length; index++) {
      const particle = particles[index];
      particle.x += particle.vx * particleDt;
      particle.y += particle.vy * particleDt;
      particle.vy += 0.1 * particleDt;
      particle.vx *= particleDrag;
      particle.life += particleDt;
      if (particle.life < particle.maxLife) particles[liveParticles++] = particle;
    }
    particles.length = liveParticles;
  }

  function render(context) {
    if (!gameCanvas || !hole || !ball) return;
    const holeRadius = hole.circleRadius;
    context.save();
    context.beginPath();
    context.arc(hole.position.x, hole.position.y, holeRadius, 0, Math.PI * 2);
    context.fillStyle = "rgba(10, 14, 22, 0.94)";
    context.strokeStyle = GOLD;
    context.lineWidth = 4;
    context.shadowColor = GOLD;
    context.shadowBlur = 22;
    context.fill();
    context.stroke();
    context.restore();

    for (const particle of particles) {
      context.save();
      context.globalAlpha = Math.max(0, 1 - particle.life / particle.maxLife);
      context.fillStyle = GOLD;
      context.shadowColor = GOLD;
      context.shadowBlur = 12;
      context.fillRect(particle.x - 2, particle.y - 2, 4, 4);
      context.restore();
    }

    context.save();
    context.beginPath();
    context.arc(ball.position.x, ball.position.y, ball.circleRadius, 0, Math.PI * 2);
    context.fillStyle = "#f4f6ff";
    context.strokeStyle = "#d7e4ff";
    context.lineWidth = 2;
    context.shadowColor = "#cbe2ff";
    context.shadowBlur = 14;
    context.fill();
    context.stroke();

    context.textAlign = "center";
    context.textBaseline = "top";
    context.font = "bold 19px 'Courier New', monospace";
    context.fillStyle = "#f6fbff";
    context.shadowColor = GOLD;
    context.shadowBlur = 12;
    context.fillText("SCORE: " + score, gameCanvas.width * 0.24, 14);
    context.fillText("STROKES: " + strokes, gameCanvas.width * 0.5, 14);
    context.fillText("MODE: " + mode, gameCanvas.width * 0.77, 14);
    if (performance.now() < successUntil) {
      context.textBaseline = "middle";
      context.font = "bold 48px 'Courier New', monospace";
      context.fillStyle = GOLD;
      context.shadowBlur = 26;
      context.fillText("IN THE HOLE! +1", gameCanvas.width / 2, gameCanvas.height * 0.4);
    }
    context.restore();
  }

  function unload() {
    if (previousDrawMode !== null && typeof window.setDrawMode === "function") {
      window.setDrawMode(previousDrawMode);
    }
    previousDrawMode = null;
    if (collisionHandler) Matter.Events.off(engine, "collisionStart", collisionHandler);
    collisionHandler = null;
    removeBody(ball);
    removeBody(hole);
    for (const wall of courseWalls) removeBody(wall);
    courseWalls = [];
    if (startButton) startButton.remove();
    startButton = null;
    controls = null;
    status = null;
    ball = null;
    hole = null;
    gameCanvas = null;
    particles = [];
    mode = "BUILD";
    buildObjects.clear();
    pendingHoleScore = false;
    update.lastParticlesAt = 0;
  }

  window.GameEngine.registerGame({
    id: "mini-golf",
    name: "Rube Goldberg Mini-Golf",
    init: init,
    update: update,
    render: render,
    unload: unload
  });
})();
