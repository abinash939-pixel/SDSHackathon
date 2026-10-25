(() => {
  const registry = new Map();
  const drawer = document.getElementById("gameDrawer");
  const drawerToggle = document.getElementById("gameDrawerToggle");
  const gameList = document.getElementById("gameList");
  const gamePrompt = document.getElementById("gamePrompt");
  const gamePromptText = document.getElementById("gamePromptText");
  const gameStatus = document.getElementById("gameStatus");
  const gameControls = document.getElementById("gameControls");
  const gameStage = document.getElementById("wrap");
  let activeGame = null;
  let gameStarted = false;
  let startButton = null;
  let startHoverSince = null;
  const startReady = new Set();
  let activeGameId = null;
  let promptGameId = null;
  let promptDismissedUntil = 0;
  let gameSessionId = null;
  let gameSeed = 0;
  let gameRandomState = 0;
  let gameObjectSequence = 0;
  let gameBodySequence = 0;
  let gameBaselineObjects = new Set();
  let gameBaselineBodies = new Set();
  let gameBodies = new Map();
  let lastTaggedBodyList = null;
  let applyingRemoteControl = false;
  let localHands = [];
  let remoteHands = [];
  let remoteHandsUpdatedAt = 0;
  let gamePaused = false;
  let gameTutorial = null;
  let gameTutorialTimer = 0;
  let gameGestureState = null;
  let tutorialSwipePoints = [];

  const GAME_INSTRUCTIONS = {
    "mini-golf": "Draw your first stroke to release the ball automatically. Keep drawing ramps and obstacles to guide it into the hole.",
    "paper-dodgeball": "Choose 15, 30, 45, or 60 seconds at the top, then Start (both players in multiplayer). Drag your box to get a random shape and fling it across. Most of your objects on the opponent’s side when time ends wins." ,
    "asteroid-shooter": "Keep your base safe. Point your index finger: asteroids touching the red line are destroyed. Make a fist near an asteroid to shatter it.",
    "shape-sorter": "Draw the requested shape before its outline reaches the bottom. Separate strokes are allowed.",
    "alchemist-scale": "Draw shapes into the crucible and match the target weight. Select a shape and hold Peace to clone it; pinch with two hands to scale it. Weights round to 5g.",
  };

  function setStatus(message) {
    if (gameStatus) gameStatus.textContent = message;
  }

  function dismissGameTutorial() {
    if (gameTutorialTimer) window.clearTimeout(gameTutorialTimer);
    gameTutorialTimer = 0;
    if (gameTutorial) gameTutorial.remove();
    gameTutorial = null;
    tutorialSwipePoints = [];
  }

  let soloReplayButton = null;

  function removeSoloReplay() {
    if (soloReplayButton) soloReplayButton.remove();
    soloReplayButton = null;
  }

  function syncSoloReplay() {
    const eligible = activeGame && gameStarted && !multiplayerConnected() &&
      activeGameId !== "alchemist-scale" && activeGameId !== "asteroid-shooter" && activeGameId !== "mini-golf" && activeGameId !== "paper-dodgeball";
    if (!eligible) { removeSoloReplay(); return; }
    const completed = typeof activeGame.isComplete === "function";
    if (completed && !activeGame.isComplete()) {
      if (soloReplayButton) soloReplayButton.hidden = true;
      return;
    }
    if (!soloReplayButton) {
      const host = gameStage || gameControls;
      if (!host) return;
      soloReplayButton = document.createElement("button");
      soloReplayButton.type = "button";
      soloReplayButton.className = "game-control-button solo-game-replay";
      soloReplayButton.textContent = "Play again";
      soloReplayButton.addEventListener("click", () => {
        if (multiplayerConnected() || !activeGameId) return;
        const id = activeGameId;
        if (loadGame(id)) {
          if (typeof clearAll === "function") clearAll();
          chooseStart();
        }
      });
      host.appendChild(soloReplayButton);
    }
    soloReplayButton.hidden = false;
  }

  function clearRoundDrawings() {
    if (typeof objects === "undefined" || typeof removeObject !== "function") return;
    for (const object of objects.slice()) {
      if (!object.gameRole) removeObject(object);
    }
    if (typeof clearMoves === "function") clearMoves();
  }

  function multiplayerConnected() {
    return typeof window.isMultiplayerConnected === "function" && window.isMultiplayerConnected();
  }

  function beginGame() {
    if (!activeGame || gameStarted) return;
    try {
      if (typeof clearAll === "function") clearAll();
      // Both peers clear their own drawings; also discard stale partner copies locally.
      if (typeof objects !== "undefined" && typeof removeObject === "function" && window.sharedSpace) {
        const previousRemoteUpdate = window.sharedSpace.applyingRemoteUpdate;
        window.sharedSpace.applyingRemoteUpdate = true;
        try {
          for (const object of objects.slice()) removeObject(object);
        } finally {
          window.sharedSpace.applyingRemoteUpdate = previousRemoteUpdate;
        }
      }
      gameBaselineObjects = new Set(typeof objects === "undefined" ? [] : objects);
      withGameRandom(() => activeGame.init({
        canvas: canvas, context: ctx, controls: gameControls, setStatus: setStatus
      }));
      gameStarted = true;
      syncDrawerLock();
      tagGameEntities();
      dismissGameTutorial();
      startButton = null;
      setStatus(activeGame.name + " is ready.");
    } catch (error) {
      console.error("Could not initialize game:", error);
      // Allow unload to clean up a partially initialized game.
      gameStarted = true;
      unloadGame();
    }
  }

  function acceptStartReady(ownerId) {
    if (!activeGame || gameStarted) return;
    startReady.add(ownerId);
    const space = window.sharedSpace;
    if (space && startReady.has(space.localOwnerId) && startReady.has(space.remoteOwnerId)) {
      sendGameEvent({ type: "game-begin" });
      beginGame();
    }
  }

  function chooseStart() {
    if (!startButton || startButton.disabled || gameStarted) return;
    startButton.disabled = true;
    if (window.sharedSpace) startReady.add(window.sharedSpace.localOwnerId);
    if (!multiplayerConnected()) { beginGame(); return; }
    startButton.textContent = "Waiting for your friend…";
    if (window.isMinigameAuthority()) acceptStartReady(window.sharedSpace.localOwnerId);
    else sendGameEvent({ type: "game-ready" });
  }

  function updateStartHover(nowMs) {
    if (!startButton || startButton.disabled) return;
    const rect = startButton.getBoundingClientRect();
    const canvasRect = pointerCanvasRect();
    function over(point, seen) {
      if (!point || nowMs - seen > 200) return false;
      const x = canvasRect.left + point.x * canvasRect.width / canvas.width;
      const y = canvasRect.top + point.y * canvasRect.height / canvas.height;
      return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
    }
    const first = typeof handVisible !== "undefined" && handVisible &&
      over(typeof penVis !== "undefined" && penVis ? penVis : pen, lastSeenMs);
    const second = typeof h2 !== "undefined" && h2.visible && over(h2.vis || h2.pen, h2.seen);
    if (first || second) {
      if (startHoverSince === null) startHoverSince = nowMs;
      const progress = Math.min(1, (nowMs - startHoverSince) / 700);
      startButton.style.setProperty("--start-progress", (progress * 100) + "%");
      if (progress === 1) chooseStart();
    } else {
      startHoverSince = null;
      startButton.style.setProperty("--start-progress", "0%");
    }
  }

  let replayHoverTarget = null;
  let replayHoverSince = 0;
  let replayHoverFired = false;

  function updateReplayHover(nowMs) {
    if (!activeGame || !gameStarted ||
        (typeof activeGame.isComplete === "function" && !activeGame.isComplete())) {
      if (replayHoverTarget) replayHoverTarget.classList.remove("air-gesture-hover");
      replayHoverTarget = null;
      replayHoverFired = false;
      return;
    }
    const canvasRect = pointerCanvasRect();
    let target = null;
    function findButton(point, seen) {
      if (!point || nowMs - seen > 200) return null;
      const x = canvasRect.left + point.x * canvasRect.width / canvas.width;
      const y = canvasRect.top + point.y * canvasRect.height / canvas.height;
      const element = document.elementFromPoint(x, y);
      const button = element && element.closest(".asteroid-play-again, .alchemist-win-panel button, .solo-game-replay");
      return button && !button.disabled && !button.hidden && button.getClientRects().length ? button : null;
    }
    if (!window.airGestureEnabled) {
      if (typeof handVisible !== "undefined" && handVisible) {
        target = findButton(typeof penVis !== "undefined" && penVis ? penVis : pen, lastSeenMs);
      }
      if (!target && typeof h2 !== "undefined" && h2.visible) target = findButton(h2.vis || h2.pen, h2.seen);
    }
    if (target !== replayHoverTarget) {
      if (replayHoverTarget) replayHoverTarget.classList.remove("air-gesture-hover");
      replayHoverTarget = target;
      replayHoverSince = nowMs;
      replayHoverFired = false;
    }
    if (!target || replayHoverFired) return;
    target.classList.add("air-gesture-hover");
    const progress = Math.min(1, (nowMs - replayHoverSince) / 700);
    target.style.setProperty("--air-gesture-progress", (progress * 100) + "%");
    if (progress === 1) {
      replayHoverFired = true;
      target.classList.remove("air-gesture-hover");
      target.click();
    }
  }

  function showGameTutorial(gameId, gameName) {
    dismissGameTutorial();
    startReady.clear();
    startHoverSince = null;
    if (!gameStage) return;
    const panel = document.createElement("aside");
    panel.className = "game-start-panel";
    panel.setAttribute("role", "region");
    panel.setAttribute("aria-label", "Game instructions");
    const title = document.createElement("strong");
    title.textContent = "How to play " + gameName;
    const instructions = document.createElement("p");
    instructions.textContent = GAME_INSTRUCTIONS[gameId] || "Use your hand gestures to play.";
    const controls = document.createElement("p");
    controls.textContent = "Hold Peace to restart · Hold 🤟 to pause/resume.";
    const hint = document.createElement("p");
    hint.textContent = document.body.dataset.mode === "sandbox"
      ? "Click Start or hold your pointer over it."
      : "Click Start or hold your pointer over it. With a friend, both players must choose Start.";
    startButton = document.createElement("button");
    startButton.type = "button";
    startButton.textContent = "Start";
    startButton.addEventListener("click", chooseStart);
    panel.append(title, instructions, controls, hint, startButton);
    gameStage.appendChild(panel);
    gameTutorial = panel;
  }

  function restartGame() {
    if (!activeGameId) return;
    if (multiplayerConnected()) {
      setStatus("Both players must select Start or Play again to begin a new round.");
      return;
    }
    const gameId = activeGameId;
    loadGame(gameId);
    if (typeof showToast === "function") showToast("Game restarted");
  }

  function toggleGamePause() {
    if (!activeGame) return;
    gamePaused = !(typeof pausedWorld !== "undefined" && pausedWorld);
    if (typeof setPausedWorld === "function") setPausedWorld(gamePaused);
    setStatus(gamePaused ? "Game paused. Hold 🤟 to resume." : activeGame.name + " is ready.");
    if (typeof showToast === "function") showToast(gamePaused ? "Game paused" : "Game resumed");
  }

  function clearGamePause() {
    if (typeof pausedWorld !== "undefined" && pausedWorld &&
        typeof setPausedWorld === "function") setPausedWorld(false);
    gamePaused = false;
  }

  function updateGameGestures(hands, nowMs) {
    if (!activeGame || !gameStarted) {
      gameGestureState = null;
      tutorialSwipePoints = [];
      return;
    }
    const landmarks = Array.isArray(hands) ? hands[0] : null;
    if (!landmarks || landmarks.length < 21) {
      gameGestureState = null;
      tutorialSwipePoints = [];
      return;
    }
    const points = landmarks.map((point) => ({
      x: (1 - point.x) * canvas.width,
      y: point.y * canvas.height
    }));
    const pose = typeof classifyPose === "function" ? classifyPose(points) : null;
    const center = {
      x: (points[0].x + points[5].x + points[9].x + points[13].x + points[17].x) / 5,
      y: (points[0].y + points[5].y + points[9].y + points[13].y + points[17].y) / 5
    };
    if (gameTutorial && (pose === "OPEN PALM" || (pose === null &&
        typeof extendedCount === "function" && extendedCount(points) >= 3))) {
      tutorialSwipePoints.push(center);
      if (tutorialSwipePoints.length > 10) tutorialSwipePoints.shift();
      const first = tutorialSwipePoints[0];
      const last = tutorialSwipePoints[tutorialSwipePoints.length - 1];
      if (first && last && Math.abs(last.x - first.x) > canvas.width * 0.16 &&
          Math.abs(last.y - first.y) < canvas.width * 0.1) {
        dismissGameTutorial();
      }
    } else {
      tutorialSwipePoints = [];
    }
    if (pose !== "PEACE" && pose !== "I LOVE YOU") {
      gameGestureState = null;
      return;
    }
    const handSize = Math.hypot(points[0].x - points[9].x, points[0].y - points[9].y);
    if (!gameGestureState || gameGestureState.pose !== pose ||
        Math.hypot(center.x - gameGestureState.center.x, center.y - gameGestureState.center.y) >
          handSize * 0.5) {
      gameGestureState = { pose: pose, since: nowMs, center: center, fired: false };
      return;
    }
    if (gameGestureState.fired || nowMs - gameGestureState.since < 700) return;
    gameGestureState.fired = true;
    if (pose === "PEACE") restartGame();
    else toggleGamePause();
  }

  let pointerFrameRect = null;
  function pointerCanvasRect() {
    if (!pointerFrameRect) pointerFrameRect = canvas.getBoundingClientRect();
    return pointerFrameRect;
  }

  let exitButton = null;
  let exitHoverSince = null;

  function updateExitHover(nowMs) {
    if (!activeGame || !exitButton || exitButton.disabled) return;
    const rect = pointerCanvasRect();
    function over(point, seen) {
      if (!point || nowMs - seen > 200) return false;
      const x = rect.left + point.x * rect.width / canvas.width;
      const y = rect.top + point.y * rect.height / canvas.height;
      return document.elementFromPoint(x, y) === exitButton;
    }
    const first = typeof handVisible !== "undefined" && handVisible &&
      over(typeof penVis !== "undefined" && penVis ? penVis : pen, lastSeenMs);
    const second = typeof h2 !== "undefined" && h2.visible && over(h2.vis || h2.pen, h2.seen);
    if (!first && !second) {
      exitHoverSince = null;
      exitButton.style.setProperty("--exit-progress", "0%");
      return;
    }
    if (exitHoverSince === null) exitHoverSince = nowMs;
    const progress = Math.min(1, (nowMs - exitHoverSince) / 2000);
    exitButton.style.setProperty("--exit-progress", (progress * 100) + "%");
    if (progress === 1) {
      exitHoverSince = null;
      exitButton.click();
    }
  }

  let sandboxGravityControl = null;

  function setGameStageTheme(game) {
    if (typeof gravityBtn !== "undefined" && gravityBtn) {
      gravityBtn.disabled = !!game;
      gravityBtn.hidden = !!game;
    }
    if (typeof gButtons !== "undefined") {
      if (game && !sandboxGravityControl) {
        const index = gButtons.findIndex((button) => button.icon === "gravity");
        if (index >= 0) sandboxGravityControl = { index, button: gButtons.splice(index, 1)[0] };
      } else if (!game && sandboxGravityControl) {
        gButtons.splice(sandboxGravityControl.index, 0, sandboxGravityControl.button);
        sandboxGravityControl = null;
      }
    }
    if (!gameStage) return;
    if (exitButton) exitButton.remove();
    exitButton = null;
    exitHoverSince = null;
    if (game) {
      exitButton = document.createElement("button");
      exitButton.type = "button";
      exitButton.className = "game-exit-button";
      exitButton.textContent = "Exit game";
      exitButton.title = "Hold your pointer here for 2 seconds to exit";
      exitButton.addEventListener("click", () => {
        if (!activeGame || exitButton.disabled) return;
        exitButton.disabled = true;
        unloadGame();
      });
      gameStage.appendChild(exitButton);
    }
    gameStage.classList.toggle("game-active", !!game);
    if (game) gameStage.setAttribute("data-game-name", game.name);
    else gameStage.removeAttribute("data-game-name");
  }

  function gameInProgress() {
    return !!activeGame && gameStarted &&
      !(typeof activeGame.isComplete === "function" && activeGame.isComplete());
  }

  let drawerLocked = null;
  function syncDrawerLock() {
    const locked = gameInProgress();
    if (locked === drawerLocked) return;
    drawerLocked = locked;
    if (drawerToggle) {
      drawerToggle.disabled = locked;
      drawerToggle.setAttribute("aria-disabled", String(locked));
      drawerToggle.title = locked ? "Finish the game to open the games panel" : "Open Game Arcade";
    }
    if (drawer) {
      drawer.inert = locked;
      if (locked) setDrawerOpen(false);
    }
  }

  function setDrawerOpen(open) {
    if (open && gameInProgress()) return;
    if (!drawer || !drawerToggle) return;
    drawer.classList.toggle("open", open);
    drawerToggle.setAttribute("aria-expanded", String(open));
    drawer.setAttribute("aria-hidden", String(!open));
  }

  function isDrawerTabAt(point) {
    return !!point && point.x <= Math.min(42, canvas.width * 0.06) &&
      point.y >= canvas.height * 0.38 && point.y <= canvas.height * 0.62;
  }

  let drawerPointerTarget = null;
  let drawerPointerSince = 0;
  let drawerPointerFired = false;
  let drawerPointerAt = 0;
  let drawerCursor = null;

  function updateDrawerPointer(nowMs) {
    let target = null;
    let point = null;
    const dt = Math.min(50, Math.max(0, nowMs - drawerPointerAt));
    drawerPointerAt = nowMs;
    const candidates = [];
    if (!(typeof window.airGestureEnabled !== "undefined" && window.airGestureEnabled)) {
      if (typeof handVisible !== "undefined" && handVisible && nowMs - lastSeenMs <= 200) {
        candidates.push(typeof penVis !== "undefined" && penVis ? penVis : pen);
      }
      if (typeof h2 !== "undefined" && h2.visible && nowMs - h2.seen <= 200) candidates.push(h2.vis || h2.pen);
    }
    const rect = candidates.length ? pointerCanvasRect() : null;
    for (const candidate of candidates) {
      if (!candidate) continue;
      const x = rect.left + candidate.x * rect.width / canvas.width;
      const y = rect.top + candidate.y * rect.height / canvas.height;
      const element = document.elementFromPoint(x, y);
      const control = element && element.closest("#gameDrawerToggle, #gameDrawerClose, .game-arcade-item");
      const overDrawer = element && element.closest("#gameDrawer");
      if (!control && !overDrawer) continue;
      point = { x, y };
      if (drawer && drawer.classList.contains("open") && overDrawer) {
        const bounds = drawer.getBoundingClientRect();
        const edge = 36;
        const direction = y > bounds.bottom - edge ? 1 : y < bounds.top + edge ? -1 : 0;
        if (direction && drawer.scrollHeight > drawer.clientHeight) {
          drawer.scrollTop += direction * dt * 0.35;
          target = null;
          break;
        }
      }
      target = control && !control.disabled ? control : null;
      break;
    }
    if (point) {
      if (!drawerCursor) {
        drawerCursor = document.createElement("div");
        drawerCursor.className = "game-drawer-pointer";
        drawerCursor.setAttribute("aria-hidden", "true");
        document.body.appendChild(drawerCursor);
      }
      drawerCursor.hidden = false;
      drawerCursor.style.left = point.x + "px";
      drawerCursor.style.top = point.y + "px";
    } else if (drawerCursor) drawerCursor.hidden = true;
    if (target !== drawerPointerTarget) {
      if (drawerPointerTarget) drawerPointerTarget.classList.remove("air-gesture-hover");
      drawerPointerTarget = target;
      drawerPointerSince = nowMs;
      drawerPointerFired = false;
    }
    if (!target || drawerPointerFired) return;
    target.classList.add("air-gesture-hover");
    const progress = Math.min(1, (nowMs - drawerPointerSince) / 700);
    target.style.setProperty("--air-gesture-progress", (progress * 100) + "%");
    if (progress === 1) {
      drawerPointerFired = true;
      target.classList.remove("air-gesture-hover");
      target.click();
    }
  }

  function toggleDrawer() {
    if (!drawer) return;
    setDrawerOpen(!drawer.classList.contains("open"));
  }

  function registerGame(game) {
    if (!game || typeof game.id !== "string" || !game.id ||
        typeof game.name !== "string" || typeof game.init !== "function" ||
        typeof game.update !== "function" || typeof game.unload !== "function") {
      throw new TypeError("A game must define id, name, init, update, and unload");
    }
    if (registry.has(game.id)) throw new Error("Duplicate game id: " + game.id);
    registry.set(game.id, game);
    renderGameList();
  }

  function renderGameList() {
    if (!gameList) return;
    gameList.replaceChildren();
    for (const game of registry.values()) {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "game-arcade-item";
      item.textContent = game.name;
      item.addEventListener("click", () => loadGame(game.id));
      gameList.appendChild(item);
    }
  }

  function showPrompt(gameId, message) {
    if (!gamePrompt || !gamePromptText || promptDismissedUntil > performance.now()) return;
    promptGameId = gameId;
    gamePromptText.textContent = message;
    gamePrompt.hidden = false;
    setDrawerOpen(true);
  }

  function hidePrompt(dismissed) {
    if (gamePrompt) gamePrompt.hidden = true;
    if (dismissed) promptDismissedUntil = performance.now() + 10000;
    promptGameId = null;
  }

  function withGameRandom(callback) {
    const originalRandom = Math.random;
    Math.random = () => {
      gameRandomState = (gameRandomState + 0x6D2B79F5) >>> 0;
      let value = gameRandomState;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
    try {
      return callback();
    } finally {
      Math.random = originalRandom;
    }
  }

  function createSessionId() {
    return window.crypto && typeof window.crypto.randomUUID === "function"
      ? window.crypto.randomUUID()
      : "game-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
  }

  function tagGameEntities() {
    if (!activeGame || !gameSessionId) return;
    if (typeof objects !== "undefined") {
      for (const object of objects) {
        if (!object || gameBaselineObjects.has(object) || object.objectId ||
            object.ownerId || object.gameSessionId === gameSessionId) continue;
        object.gameSessionId = gameSessionId;
        object.objectId = "game:" + gameSessionId + ":object:" + gameObjectSequence++;
        object.ownerId = window.sharedSpace
          ? window.sharedSpace.authorityOwnerId
          : "local-game";
      }
    }
    if (multiplayerConnected() && typeof Matter !== "undefined" && typeof world !== "undefined") {
      const allBodies = Matter.Composite.allBodies(world);
      if (allBodies === lastTaggedBodyList) return;
      lastTaggedBodyList = allBodies;
      const objectBodies = new Set();
      if (typeof objects !== "undefined") {
        for (const object of objects) {
          for (const body of object && object.bodies || []) objectBodies.add(body);
        }
      }
      for (const body of allBodies) {
        if (!body || objectBodies.has(body) || gameBaselineBodies.has(body) ||
            (body.plugin && body.plugin.gameSessionId === gameSessionId)) continue;
        body.plugin = body.plugin || {};
        body.plugin.gameSessionId = gameSessionId;
        body.plugin.gameSyncId = "game:" + gameSessionId + ":body:" + gameBodySequence++;
        gameBodies.set(body.plugin.gameSyncId, body);
      }
    }
  }

  function matchInProgress() {
    return multiplayerConnected() && activeGame && gameStarted &&
      !(typeof activeGame.isComplete === "function" && activeGame.isComplete());
  }

  function loadGame(gameId, options = {}) {
    if (gameId !== activeGameId && matchInProgress()) {
      setStatus("Finish the current match before choosing another game.");
      if (typeof showToast === "function") showToast("Finish the current match first");
      return false;
    }
    const nextGame = registry.get(gameId);
    if (!nextGame) {
      setStatus("That game is not available.");
      return false;
    }
    if (!options.remote && typeof window.requestMinigameAction === "function" &&
        window.requestMinigameAction("start", gameId)) {
      setStatus("Asking the shared match host to start " + nextGame.name + ".");
      return true;
    }
    if (activeGame) {
      try {
        if (gameStarted) activeGame.unload();
      } catch (error) {
        console.error("Could not unload game " + activeGameId + ":", error);
        setStatus("The previous game could not shut down cleanly.");
        return false;
      }
    }
    removeSoloReplay();
    clearGamePause();
    activeGame = null;
    activeGameId = null;
    dismissGameTutorial();
    setGameStageTheme(null);
    if (gameControls) gameControls.replaceChildren();
    gameSessionId = options.sessionId || createSessionId();
    gameSeed = Number.isInteger(options.seed) ? options.seed >>> 0 : (Math.random() * 0x100000000) >>> 0;
    gameRandomState = gameSeed;
    gameObjectSequence = 0;
    gameBodySequence = 0;
    gameBodies = new Map();
    lastTaggedBodyList = null;
    gameBaselineObjects = new Set(typeof objects === "undefined" ? [] : objects);
    gameBaselineBodies = new Set(typeof Matter === "undefined" || typeof world === "undefined"
      ? []
      : Matter.Composite.allBodies(world));
    try {
      gameStarted = false;
      activeGame = nextGame;
      activeGameId = gameId;
      tagGameEntities();
      setGameStageTheme(nextGame);
      setStatus(nextGame.name + " is ready.");
      gamePaused = false;
      showGameTutorial(gameId, nextGame.name);
      hidePrompt(false);
      setDrawerOpen(false);
      if (!options.remote && typeof window.broadcastMinigameState === "function") {
        window.broadcastMinigameState({
          action: "start",
          gameId: gameId,
          sessionId: gameSessionId,
          seed: gameSeed
        });
      }
      return true;
    } catch (error) {
      console.error("Could not start game " + gameId + ":", error);
      try {
        nextGame.unload();
      } catch (cleanupError) {
        console.error("Could not clean up failed game " + gameId + ":", cleanupError);
      }
      gameSessionId = null;
      gameBaselineObjects.clear();
      gameBaselineBodies.clear();
      gameBodies.clear();
      setStatus(nextGame.name + " could not start. See the browser console for details.");
      return false;
    }
  }

  function unloadGame(options = {}) {
    if (!activeGame) return;
    if (!options.remote && typeof window.requestMinigameAction === "function" &&
        window.requestMinigameAction("stop")) {
      setStatus("Asking the shared match host to stop the game.");
      return;
    }
    removeSoloReplay();
    const previousGame = activeGame;
    const previousId = activeGameId;
    removeSoloReplay();
    clearGamePause();
    activeGame = null;
    activeGameId = null;
    dismissGameTutorial();
    setGameStageTheme(null);
    if (gameControls) gameControls.replaceChildren();
    try {
      if (gameStarted) previousGame.unload();
      gameStarted = false;
      syncDrawerLock();
      startButton = null;
      startReady.clear();
      setStatus("No game running.");
    } catch (error) {
      console.error("Could not unload game " + previousId + ":", error);
      setStatus("The game did not shut down cleanly.");
    } finally {
      gameSessionId = null;
      gameBaselineObjects.clear();
      gameBaselineBodies.clear();
      gameBodies.clear();
      gameObjectSequence = 0;
      gameBodySequence = 0;
    }
    if (!options.remote && typeof window.broadcastMinigameState === "function") {
      window.broadcastMinigameState({ action: "stop" });
    }
  }

  function applyRemoteState(state) {
    if (!state || typeof state !== "object") return;
    if (state.action === "stop") {
      unloadGame({ remote: true });
      return;
    }
    if (state.action !== "start" || typeof state.gameId !== "string" ||
        typeof state.sessionId !== "string" || !Number.isInteger(state.seed)) return;
    if (activeGameId === state.gameId && gameSessionId === state.sessionId) return;
    loadGame(state.gameId, {
      remote: true,
      sessionId: state.sessionId,
      seed: state.seed
    });
  }

  function getSessionState() {
    return activeGame
      ? { action: "start", gameId: activeGameId, sessionId: gameSessionId, seed: gameSeed }
      : { action: "stop" };
  }

  function getSyncState() {
    if (!activeGame || !gameStarted || !gameSessionId) return null;
    tagGameEntities();
    const canvasWidth = canvas.width || 1;
    const canvasHeight = canvas.height || 1;
    const bodies = [];
    const activeBodies = new Set(Matter.Composite.allBodies(world));
    for (const [id, body] of gameBodies) {
      if (!body || !activeBodies.has(body)) continue;
      bodies.push({
        id: id,
        x: body.position.x / canvasWidth,
        y: body.position.y / canvasHeight,
        angle: body.angle,
        vx: body.velocity.x / canvasWidth,
        vy: body.velocity.y / canvasHeight,
        angularVelocity: body.angularVelocity,
        isStatic: body.isStatic
      });
    }
    return { sessionId: gameSessionId, bodies: bodies };
  }

  function applySyncState(state) {
    if (!activeGame || !gameStarted || !state || state.sessionId !== gameSessionId ||
        !Array.isArray(state.bodies) || typeof Matter === "undefined") return;
    const canvasWidth = canvas.width || 1;
    const canvasHeight = canvas.height || 1;
    for (const item of state.bodies) {
      if (!item || typeof item.id !== "string" ||
          ![item.x, item.y, item.angle, item.vx, item.vy, item.angularVelocity]
            .every(Number.isFinite) || typeof item.isStatic !== "boolean") continue;
      const body = gameBodies.get(item.id);
      if (!body) continue;
      if (body.isStatic !== item.isStatic) Matter.Body.setStatic(body, item.isStatic);
      Matter.Body.setPosition(body, { x: item.x * canvasWidth, y: item.y * canvasHeight });
      Matter.Body.setAngle(body, item.angle);
      Matter.Body.setVelocity(body, { x: item.vx * canvasWidth, y: item.vy * canvasHeight });
      Matter.Body.setAngularVelocity(body, item.angularVelocity);
    }
  }

  function setHands(hands) {
    localHands = Array.isArray(hands) ? hands.slice(0, 2) : [];
    updateGameGestures(localHands, performance.now());
    if (remoteHandsUpdatedAt && performance.now() - remoteHandsUpdatedAt > 500) remoteHands = [];
    const restartingWithPeace = gameGestureState && gameGestureState.fired &&
      gameGestureState.pose === "PEACE";
    if (activeGame && gameStarted && typeof activeGame.setHands === "function" && !restartingWithPeace && !gamePaused &&
        !(typeof pausedWorld !== "undefined" && pausedWorld)) {
      const connected = typeof window.isMultiplayerConnected === "function" &&
        window.isMultiplayerConnected();
      let handsForGame = localHands;
      if (connected && remoteHands.length) {
        const localId = window.sharedSpace && window.sharedSpace.localOwnerId;
        const remoteId = window.sharedSpace && window.sharedSpace.remoteOwnerId;
        handsForGame = localId && remoteId && localId > remoteId
          ? remoteHands.slice(0, 1).concat(localHands.slice(0, 1))
          : localHands.slice(0, 1).concat(remoteHands.slice(0, 1));
      }
      withGameRandom(() => activeGame.setHands(handsForGame));
      if (typeof window.broadcastMinigameHands === "function") {
        window.broadcastMinigameHands(localHands);
      }
    }
  }

  function setRemoteHands(hands) {
    remoteHands = Array.isArray(hands) ? hands.slice(0, 2) : [];
    remoteHandsUpdatedAt = performance.now();
    if (!activeGame || !gameStarted || typeof activeGame.setHands !== "function" || gamePaused ||
        (typeof pausedWorld !== "undefined" && pausedWorld)) return;
    const localId = window.sharedSpace && window.sharedSpace.localOwnerId;
    const remoteId = window.sharedSpace && window.sharedSpace.remoteOwnerId;
    const handsForGame = localId && remoteId && localId > remoteId
      ? remoteHands.slice(0, 1).concat(localHands.slice(0, 1))
      : localHands.slice(0, 1).concat(remoteHands.slice(0, 1));
    withGameRandom(() => activeGame.setHands(handsForGame));
  }

  function handleRemoteRequest(action, gameId) {
    if (action === "start" && typeof gameId === "string") return loadGame(gameId);
    if (action === "stop") {
      unloadGame();
      return true;
    }
    return false;
  }

  function handleRemoteControl(index) {
    if (!Number.isInteger(index)) return;
    const controls = Array.from(document.querySelectorAll(
      "#gameControls button, #wrap .game-control-button, " +
      "#wrap .asteroid-restart-button"
    ));
    const control = controls[index];
    if (!control) return;
    if (typeof window.isMinigameAuthority === "function" &&
        window.isMinigameAuthority() &&
        typeof window.broadcastMinigameControl === "function") {
      window.broadcastMinigameControl(index);
    }
    applyingRemoteControl = true;
    try {
      control.click();
    } finally {
      applyingRemoteControl = false;
    }
  }

  function consumesPose(pose) {
    return !!activeGame && Array.isArray(activeGame.consumedPoses) &&
      activeGame.consumedPoses.includes(pose);
  }

  function capturesHandInput() {
    return !!activeGame && (!gameStarted || activeGame.captureInput === true);
  }

  function isGameRunning(gameId) {
    return !!activeGame && (!gameId || activeGameId === gameId);
  }

  function update(nowMs) {
    pointerFrameRect = null;
    updateExitHover(nowMs);
    syncDrawerLock();
    updateDrawerPointer(nowMs);
    updateReplayHover(nowMs);
    if (activeGame && !gameStarted) { updateStartHover(nowMs); return; }
    if (activeGame && !gamePaused && !(typeof pausedWorld !== "undefined" && pausedWorld)) {
      try {
        withGameRandom(() => activeGame.update(nowMs));
        tagGameEntities();
        syncSoloReplay();
      } catch (error) {
        console.error("Game update failed for " + activeGameId + ":", error);
        setStatus("The game encountered an error and was stopped.");
        unloadGame();
      }
    }
  }

  function render(context) {
    if (activeGame && gameStarted && typeof activeGame.render === "function") {
      try {
        activeGame.render(context);
      } catch (error) {
        console.error("Game rendering failed for " + activeGameId + ":", error);
        setStatus("The game could not render and was stopped.");
        unloadGame();
      }
    }
  }

  if (drawerToggle) drawerToggle.addEventListener("click", toggleDrawer);
  if (document.getElementById("gameDrawerClose")) {
    document.getElementById("gameDrawerClose").addEventListener("click", () => setDrawerOpen(false));
  }
  if (document.getElementById("gamePromptStart")) {
    document.getElementById("gamePromptStart").addEventListener("click", () => {
      const requestedGame = promptGameId;
      hidePrompt(false);
      if (requestedGame) loadGame(requestedGame);
    });
  }
  if (document.getElementById("gamePromptDismiss")) {
    document.getElementById("gamePromptDismiss").addEventListener("click", () => hidePrompt(true));
  }
  if (document.getElementById("gameStop")) {
    document.getElementById("gameStop").addEventListener("click", unloadGame);
  }
  document.addEventListener("click", (event) => {
    const target = event.target instanceof Element
      ? event.target.closest(
        "#gameControls button, #wrap .game-control-button, " +
        "#wrap .asteroid-restart-button"
      )
      : null;
    if (!target || applyingRemoteControl || !activeGame) return;
    const controls = Array.from(document.querySelectorAll(
      "#gameControls button, #wrap .game-control-button, " +
      "#wrap .asteroid-restart-button"
    ));
    const index = controls.indexOf(target);
    if (index < 0) return;
    const connected = typeof window.isMultiplayerConnected === "function" &&
      window.isMultiplayerConnected();
    if (!connected) return;
    if (typeof window.isMinigameAuthority === "function" && window.isMinigameAuthority()) {
      window.broadcastMinigameControl(index);
    } else {
      event.preventDefault();
      event.stopImmediatePropagation();
      window.requestMinigameControl(index);
    }
  }, true);
  window.addEventListener("pagehide", unloadGame);

  function sendGameEvent(payload) {
    if (typeof window.sendMinigameEvent === "function") {
      window.sendMinigameEvent({ sessionId: gameSessionId, gameId: activeGameId, payload: payload });
    }
  }

  function handleGameEvent(event, ownerId) {
    if (!activeGame || !event || event.sessionId !== gameSessionId ||
        event.gameId !== activeGameId || !event.payload) return;
    const payload = event.payload;
    if (payload.type === "game-ready") {
      if (multiplayerConnected() && window.isMinigameAuthority()) acceptStartReady(ownerId);
      return;
    }
    if (payload.type === "game-begin") {
      if (multiplayerConnected() && ownerId === window.sharedSpace.authorityOwnerId &&
          startReady.has(window.sharedSpace.localOwnerId)) beginGame();
      return;
    }
    if (gameStarted && typeof activeGame.handleEvent === "function") {
      withGameRandom(() => activeGame.handleEvent(payload, ownerId));
    }
  }

  window.GameEngine = {
    sendGameEvent: sendGameEvent,
    handleGameEvent: handleGameEvent,
    clearRoundDrawings: clearRoundDrawings,
    registerGame: registerGame,
    loadGame: loadGame,
    unloadGame: unloadGame,
    update: update,
    render: render,
    setHands: setHands,
    restartGame: restartGame,
    toggleGamePause: toggleGamePause,
    consumesPose: consumesPose,
    capturesHandInput: capturesHandInput,
    isGameRunning: isGameRunning,
    applyRemoteState: applyRemoteState,
    getSessionState: getSessionState,
    getSyncState: getSyncState,
    applySyncState: applySyncState,
    setRemoteHands: setRemoteHands,
    handleRemoteRequest: handleRemoteRequest,
    handleRemoteControl: handleRemoteControl,
    isDrawerTabAt: isDrawerTabAt,
    toggleDrawer: toggleDrawer
  };
})();