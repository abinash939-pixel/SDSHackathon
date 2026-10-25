let primaryHandPresent = false;
let secondaryHandPresent = false;
// ------------------------------------------------------------
// Camera, MediaPipe Hand Tracker, Gestures, and Mouse Input
// ------------------------------------------------------------

// Ensure Shaka pose timings and actions are registered even if config.js is cached
if (typeof POSE_HOLD_MS !== "undefined") {
  if (!POSE_HOLD_MS["SHAKA UP"]) POSE_HOLD_MS["SHAKA UP"] = 500;
  if (!POSE_HOLD_MS["SHAKA DOWN"]) POSE_HOLD_MS["SHAKA DOWN"] = 500;
}
if (typeof GESTURE_ACTIONS !== "undefined") {
  if (!GESTURE_ACTIONS["SHAKA UP"]) GESTURE_ACTIONS["SHAKA UP"] = "selectAll";
  if (!GESTURE_ACTIONS["SHAKA DOWN"]) GESTURE_ACTIONS["SHAKA DOWN"] = "deselect";
}

// ------------------------------------------------------------
// Camera and tracker setup
// ------------------------------------------------------------
const TOOLBAR_DRAG_SLOP = 28;
let h1ToolbarTouch = null;
let h2ToolbarTouch = null;
let mouseToolbarTouch = null;

// Turns a camera error into a plain-language message.
function explainCameraError(err) {
  const name = err && err.name ? err.name : "";
  let msg;
  if (name === "NeedsSecure") {
    msg = "The camera only works on a secure page (localhost or https).";
  } else if (name === "NotAllowedError" || name === "SecurityError") {
    msg = "Camera permission was blocked. Click the camera icon in the address bar, choose Allow, then reload.";
  } else if (name === "NotFoundError" || name === "OverconstrainedError") {
    msg = "No usable camera was found.";
  } else if (name === "NotReadableError" || name === "AbortError") {
    msg = "The camera is busy or was shut down. Close other tabs or apps that use the camera " +
      "(an older copy of this page, Zoom, Teams, the Camera app), then reload.";
  } else {
    msg = "Camera error: " + (err && err.message ? err.message : name);
  }
  if (location.protocol === "file:") {
    msg += " Tip: do not open this file straight from the folder. Open it with Live Server (http://localhost) instead.";
  }
  return msg;
}

async function openCameraStream() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    const e = new Error("no mediaDevices");
    e.name = "NeedsSecure";
    throw e;
  }
  const wanted = {
    video: {
      facingMode: "user",
      width: { ideal: 960 },
      height: { ideal: 540 },
      frameRate: { ideal: 30, max: 30 }
    },
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true
    }
  };
  try {
    return await navigator.mediaDevices.getUserMedia(wanted);
  } catch (err) {
    // Preserve video when microphone permission or audio capture is unavailable.
    if (err.name === "NotReadableError" || err.name === "AbortError" || err.name === "OverconstrainedError") {
      await new Promise((resolve) => setTimeout(resolve, 900));
    }
    return await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
  }
}

// Let go of the camera when the page closes, so the next copy of the page can use it.
window.addEventListener("pagehide", () => {
  const st = video.srcObject;
  if (st) st.getTracks().forEach((t) => t.stop());
});

async function startCamera() {
  let stream;
  try {
    stream = await openCameraStream();
  } catch (err) {
    err.friendly = explainCameraError(err);
    throw err;
  }
  window.localAudioAvailable = stream.getAudioTracks().some((track) => track.readyState === "live");
  video.controls = false;
  video.removeAttribute("controls");
  video.disablePictureInPicture = true;
  video.disableRemotePlayback = true;
  video.muted = true;
  video.playsInline = true;
  video.setAttribute("muted", "");
  video.setAttribute("playsinline", "");
  video.srcObject = stream;
  window.dispatchEvent(new Event("local-media-ready"));
  try {
    await video.play();
  } catch (playError) {
    console.warn("video.play() autoplay notice:", playError);
  }
  if (!video.videoWidth || video.readyState < 2) {
    await new Promise((resolve) => {
      let timer;
      const finish = () => {
        clearTimeout(timer);
        resolve();
      };
      video.addEventListener("loadedmetadata", finish, { once: true });
      video.addEventListener("canplay", finish, { once: true });
      timer = setTimeout(finish, 1200);
    });
  }
  canvas.width = video.videoWidth || 960;
  canvas.height = video.videoHeight || 540;
}

async function startTracker() {
  const vision = await import("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs");
  const { HandLandmarker, FilesetResolver } = vision;
  const fileset = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
  );
  const options = (delegate) => ({
    baseOptions: {
      modelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
      delegate: delegate
    },
    runningMode: "VIDEO",
    numHands: 2,
    minHandDetectionConfidence: 0.5,
    minHandPresenceConfidence: 0.5,
    minTrackingConfidence: 0.35
  });
  try {
    landmarker = await HandLandmarker.createFromOptions(fileset, options("GPU"));
  } catch (err) {
    landmarker = await HandLandmarker.createFromOptions(fileset, options("CPU"));
  }
}

// ------------------------------------------------------------
// Pose gestures: open palm, fist, peace, thumbs, shaka, and sideways swipe
// ------------------------------------------------------------

// True while the hand is closing into a fist: the three fingers beside the index are curled
// and the index tip is already tucked close to the wrist. A thumb-index pinch happens
// on the way to a fist, so this stops it from drawing.
function handClosing(pts) {
  const wrist = pts[0];
  const size = dist(pts[0], pts[9]);
  if (size <= 0) return false;
  const ext = (tip, pip) => dist(pts[tip], wrist) > dist(pts[pip], wrist) * 1.08;
  const othersOut = ext(12, 10) || ext(16, 14) || ext(20, 18);
  return !othersOut && dist(pts[8], wrist) < size * FIST_BLOCK_INDEX_MAX;
}

// The label shows what the pose will do right now.
function poseLabel(pose) {
  const sel = selected.size > 0;
  if (pose === "OPEN PALM") return "Deselect all";
  if (pose === "I LOVE YOU") return pausedWorld ? "Resume 🤟" : "Pause 🤟";
  if (pose === "FIST") return sel ? "Destroy (keep holding)" : "Fist";
  if (pose === "PEACE") return "Clone";
  if (pose === "CROSSED FINGERS") return drawModeOn ? "Draw mode off" : "Draw mode on";
  if (pose === "THUMBS UP") return sel ? "Float" : "Gravity off";
  if (pose === "THUMBS DOWN") return sel ? "Fall" : "Gravity on";
  if (pose === "SHAKA UP") return "Select all (" + objects.length + ")";
  if (pose === "SHAKA DOWN") return "Deselect all";
  return pose;
}

function showToast(text) {
  toast = { text: text, until: performance.now() + 1400 };
}

const drawModeBtn = document.getElementById("drawModeBtn");

function updateDrawModeButton() {
  if (!drawModeBtn) return;
  drawModeBtn.textContent = drawModeOn ? "Draw mode on" : "Draw mode off";
  drawModeBtn.setAttribute("aria-pressed", String(drawModeOn));
}

function setDrawMode(enabled) {
  if (enabled && window.GameEngine && window.GameEngine.isGameRunning("asteroid-shooter")) {
    showToast("Drawing is disabled in Asteroid Shooter");
    return;
  }
  drawModeOn = !!enabled;
  if (!drawModeOn) {
    current = null;
    pending = [];
    if (typeof h2 !== "undefined") h2.current = null;
  }
  updateDrawModeButton();
  showToast(drawModeOn
    ? "Draw mode on - pinch to draw"
    : "Draw mode off - object interactions only");
}

window.setDrawMode = setDrawMode;
updateDrawModeButton();

if (drawModeBtn) {
  drawModeBtn.addEventListener("click", () => setDrawMode(!drawModeOn));
}

// Looks at the 21 hand points (real hand position) and names the pose, or returns null.
function classifyPose(pts) {
  if (!Array.isArray(pts) || pts.length < 21 || pts.some((point) =>
      !point || !Number.isFinite(point.x) || !Number.isFinite(point.y))) return null;
  const wrist = pts[0];
  const handSize = dist(pts[0], pts[9]);
  if (handSize <= 0) return null;

  // Joint alignment helps when a straight finger is angled toward the camera.
  const ext = (tip, pip) => {
    const tipDistance = dist(pts[tip], wrist);
    const jointDistance = dist(pts[pip], wrist);
    if (tipDistance > jointDistance * 1.08) return true;
    const base = pts[pip - 1];
    const firstX = base.x - pts[pip].x, firstY = base.y - pts[pip].y;
    const lastX = pts[tip].x - pts[pip].x, lastY = pts[tip].y - pts[pip].y;
    const lengths = Math.hypot(firstX, firstY) * Math.hypot(lastX, lastY);
    return lengths > 0 && (firstX * lastX + firstY * lastY) / lengths < -0.8 &&
      tipDistance > jointDistance * 1.02 && dist(pts[tip], base) > handSize * 0.3;
  };
  const indexE = ext(8, 6);
  const middleE = ext(12, 10);
  const ringE = ext(16, 14);
  const pinkyE = ext(20, 18);
  const thumbE =
    dist(pts[4], pts[17]) > dist(pts[3], pts[17]) * 1.05 &&
    dist(pts[4], pts[5]) > handSize * 0.45;
  const count = [indexE, middleE, ringE, pinkyE].filter(Boolean).length;

  // 🤟: thumb, index, and pinky extended; middle and ring folded.
  if (thumbE && indexE && pinkyE && !middleE && !ringE) return "I LOVE YOU";

  if (count === 4) return "OPEN PALM";

  // Shaka gesture: thumb and pinky extended, while index, middle, and ring are curled.
  // Normal orientation (thumb above pinky) selects all; inverted (pinky above thumb) deselects all.
  if (thumbE && pinkyE && !indexE && !middleE && !ringE && dist(pts[4], pts[20]) > handSize * 0.85) {
    if (pts[4].y <= pts[20].y + 0.1 * handSize) {
      return "SHAKA UP";
    }
    return "SHAKA DOWN";
  }

  // 🤞: index and middle fingers cross, while ring and pinky stay curled.
  const indexMiddleGap = dist(pts[8], pts[12]);
  const baseX = pts[9].x - pts[5].x;
  const baseY = pts[9].y - pts[5].y;
  const baseWidth = Math.hypot(baseX, baseY);
  const tipOrder = baseWidth > 0
    ? ((pts[12].x - pts[8].x) * baseX + (pts[12].y - pts[8].y) * baseY) / baseWidth
    : Infinity;
  if (indexE && middleE && !ringE && !pinkyE &&
      baseWidth > handSize * 0.1 && tipOrder < -handSize * 0.025 &&
      indexMiddleGap < handSize * 0.6) return "CROSSED FINGERS";

  // Peace requires separated fingertips, preserving the distinction from crossed fingers.
  if (indexE && middleE && !ringE && !pinkyE && indexMiddleGap > handSize * 0.25) return "PEACE";

  if (count === 0) {
    if (thumbE) {
      if (pts[4].y < pts[2].y - 0.4 * handSize) return "THUMBS UP";
      if (pts[4].y > pts[2].y + 0.4 * handSize) return "THUMBS DOWN";
      return null;
    }
    // A fist has the index tip tucked in close to the wrist. A pinch does not.
    if (dist(pts[8], wrist) < handSize * FIST_INDEX_MAX) return "FIST";
  }
  return null;
}

// How many of the four fingers (not the thumb) are stretched out. Used to accept a blurry open hand during a swipe.
function extendedCount(pts) {
  const wrist = pts[0];
  const ext = (tip, pip) => dist(pts[tip], wrist) > dist(pts[pip], wrist) * 1.08;
  return [ext(8, 6), ext(12, 10), ext(16, 14), ext(20, 18)].filter(Boolean).length;
}

// The middle of the palm: steadier than the wrist when the hand moves fast.
function palmCenter(pts) {
  let x = 0;
  let y = 0;
  for (const i of [0, 5, 9, 13, 17]) {
    x += pts[i].x;
    y += pts[i].y;
  }
  return { x: x / 5, y: y / 5 };
}

function selectAllObjects() {
  if (objects.length === 0) {
    showToast("No objects on screen");
    return;
  }
  for (const o of objects) {
    selected.add(o);
  }
  lastSelectMs = performance.now();
  if (typeof playTone === "function") playTone(660, 0.08);
  showToast("Selected all (" + selected.size + ")");
  if (typeof syncButtons === "function") syncButtons();
}

function runAction(name, triggerPen) {
  if ((name === "floatUp" || name === "fallDown") && window.GameEngine &&
      window.GameEngine.isGameRunning()) return;
  if (name === "pause") {
    setPausedWorld(!pausedWorld);
    showToast(pausedWorld ? "Paused" : "Resumed");
  } else if (name === "selectAll") {
    selectAllObjects();
  } else if (name === "deselect") {
    if (selected.size === 0) {
      showToast("Nothing selected");
      return;
    }
    clearSelection();
    if (typeof playTone === "function") playTone(440, 0.07);
    showToast("Deselected all");
  } else if (name === "floatUp") {
    if (selected.size > 0) {
      floatSelected("on");
    } else {
      if (gravityOn) toggleGravity();
      showToast("Gravity off");
    }
  } else if (name === "fallDown") {
    if (selected.size > 0) {
      floatSelected("off");
    } else {
      if (!gravityOn) toggleGravity();
      showToast("Gravity on");
    }
  } else if (name === "palm") {
    if (selected.size > 0) {
      clearSelection();
      showToast("Deselected all");
    }
  } else if (name === "destroyPose") {
    if (selected.size > 0) destroySelected();   // a fist with nothing selected does nothing
  } else if (name === "clone") {
    cloneSelected();
  } else if (name === "undo") {
    // Phase 2 swipe-to-erase: if hovering over an object, erase that object; otherwise undo last drawing
    const activePen = triggerPen || pen || h2.pen;
    const hoveredTarget = activePen ? objectAtPoint(activePen) : null;
    if (hoveredTarget) {
      redoStack.push(serObj(hoveredTarget));
      shatter(hoveredTarget);
      removeObject(hoveredTarget);
      if (typeof playTone === "function") playTone(200, 0.12);
      showToast("Erased " + (hoveredTarget.shapeType || "object"));
      if (typeof syncButtons === "function") syncButtons();
      return;
    }
    const last = objects[objects.length - 1];
    if (last) {
      redoStack.push(serObj(last));
      shatter(last);
      removeObject(last);
      showToast("Undid last drawing");
    } else {
      showToast("Nothing to undo");
    }
  }
}

// True while the ring is on something that has its own hold action (button, tab).
function ringOnTarget() {
  if (!pen) return false;
  if (showBar && toolbarPanelAt(pen)) return true;
  if (tabAt(pen)) return true;
  return false;
}

function resetPose() {
  candPose = null;
  candFired = false;
  wristHist = [];
}

function updatePose(nowMs) {
  const real = skeletonPts;

  // A short stroke followed by a fist is almost always the hand closing, not a drawing: remove it.
  if (lastStrokeObj) {
    if (nowMs - lastStrokeAt > ACCIDENT_WINDOW_MS || !objects.includes(lastStrokeObj)) {
      lastStrokeObj = null;
    } else if (real && lastStrokeObj.strokeLen < ACCIDENT_MAX_LEN && classifyPose(real) === "FIST") {
      removeObject(lastStrokeObj);
      lastStrokeObj = null;
      cancelled++;
      showToast("Stray stroke removed");
    }
  }

  const busy = pinching || grabbed || grabCandidate || tabHold || h1ToolbarTouch || onCount > 0;
  if (!real || busy || nowMs < poseBlockUntil) {
    resetPose();
    return;
  }
  const raw = classifyPose(real);
  if (window.GameEngine && window.GameEngine.isGameRunning() &&
      (raw === "PEACE" || raw === "OPEN PALM" || raw === "I LOVE YOU")) {
    resetPose();
    return;
  }
  if (window.GameEngine && window.GameEngine.consumesPose(raw)) {
    resetPose();
    return;
  }

  // Swipe: move an open hand sideways in one smooth sweep.
  // Tolerant on purpose: a moving hand is blurry, so a mostly-open hand counts too.
  swipeProgress = 0;
  const openish = raw === "OPEN PALM" || (raw === null && extendedCount(real) >= 3);
  if (openish) {
    const c = palmCenter(real);
    wristHist.push({ x: c.x, y: c.y, t: nowMs });
    wristHist = wristHist.filter((p) => nowMs - p.t <= SWIPE_WINDOW_MS);
    if (wristHist.length >= 3) {
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      for (const p of wristHist) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      }
      const dx = maxX - minX;
      const dy = maxY - minY;
      const net = Math.abs(wristHist[wristHist.length - 1].x - wristHist[0].x);
      const need = Math.max(canvas.width * SWIPE_MIN_FRACTION, dist(real[0], real[9]) * SWIPE_MIN_HANDS);
      if (dy < dx * 0.7 && net >= dx * 0.7) swipeProgress = Math.min(1, dx / need);
      if (swipeProgress >= 1 && nowMs >= swipeCooldownUntil) {
        runAction(SWIPE_ACTION, h2.pen);
        swipeCooldownUntil = nowMs + SWIPE_COOLDOWN_MS;
        poseBlockUntil = nowMs + POSE_POST_PINCH_MS;
        swipeProgress = 0;
        resetPose();
        return;
      }
    }
  } else {
    wristHist = [];
  }

  // Hold poses: ignored while the ring sits on a button or the tab
  let pose = ringOnTarget() ? null : raw;
  if (pose === "OPEN PALM" && hoverObj) pose = null;   // selecting with an open hand must not trigger the palm action
  // Just selected something: ignore the open palm for a moment, then it must be held steadily from scratch
  if (pose === "OPEN PALM" && selected.size > 0 && nowMs - lastSelectMs < SELECT_SETTLE_MS) pose = null;
  if (pose) lastPoseMs = nowMs;
  if (!pose && candPose && nowMs - lastPoseMs < POSE_GRACE_MS) return;
  const size = dist(real[0], real[9]);
  if (pose && pose === candPose && candWrist && dist(real[0], candWrist) > size * POSE_MOVE_TOL) {
    candStartMs = nowMs;            // the hand drifted: restart the hold
    candWrist = { x: real[0].x, y: real[0].y };
    // A fired pose stays latched until the hand changes pose.
  }
  if (pose !== candPose) {
    candPose = pose;
    candStartMs = nowMs;
    candFired = false;
    candWrist = pose ? { x: real[0].x, y: real[0].y } : null;
  }
  const holdTarget = (candPose && POSE_HOLD_MS[candPose]) ? POSE_HOLD_MS[candPose] : 500;
  if (candPose && !candFired && nowMs - candStartMs >= holdTarget) {
    candFired = true;
    runAction(GESTURE_ACTIONS[candPose]);
  }
}

function endPinch() {
  if (typeof endPaperPick === "function") endPaperPick(1);
  if (h1ToolbarTouch) {
    if (!h1ToolbarTouch.isScrolling) {
      const button = h1ToolbarTouch.targetBtn || (pen ? buttonAt(pen) : null);
      if (button) pressButton(button, performance.now());
    }
    h1ToolbarTouch = null;
  }
  if (grabbed) releaseGrab();
  grabCandidate = null;
  tabHold = null;
  endStroke();
  poseBlockUntil = performance.now() + POSE_POST_PINCH_MS;
}

function endStroke() {
  if (current) {
    const prevLast = objects[objects.length - 1];
    const len = pathLength(current);
    commitStroke(current);
    const last = objects[objects.length - 1];
    if (last && last !== prevLast) {
      lastStrokeObj = last;
      lastStrokeObj.strokeLen = len;
      lastStrokeAt = performance.now();
    }
  }
  current = null;
  pinching = false;
  onCount = 0;
  offCount = 0;
  pending = [];
}

function handleHand(landmarks, nowMs) {
  primaryHandPresent = true;
  const W = canvas.width;
  const H = canvas.height;
  // Mirror x so the drawing matches the mirrored video.
  // The Reach setting stretches hand movement around a comfortable centre point,
  // so a small hand movement covers the whole screen (including the top buttons).
  const gain = REACH_LEVELS[reachIdx];
  const ax = W / 2;
  const ay = H * REACH_ANCHOR_Y;
  const pts = landmarks.map((p) => ({
    x: ax + ((1 - p.x) * W - ax) * gain,
    y: ay + (p.y * H - ay) * gain
  }));
  // The skeleton is drawn where your hand really is. Only the pen ring is stretched by Reach.
  skeletonPts = landmarks.map((p) => ({ x: (1 - p.x) * W, y: p.y * H }));
  realPen = {
    x: (skeletonPts[4].x + skeletonPts[8].x) / 2,
    y: (skeletonPts[4].y + skeletonPts[8].y) / 2
  };

  {
    const a = Math.atan2(skeletonPts[9].y - skeletonPts[0].y, skeletonPts[9].x - skeletonPts[0].x);
    handAng = handAng === null ? a : handAng + angDiff(a, handAng) * 0.35;
  }
  handVisible = true;
  lastSeenMs = nowMs;

  const handSize = Math.hypot(pts[0].x - pts[9].x, pts[0].y - pts[9].y);
  const thumb = pts[4];
  const index = pts[8];
  const gap = Math.hypot(thumb.x - index.x, thumb.y - index.y);
  const ratio = handSize > 0 ? gap / handSize : 1;
  lastRatio = ratio;

  const t = nowMs / 1000;
  const rawX = Math.min(W, Math.max(0, (thumb.x + index.x) / 2));
  const rawY = Math.min(H, Math.max(0, (thumb.y + index.y) / 2));
  pen = { x: filterX.filter(rawX, t), y: filterY.filter(rawY, t) };
  if (prevPenPos && t > prevPenT) {
    const dt = t - prevPenT;
    const vx = (pen.x - prevPenPos.x) / dt;
    const vy = (pen.y - prevPenPos.y) / dt;
    penVel.vx = penVel.vx * 0.6 + vx * 0.4;
    penVel.vy = penVel.vy * 0.6 + vy * 0.4;
    const inst = Math.hypot(vx, vy);
    penSpeed = penSpeed * 0.6 + inst * 0.4;
  }
  prevPenPos = { x: pen.x, y: pen.y };
  prevPenT = t;

  const currentPose = classifyPose(skeletonPts);
  const fistNow =
    currentPose === "CROSSED FINGERS" ||
    currentPose === "FIST" ||
    currentPose === "SHAKA UP" ||
    currentPose === "SHAKA DOWN" ||
    handClosing(skeletonPts);

  if (window.GameEngine && window.GameEngine.capturesHandInput()) {
    if (grabbed) releaseGrab();
    if (typeof endPaperPick === "function") endPaperPick(1);
    current = null;
    grabCandidate = null;
    h1ToolbarTouch = null;
    tabHold = null;
    pinching = false;
    onCount = 0;
    offCount = 0;
    pending = [];
    resetPose();
    return;
  }

  if (!pinching) {
    if (ratio < PINCH_START && !fistNow && penSpeed < PINCH_MAX_SPEED) {
      onCount++;
      pending.push({ x: pen.x, y: pen.y });
      if (onCount >= DEBOUNCE_FRAMES) {
        pinching = true;
        offCount = 0;
        tabHold = null;
        if (tabAt(pen)) {
          // Pinching on the arrow tab: hold to open or hide the panel (no drawing).
          tabHold = { startMs: nowMs, done: false };
          current = null;
        } else if (showBar && toolbarPanelAt(pen)) {
          h1ToolbarTouch = {
            startY: pen.y,
            initialScroll: toolbarTargetScrollY,
            targetBtn: buttonAt(pen),
            isScrolling: false
          };
          current = null;
        } else if (typeof isPaperScanEnabled === "function" && isPaperScanEnabled() &&
            typeof beginPaperPick === "function" && beginPaperPick(1, pen, nowMs)) {
          grabCandidate = null;
          current = null;
        } else if (selected.size > 0 && h2.pinching) {
          grabCandidate = null;
          current = null;
        } else {
          const target = objectAtPoint(pen);
          if (target) {
            // Pinching on an object: hold still to pick it up; moving draws only in Draw mode.
            grabCandidate = { obj: target, startX: pen.x, startY: pen.y, startMs: nowMs, pts: pending.slice() };
            current = null;
          } else {
            current = drawModeOn ? pending.slice() : null;
          }
        }
      }
    } else {
      onCount = 0;
      pending = [];
    }
  } else {
    if (ratio > PINCH_STOP) {
      offCount++;
      if (offCount >= DEBOUNCE_FRAMES) {
        endPinch();
      }
    } else {
      offCount = 0;
      if (typeof isPaperPickActive === "function" && isPaperPickActive(1)) {
        updatePaperPick(1, pen, nowMs);
      } else if (h1ToolbarTouch) {
        const deltaY = pen.y - h1ToolbarTouch.startY;
        if (!h1ToolbarTouch.isScrolling && Math.abs(deltaY) > TOOLBAR_DRAG_SLOP) {
          h1ToolbarTouch.isScrolling = true;
          h1ToolbarTouch.targetBtn = null;
        }
        if (h1ToolbarTouch.isScrolling) {
          const adjusted = deltaY > 0 ? deltaY - TOOLBAR_DRAG_SLOP : deltaY + TOOLBAR_DRAG_SLOP;
          setToolbarScroll(h1ToolbarTouch.initialScroll + adjusted * 0.95);
        }
      } else if (grabbed) {
        // the held object follows the pen (see stepPhysics)
      } else if (tabHold) {
        const overTab = tabAt(pen);
        if (tabHold.done) {
          // already switched: wait for you to release the pinch
        } else if (!overTab) {
          tabHold.startMs = nowMs;   // sliding off the tab restarts the hold
        } else if (nowMs - tabHold.startMs >= TAB_HOLD_MS) {
          toggleBar();
          tabHold.done = true;
        }
      } else if (grabCandidate) {
        const gc = grabCandidate;
        const lastPt = gc.pts[gc.pts.length - 1];
        if (dist(pen, lastPt) >= MIN_POINT_GAP) gc.pts.push({ x: pen.x, y: pen.y });
        if (dist(pen, { x: gc.startX, y: gc.startY }) > GRAB_MOVE_TOL) {
          // you moved before the hold time was up: this is drawing, not grabbing
          current = drawModeOn ? gc.pts.slice() : null;
          grabCandidate = null;
        } else if (nowMs - gc.startMs >= GRAB_HOLD_MS) {
          startGrab(gc.obj);
          grabCandidate = null;
        }
      } else if (current) {
        const last = current[current.length - 1];
        if (Math.hypot(pen.x - last.x, pen.y - last.y) >= MIN_POINT_GAP) {
          current.push({ x: pen.x, y: pen.y });
        }
      }
    }
  }
  updatePose(nowMs);
}

function handleNoHand(nowMs) {
  const missingMs = nowMs - lastSeenMs;
  // Short-dropout velocity prediction keeps cursor smooth across 1-2 missed camera frames
  if (handVisible && pen && missingMs > 0 && missingMs <= PREDICT_GAP_MS) {
    const dt = 0.016;
    pen.x = Math.min(canvas.width, Math.max(0, pen.x + penVel.vx * dt * 0.5));
    pen.y = Math.min(canvas.height, Math.max(0, pen.y + penVel.vy * dt * 0.5));
    return;
  }
  if (handVisible && missingMs > DROPOUT_END_MS) {
    handVisible = false;
    pen = null;
    skeletonPts = null;
    realPen = null;
    filterX.reset();
    filterY.reset();
    if (pinching) endPinch();
    if (typeof endPaperPick === "function") endPaperPick(1);
    onCount = 0;
    pending = [];
    resetPose();
    prevPenPos = null;
    penSpeed = 0;
    penVel = { vx: 0, vy: 0 };
  }
}

function handleHand2(lm, nowMs) {
  secondaryHandPresent = true;
  const W = canvas.width;
  const H = canvas.height;
  const g = REACH_LEVELS[reachIdx];
  const ax = W / 2;
  const ay = H * REACH_ANCHOR_Y;
  const mapPoint = (p) => ({
    x: ax + ((1 - p.x) * W - ax) * g,
    y: ay + (p.y * H - ay) * g
  });
  const pts = lm.map(mapPoint);
  const th = pts[4];
  const ix = pts[8];
  const w = pts[0];
  const mid = pts[9];
  const skeleton = lm.map((p) => ({ x: (1 - p.x) * W, y: p.y * H }));
  const realPen2 = { x: (skeleton[4].x + skeleton[8].x) / 2, y: (skeleton[4].y + skeleton[8].y) / 2 };
  const rawX = Math.min(W, Math.max(0, (th.x + ix.x) / 2));
  const rawY = Math.min(H, Math.max(0, (th.y + ix.y) / 2));
  const t = nowMs / 1000;
  h2.seen = nowMs;
  h2.visible = true;
  h2.skeletonPts = skeleton;
  h2.realPen = realPen2;
  const a = Math.atan2(skeleton[9].y - skeleton[0].y, skeleton[9].x - skeleton[0].x);
  h2.ang = h2.ang === undefined || h2.ang === null ? a : h2.ang + angDiff(a, h2.ang) * 0.35;
  h2.pen = { x: filterX2.filter(rawX, t), y: filterY2.filter(rawY, t) };
  if (!h2.vis) h2.vis = { x: h2.pen.x, y: h2.pen.y };
  const dt = t - (h2.prevPenT || t);
  if (h2.prevPenPos && dt > 0) {
    const vx = (h2.pen.x - h2.prevPenPos.x) / dt;
    const vy = (h2.pen.y - h2.prevPenPos.y) / dt;
    h2.penVel.vx = h2.penVel.vx * 0.6 + vx * 0.4;
    h2.penVel.vy = h2.penVel.vy * 0.6 + vy * 0.4;
    h2.penSpeed = h2.penSpeed * 0.6 + Math.hypot(vx, vy) * 0.4;
  }
  h2.prevPenPos = { x: h2.pen.x, y: h2.pen.y };
  h2.prevPenT = t;
  const size = Math.hypot(w.x - mid.x, w.y - mid.y);
  const ratio = size > 0 ? Math.hypot(th.x - ix.x, th.y - ix.y) / size : 1;
  h2.lastRatio = ratio;
  const pose = classifyPose(skeleton);
  const fistNow = pose === "CROSSED FINGERS" || pose === "FIST" || pose === "SHAKA UP" || pose === "SHAKA DOWN" || handClosing(skeleton);

  if (window.GameEngine && window.GameEngine.capturesHandInput()) {
    if (h2.grab) releaseGrab2();
    if (typeof endPaperPick === "function") endPaperPick(2);
    h2.current = null;
    h2.grabCandidate = null;
    h2.pinching = false;
    h2.pinch = false;
    h2.on = 0;
    h2.off = 0;
    h2.pending = [];
    h2.candPose = null;
    h2.candFired = false;
    return;
  }

  if (!h2.pinching) {
    if (ratio < PINCH_START && !fistNow && h2.penSpeed < PINCH_MAX_SPEED) {
      h2.on++;
      h2.pending.push({ x: h2.pen.x, y: h2.pen.y });
      if (h2.on >= DEBOUNCE_FRAMES) {
        h2.pinching = true;
        h2.pinch = true;
        h2.off = 0;
        if (tabAt(h2.pen)) {
          toggleBar();
          h2.current = null;
        } else if (showBar && toolbarPanelAt(h2.pen)) {
          h2ToolbarTouch = {
            startY: h2.pen.y,
            initialScroll: toolbarTargetScrollY,
            targetBtn: buttonAt(h2.pen),
            isScrolling: false
          };
          h2.current = null;
        } else if (showBar && buttonAt(h2.pen)) {
          pressButton(buttonAt(h2.pen), nowMs);
          h2.current = null;
        } else if (typeof isPaperScanEnabled === "function" && isPaperScanEnabled() &&
            typeof beginPaperPick === "function" && beginPaperPick(2, h2.pen, nowMs)) {
          h2.current = null;
          h2.grabCandidate = null;
        } else if (selected.size > 0 && pinching) {
          h2.current = null;
          h2.grabCandidate = null;
        } else {
          const target = objectAtPoint(h2.pen);
          if (target && !(grabbed && grabbed.obj === target && !target.isMerged)) {
            h2.grabCandidate = {
              obj: target,
              startX: h2.pen.x,
              startY: h2.pen.y,
              startMs: nowMs,
              pts: h2.pending.slice()
            };
            h2.current = null;
          } else {
            h2.grabCandidate = null;
            h2.current = drawModeOn ? h2.pending.slice() : null;
          }
        }
      }
    } else {
      h2.on = 0;
      h2.pending = [];
    }
  } else {
    if (ratio > PINCH_STOP) {
      if (++h2.off >= DEBOUNCE_FRAMES) {
        if (h2ToolbarTouch) {
          if (!h2ToolbarTouch.isScrolling) {
            const button = h2ToolbarTouch.targetBtn || buttonAt(h2.pen);
            if (button) pressButton(button, nowMs);
          }
          h2ToolbarTouch = null;
        }
        if (h2.grab) releaseGrab2();
        if (typeof endPaperPick === "function") endPaperPick(2);
        if (h2.current && !scaleSession) {
          const prevLast = objects[objects.length - 1];
          const strokeLength = pathLength(h2.current);
          commitStroke(h2.current);
          const last = objects[objects.length - 1];
          if (last && last !== prevLast) {
            h2.lastStrokeObj = last;
            h2.lastStrokeObj.strokeLen = strokeLength;
            h2.lastStrokeAt = nowMs;
          }
        }
        h2.current = null;
        h2.grabCandidate = null;
        h2.pinching = false;
        h2.pinch = false;
        h2.on = 0;
        h2.off = 0;
        h2.pending = [];
        h2.poseBlockUntil = nowMs + POSE_POST_PINCH_MS;
      }
    } else {
      h2.off = 0;
      if (typeof isPaperPickActive === "function" && isPaperPickActive(2)) {
        updatePaperPick(2, h2.pen, nowMs);
      } else if (h2ToolbarTouch) {
        const deltaY = h2.pen.y - h2ToolbarTouch.startY;
        if (!h2ToolbarTouch.isScrolling && Math.abs(deltaY) > TOOLBAR_DRAG_SLOP) {
          h2ToolbarTouch.isScrolling = true;
          h2ToolbarTouch.targetBtn = null;
        }
        if (h2ToolbarTouch.isScrolling) {
          const adjusted = deltaY > 0 ? deltaY - TOOLBAR_DRAG_SLOP : deltaY + TOOLBAR_DRAG_SLOP;
          setToolbarScroll(h2ToolbarTouch.initialScroll + adjusted * 0.95);
        }
      } else if (scaleSession) {
        h2.current = null;
      } else if (h2.grab) {
        // The held body is moved by the physics step.
      } else if (h2.grabCandidate) {
        const candidate = h2.grabCandidate;
        const lastPoint = candidate.pts[candidate.pts.length - 1];
        if (dist(h2.pen, lastPoint) >= MIN_POINT_GAP) candidate.pts.push({ x: h2.pen.x, y: h2.pen.y });
        if (dist(h2.pen, { x: candidate.startX, y: candidate.startY }) > GRAB_MOVE_TOL) {
          h2.current = drawModeOn ? candidate.pts.slice() : null;
          h2.grabCandidate = null;
        } else if (nowMs - candidate.startMs >= GRAB_HOLD_MS) {
          startGrab2(candidate.obj);
          h2.grabCandidate = null;
        }
      } else if (h2.current) {
        const lastPoint = h2.current[h2.current.length - 1];
        if (dist(h2.pen, lastPoint) >= MIN_POINT_GAP) h2.current.push({ x: h2.pen.x, y: h2.pen.y });
      }
    }
  }
  updatePose2(nowMs);
}

function updatePose2(nowMs) {
  const real = h2.skeletonPts;
  if (!real || h2.pinching || h2.grab || h2.grabCandidate || h2ToolbarTouch || nowMs < h2.poseBlockUntil) {
    h2.candPose = null;
    h2.candFired = false;
    h2.wristHist = [];
    return;
  }
  const raw = classifyPose(real);
  if (window.GameEngine && window.GameEngine.isGameRunning() &&
      (raw === "PEACE" || raw === "OPEN PALM" || raw === "I LOVE YOU")) {
    h2.candPose = null;
    h2.candFired = false;
    h2.wristHist = [];
    return;
  }
  if (window.GameEngine && window.GameEngine.consumesPose(raw)) {
    h2.candPose = null;
    h2.candFired = false;
    h2.wristHist = [];
    return;
  }
  const openish = raw === "OPEN PALM" || (raw === null && extendedCount(real) >= 3);
  h2.swipeProgress = 0;
  if (openish && h2.penSpeed > 300) {
    const center = palmCenter(real);
    h2.wristHist.push({ x: center.x, y: center.y, t: nowMs });
    h2.wristHist = h2.wristHist.filter((point) => nowMs - point.t <= SWIPE_WINDOW_MS);
    if (h2.wristHist.length >= 3) {
      const xs = h2.wristHist.map((point) => point.x);
      const ys = h2.wristHist.map((point) => point.y);
      const dx = Math.max(...xs) - Math.min(...xs);
      const dy = Math.max(...ys) - Math.min(...ys);
      const net = Math.abs(h2.wristHist[h2.wristHist.length - 1].x - h2.wristHist[0].x);
      const need = Math.max(canvas.width * SWIPE_MIN_FRACTION, dist(real[0], real[9]) * SWIPE_MIN_HANDS);
      if (dy < dx * 0.7 && net >= dx * 0.7) h2.swipeProgress = Math.min(1, dx / need);
      if (h2.swipeProgress >= 1 && nowMs >= h2.swipeCooldownUntil) {
        runAction(SWIPE_ACTION);
        h2.swipeCooldownUntil = nowMs + SWIPE_COOLDOWN_MS;
        h2.poseBlockUntil = nowMs + POSE_POST_PINCH_MS;
        h2.candPose = null;
        h2.candFired = false;
        return;
      }
    }
  } else {
    h2.wristHist = [];
  }

  let pose = tabAt(h2.pen) || (showBar && toolbarPanelAt(h2.pen)) ? null : raw;
  if (pose === "OPEN PALM" && h2.hoverObj && !pausedWorld) pose = null;
  if (pose === "OPEN PALM" && selected.size > 0 && nowMs - lastSelectMs < SELECT_SETTLE_MS) pose = null;
  if (pose) h2.lastPoseMs = nowMs;
  if (!pose && h2.candPose && nowMs - h2.lastPoseMs < POSE_GRACE_MS) return;
  const size = dist(real[0], real[9]);
  if (pose && pose === h2.candPose && h2.candWrist && dist(real[0], h2.candWrist) > size * POSE_MOVE_TOL) {
    h2.candStartMs = nowMs;
    h2.candWrist = { x: real[0].x, y: real[0].y };
    // A fired pose stays latched until the hand changes pose.
  }
  if (pose !== h2.candPose) {
    h2.candPose = pose;
    h2.candStartMs = nowMs;
    h2.candFired = false;
    h2.candWrist = pose ? { x: real[0].x, y: real[0].y } : null;
  }
  const holdTime = h2.candPose && POSE_HOLD_MS[h2.candPose] ? POSE_HOLD_MS[h2.candPose] : 500;
  if (h2.candPose && !h2.candFired && nowMs - h2.candStartMs >= holdTime) {
    h2.candFired = true;
    runAction(GESTURE_ACTIONS[h2.candPose]);
  }
}

function selecting2() {
  return false;
}

function handleNoHand2(nowMs) {
  // Forgive short tracking drop-outs so the held object is not dropped on a single missed frame.
  if (nowMs !== undefined && h2.seen && nowMs - h2.seen < 250) return;
  if (h2.grab) releaseGrab2();
  if (h2.pinching && h2.current && !scaleSession) commitStroke(h2.current);
  h2.visible = false;
  h2.pen = null;
  h2.vis = null;
  h2.skeletonPts = null;
  h2.realPen = null;
  h2.current = null;
  h2.grabCandidate = null;
  h2ToolbarTouch = null;
  h2.pinching = false;
  h2.pinch = false;
  h2.on = 0;
  h2.off = 0;
  h2.pending = [];
  h2.penSpeed = 0;
  h2.penVel = { vx: 0, vy: 0 };
  h2.prevPenPos = null;
  h2.wristHist = [];
  h2.candPose = null;
  h2.candFired = false;
  filterX2.reset();
  filterY2.reset();
}

function rawPalmMidpoint(landmarks) {
  return {
    x: (1 - (landmarks[0].x + landmarks[9].x) / 2) * canvas.width,
    y: (landmarks[0].y + landmarks[9].y) / 2 * canvas.height
  };
}

function trackedPalmMidpoint(points) {
  return points && points.length >= 21
    ? { x: (points[0].x + points[9].x) / 2, y: (points[0].y + points[9].y) / 2 }
    : null;
}

function rawPinchMidpoint(landmarks) {
  return {
    x: (1 - (landmarks[4].x + landmarks[8].x) / 2) * canvas.width,
    y: ((landmarks[4].y + landmarks[8].y) / 2) * canvas.height
  };
}

let airGestureCursor = null;
let airGestureTarget = null;
let airGestureTargetStarted = 0;
let airGesturePose = null;
let airGesturePoseStarted = 0;
let airGestureLastPalmY = null;
let airGesturePoseFired = false;

window.resetAirGesture = function () {
  if (airGestureTarget) {
    airGestureTarget.classList.remove("air-gesture-hover");
    airGestureTarget.style.removeProperty("--air-gesture-progress");
  }
  airGestureTarget = null;
  airGesturePose = null;
  airGestureLastPalmY = null;
  airGesturePoseFired = false;
  if (airGestureCursor) {
    airGestureCursor.remove();
    airGestureCursor = null;
  }
};

function updateAirGestureFrame(landmarks, nowMs) {
  if (!window.airGestureEnabled) return;
  if (!landmarks || landmarks.length < 21) {
    if (airGestureTarget) airGestureTarget.classList.remove("air-gesture-hover");
    airGestureTarget = null;
    airGesturePose = null;
    airGestureLastPalmY = null;
    airGesturePoseFired = false;
    if (airGestureCursor) airGestureCursor.classList.remove("visible");
    return;
  }
  if (!airGestureCursor) {
    airGestureCursor = document.createElement("div");
    airGestureCursor.id = "airGestureCursor";
    airGestureCursor.setAttribute("aria-hidden", "true");
    document.body.appendChild(airGestureCursor);
  }

  const x = Math.max(0, Math.min(window.innerWidth, (1 - landmarks[8].x) * window.innerWidth));
  const y = Math.max(0, Math.min(window.innerHeight, landmarks[8].y * window.innerHeight));
  airGestureCursor.style.transform = "translate3d(" + x + "px, " + y + "px, 0)";
  airGestureCursor.classList.add("visible");
  const pose = classifyPose(landmarks.map((point) => ({ x: point.x * canvas.width, y: point.y * canvas.height })));
  const hovered = document.elementFromPoint(x, y);
  const drawer = document.getElementById("gameDrawer");
  const drawerOpen = drawer && drawer.classList.contains("open");
  const drawerRect = drawerOpen ? drawer.getBoundingClientRect() : null;
  const overDrawer = drawerRect && x >= drawerRect.left && x <= drawerRect.right &&
    y >= drawerRect.top && y <= drawerRect.bottom;
  const palmY = ((landmarks[0].y + landmarks[5].y + landmarks[9].y +
    landmarks[13].y + landmarks[17].y) / 5) * window.innerHeight;

  if (overDrawer && pose === "OPEN PALM") {
    if (airGestureLastPalmY !== null) drawer.scrollTop += (palmY - airGestureLastPalmY) * 1.25;
    airGestureLastPalmY = palmY;
  } else {
    airGestureLastPalmY = null;
  }

  const target = hovered && hovered.closest(
    "#airGestureBtn, #gameDrawerToggle, #gameDrawerClose, .game-arcade-item, " +
    "#gameControls button, .game-control-button, " +
    ".asteroid-restart-button, .asteroid-play-again, .alchemist-win-panel button, .solo-game-replay, " +
    ".game-start-panel button, #gameStop, #gamePromptStart, #gamePromptDismiss"
  );
  if (target !== airGestureTarget) {
    if (airGestureTarget) airGestureTarget.classList.remove("air-gesture-hover");
    airGestureTarget = target && target.getClientRects().length ? target : null;
    airGestureTargetStarted = nowMs;
    if (airGestureTarget) airGestureTarget.classList.add("air-gesture-hover");
  }
  if (airGestureTarget) {
    const progress = Math.max(0, Math.min(1, (nowMs - airGestureTargetStarted) / 650));
    airGestureTarget.style.setProperty("--air-gesture-progress", (progress * 100) + "%");
  }

  if (pose !== airGesturePose) {
    airGesturePose = pose;
    airGesturePoseStarted = nowMs;
    airGesturePoseFired = false;
  }
  if (!airGesturePoseFired && pose === "PEACE" && airGestureTarget &&
      nowMs - airGesturePoseStarted >= 650 && nowMs - airGestureTargetStarted >= 650) {
    airGestureTarget.click();
    airGesturePoseFired = true;
    airGestureTarget.classList.remove("air-gesture-hover");
    airGestureTarget = null;
    return;
  }
  if (!airGesturePoseFired && nowMs - airGesturePoseStarted >= 700) {
    if (pose === "OPEN PALM" && drawer && !drawerOpen) {
      document.getElementById("gameDrawerToggle").click();
      airGesturePoseFired = true;
    } else if (pose === "FIST" && drawerOpen) {
      document.getElementById("gameDrawerClose").click();
      airGesturePoseFired = true;
    }
  }
}

let drawToggleStartedAt = null;
let drawToggleFired = false;
const drawTogglePoints = Array.from({ length: 21 }, () => ({ x: 0, y: 0 }));

function updateDrawToggleGesture(hands, nowMs) {
  let formingHeart = false;
  for (const hand of hands || []) {
    if (!Array.isArray(hand) || hand.length < 21) continue;
    for (let index = 0; index < drawTogglePoints.length; index++) {
      drawTogglePoints[index].x = hand[index].x * canvas.width;
      drawTogglePoints[index].y = hand[index].y * canvas.height;
    }
    if (classifyPose(drawTogglePoints) === "CROSSED FINGERS") { formingHeart = true; break; }
  }
  if (!formingHeart) {
    drawToggleStartedAt = null;
    drawToggleFired = false;
    return;
  }
  if (drawToggleStartedAt === null) drawToggleStartedAt = nowMs;
  if (!drawToggleFired && nowMs - drawToggleStartedAt >= 700) {
    drawToggleFired = true;
    setDrawMode(!drawModeOn);
  }
}

function distinctDetectedHands(hands) {
  if (!Array.isArray(hands)) return [];
  const distinct = [];
  const distance = (a, b) => Math.hypot((a.x - b.x) * canvas.width, (a.y - b.y) * canvas.height);
  for (const hand of hands) {
    if (!Array.isArray(hand) || hand.length < 21 || hand.some((point) =>
        !point || !Number.isFinite(point.x) || !Number.isFinite(point.y))) continue;
    const duplicate = distinct.some((other) => {
      const size = Math.min(distance(hand[0], hand[9]), distance(other[0], other[9]));
      if (size <= 0) return false;
      const wristGap = distance(hand[0], other[0]);
      let palmGap = 0;
      for (const index of [0, 5, 9, 13, 17]) palmGap += distance(hand[index], other[index]);
      if (wristGap < size * 0.8 && palmGap / 5 < size * 0.55) return true;
      if (wristGap > size * 0.25) return false;
      let total = 0;
      for (const index of [0, 5, 9, 13, 17, 8, 12, 20]) total += distance(hand[index], other[index]);
      return total / 8 < size * 0.22;
    });
    if (!duplicate) distinct.push(hand);
  }
  return distinct;
}

let secondHandCandidate = null;
function confirmSecondHand(hands, nowMs) {
  if (hands.length < 2) {
    secondHandCandidate = null;
    return hands;
  }
  const wrist = hands[1][0];
  const size = Math.hypot((wrist.x - hands[1][9].x) * canvas.width,
    (wrist.y - hands[1][9].y) * canvas.height);
  const gap = secondHandCandidate ? Math.hypot(
    (wrist.x - secondHandCandidate.x) * canvas.width,
    (wrist.y - secondHandCandidate.y) * canvas.height) : Infinity;
  if (!secondHandCandidate || gap > Math.max(25, size * 0.8)) {
    secondHandCandidate = { x: wrist.x, y: wrist.y, since: nowMs };
  } else {
    secondHandCandidate.x = wrist.x;
    secondHandCandidate.y = wrist.y;
  }
  return nowMs - secondHandCandidate.since >= 250 ? hands : hands.slice(0, 1);
}

const TRACK_INTERVAL_MS = 1000 / 30;
let lastDetectionAt = -Infinity;
let lastDetectionVideoTime = -1;

// One hand-tracking pass on the newest camera frame.
function trackFrame() {
  if (document.hidden || !landmarker || video.readyState < 2) return;
  const t0 = performance.now();
  if (t0 - lastDetectionAt < TRACK_INTERVAL_MS - 1 || video.currentTime === lastDetectionVideoTime) return;
  lastDetectionAt = t0;
  lastDetectionVideoTime = video.currentTime;
  let result;
  try {
    result = landmarker.detectForVideo(video, t0);
  } catch (error) {
    return;
  }
  primaryHandPresent = false;
  secondaryHandPresent = false;
  result = { ...result, landmarks: confirmSecondHand(distinctDetectedHands(result.landmarks), performance.now()) };
  const t1 = performance.now();
  updateDrawToggleGesture(result.landmarks || [], t1);
  trackMs = trackMs * 0.9 + (t1 - t0) * 0.1;
  if (window.airGestureEnabled) {
    updateAirGestureFrame(result.landmarks && result.landmarks.length ? result.landmarks[0] : null, t1);
    if (window.GameEngine) window.GameEngine.setHands([]);
    handleNoHand(t1);
    handleNoHand2(t1);
    return;
  }
  if (airGestureCursor) airGestureCursor.classList.remove("visible");
  if (window.GameEngine) window.GameEngine.setHands(result.landmarks || []);
  if (result.landmarks && result.landmarks.length > 0) {
    const L = result.landmarks;
    _hadHand = true;
    const firstPalm = trackedPalmMidpoint(skeletonPts);
    const secondPalm = trackedPalmMidpoint(h2.skeletonPts);
    if (L.length === 1) {
      const point = rawPalmMidpoint(L[0]);
      const d1 = firstPalm ? dist(point, firstPalm) : Infinity;
      const d2 = secondPalm ? dist(point, secondPalm) : Infinity;
      if ((h2.visible && !handVisible) || (h2.visible && handVisible && d2 < d1)) {
        handleHand2(L[0], t1);
        handleNoHand(t1);
      } else {
        handleHand(L[0], t1);
        handleNoHand2(t1);
      }
    } else {
      const points = [rawPalmMidpoint(L[0]), rawPalmMidpoint(L[1])];
      let firstIsHand1;
      if (firstPalm && secondPalm) {
        firstIsHand1 = dist(points[0], firstPalm) + dist(points[1], secondPalm) <=
          dist(points[1], firstPalm) + dist(points[0], secondPalm);
      } else if (firstPalm) {
        firstIsHand1 = dist(points[0], firstPalm) <= dist(points[1], firstPalm);
      } else if (secondPalm) {
        firstIsHand1 = dist(points[1], secondPalm) <= dist(points[0], secondPalm);
      } else {
        firstIsHand1 = points[0].x <= points[1].x;
      }
      handleHand(L[firstIsHand1 ? 0 : 1], t1);
      handleHand2(L[firstIsHand1 ? 1 : 0], t1);
    }
  } else {
    if (_hadHand) {
      _hadHand = false;
      handLosses.push(t1);
    }
    handleNoHand(t1);
    handleNoHand2(t1);
  }
}

// Best case: run tracking right when the browser says a new camera frame is ready.
function onVideoFrame() {
  trackFrame();
  video.requestVideoFrameCallback(onVideoFrame);
}

// ------------------------------------------------------------
// Mouse backup input (always works, also handy for testing physics)
// ------------------------------------------------------------
function toCanvas(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) * (canvas.width / rect.width),
    y: (e.clientY - rect.top) * (canvas.height / rect.height)
  };
}

canvas.addEventListener("pointerdown", (e) => {
  if (typeof isPaperScanEnabled === "function" && isPaperScanEnabled()) return;
  const p0 = toCanvas(e);
  if (tabAt(p0)) {
    toggleBar();
    return;
  }
  if (showBar && toolbarPanelAt(p0)) {
    mouseToolbarTouch = {
      startY: p0.y,
      initialScroll: toolbarTargetScrollY,
      targetBtn: buttonAt(p0),
      isScrolling: false
    };
    canvas.setPointerCapture(e.pointerId);
    return;
  }
  if (e.shiftKey) {
    const picked = objectAtPoint(p0);
    if (picked) toggleSelect(picked);
    return;
  }
  if (window.GameEngine && window.GameEngine.isGameRunning("asteroid-shooter")) return;
  mouseCurrent = [p0];
  canvas.setPointerCapture(e.pointerId);
});

canvas.addEventListener("pointermove", (e) => {
  if (typeof isPaperScanEnabled === "function" && isPaperScanEnabled()) return;
  const p = toCanvas(e);
  if (mouseToolbarTouch) {
    const deltaY = p.y - mouseToolbarTouch.startY;
    if (!mouseToolbarTouch.isScrolling && Math.abs(deltaY) > TOOLBAR_DRAG_SLOP) {
      mouseToolbarTouch.isScrolling = true;
      mouseToolbarTouch.targetBtn = null;
    }
    if (mouseToolbarTouch.isScrolling) {
      const adjusted = deltaY > 0 ? deltaY - TOOLBAR_DRAG_SLOP : deltaY + TOOLBAR_DRAG_SLOP;
      setToolbarScroll(mouseToolbarTouch.initialScroll + adjusted * 0.95);
    }
    return;
  }
  if (!mouseCurrent) return;
  const last = mouseCurrent[mouseCurrent.length - 1];
  if (dist(p, last) >= MIN_POINT_GAP) mouseCurrent.push(p);
});

function finishMouseStroke(e) {
  if (typeof isPaperScanEnabled === "function" && isPaperScanEnabled()) {
    mouseToolbarTouch = null;
    mouseCurrent = null;
    return;
  }
  if (mouseToolbarTouch) {
    if (!mouseToolbarTouch.isScrolling) {
      const point = e ? toCanvas(e) : null;
      const button = mouseToolbarTouch.targetBtn || (point ? buttonAt(point) : null);
      if (button) pressButton(button, performance.now());
    }
    mouseToolbarTouch = null;
    return;
  }
  if (mouseCurrent) commitStroke(mouseCurrent);
  mouseCurrent = null;
}

canvas.addEventListener("pointerup", finishMouseStroke);
canvas.addEventListener("pointercancel", finishMouseStroke);
canvas.addEventListener("wheel", (e) => {
  const point = toCanvas(e);
  if (toolbarPanelAt(point)) {
    e.preventDefault();
    setToolbarScroll(toolbarTargetScrollY - e.deltaY * 0.7);
  }
}, { passive: false });
canvas.addEventListener("dblclick", (e) => {
  if (typeof isPaperScanEnabled === "function" && isPaperScanEnabled()) return;
  const p = toCanvas(e);
  if (tabAt(p) || (showBar && buttonAt(p))) return;
  spawnTestBall(p.x, p.y);
});