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
      frameRate: { ideal: 60 }
    }
  };
  try {
    return await navigator.mediaDevices.getUserMedia(wanted);
  } catch (err) {
    // Camera busy or settings refused: wait a moment and try again with the simplest request.
    if (err.name === "NotReadableError" || err.name === "AbortError" || err.name === "OverconstrainedError") {
      await new Promise((resolve) => setTimeout(resolve, 900));
      return await navigator.mediaDevices.getUserMedia({ video: true });
    }
    throw err;
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
  video.srcObject = stream;
  await new Promise((resolve) => {
    video.onloadedmetadata = () => resolve();
  });
  await video.play();
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
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
    minHandDetectionConfidence: 0.6,
    minHandPresenceConfidence: 0.6,
    minTrackingConfidence: 0.6
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
  if (pose === "OPEN PALM") return sel ? "Deselect all" : (pausedWorld ? "Resume" : "Pause");
  if (pose === "FIST") return sel ? "Destroy (keep holding)" : "Fist";
  if (pose === "PEACE") return "Clone";
  if (pose === "THUMBS UP") return sel ? "Float" : "Gravity off";
  if (pose === "THUMBS DOWN") return sel ? "Fall" : "Gravity on";
  if (pose === "SHAKA UP") return "Select all (" + objects.length + ")";
  if (pose === "SHAKA DOWN") return "Deselect all";
  return pose;
}

function showToast(text) {
  toast = { text: text, until: performance.now() + 1400 };
}

// Looks at the 21 hand points (real hand position) and names the pose, or returns null.
function classifyPose(pts) {
  const wrist = pts[0];
  const handSize = dist(pts[0], pts[9]);
  if (handSize <= 0) return null;

  // A finger counts as extended when its tip is farther from the wrist than its middle joint.
  const ext = (tip, pip) => dist(pts[tip], wrist) > dist(pts[pip], wrist) * 1.08;
  const indexE = ext(8, 6);
  const middleE = ext(12, 10);
  const ringE = ext(16, 14);
  const pinkyE = ext(20, 18);
  const thumbE =
    dist(pts[4], pts[17]) > dist(pts[3], pts[17]) * 1.05 &&
    dist(pts[4], pts[5]) > handSize * 0.45;
  const count = [indexE, middleE, ringE, pinkyE].filter(Boolean).length;

  if (count === 4 && thumbE) return "OPEN PALM";

  // Shaka gesture: thumb and pinky extended, while index, middle, and ring are curled.
  // Normal orientation (thumb above pinky) selects all; inverted (pinky above thumb) deselects all.
  if (thumbE && pinkyE && !indexE && !middleE && !ringE && dist(pts[4], pts[20]) > handSize * 0.85) {
    if (pts[4].y <= pts[20].y + 0.1 * handSize) {
      return "SHAKA UP";
    }
    return "SHAKA DOWN";
  }

  // Peace sign: index and middle fingers up and apart, ring and pinky folded.
  if (indexE && middleE && !ringE && !pinkyE && dist(pts[8], pts[12]) > handSize * 0.25) return "PEACE";

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

function runAction(name) {
  if (name === "pause") {
    pausedWorld = !pausedWorld;
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
    } else {
      runAction("pause");
    }
  } else if (name === "destroyPose") {
    if (selected.size > 0) destroySelected();   // a fist with nothing selected does nothing
  } else if (name === "clone") {
    cloneSelected();
  } else if (name === "undo") {
    // Phase 2 swipe-to-erase: if hovering over an object, erase that object; otherwise undo last drawing
    const hoveredTarget = pen ? objectAtPoint(pen) : null;
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
  if (showBar && buttonAt(pen)) return true;
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

  const busy = pinching || grabbed || grabCandidate || tabHold || onCount > 0;
  if (!real || busy || nowMs < poseBlockUntil) {
    resetPose();
    return;
  }
  const raw = classifyPose(real);

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
        runAction(SWIPE_ACTION);
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
    candFired = false;
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
    currentPose === "FIST" ||
    currentPose === "SHAKA UP" ||
    currentPose === "SHAKA DOWN" ||
    handClosing(skeletonPts);

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
        } else {
          const target = objectAtPoint(pen);
          if (target) {
            // Pinching on an object: hold still to pick it up, or move to draw instead.
            grabCandidate = { obj: target, startX: pen.x, startY: pen.y, startMs: nowMs, pts: pending.slice() };
            current = null;
          } else {
            current = pending.slice();
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
      if (grabbed) {
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
          current = gc.pts.slice();
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
    onCount = 0;
    pending = [];
    resetPose();
    prevPenPos = null;
    penSpeed = 0;
    penVel = { vx: 0, vy: 0 };
  }
}

function handleHand2(lm, nowMs) {
  const W = canvas.width;
  const H = canvas.height;
  const g = REACH_LEVELS[reachIdx];
  const ax = W / 2;
  const ay = H * REACH_ANCHOR_Y;
  const m = (p) => ({
    x: ax + ((1 - p.x) * W - ax) * g,
    y: ay + (p.y * H - ay) * g
  });
  const th = m(lm[4]);
  const ix = m(lm[8]);
  const w = m(lm[0]);
  const mid = m(lm[9]);
  const rawX = Math.min(W, Math.max(0, (th.x + ix.x) / 2));
  const rawY = Math.min(H, Math.max(0, (th.y + ix.y) / 2));
  const t = nowMs / 1000;
  h2.seen = nowMs;
  {
    const a = Math.atan2((lm[9].y - lm[0].y) * H, -(lm[9].x - lm[0].x) * W);
    h2.ang = h2.ang === undefined || h2.ang === null ? a : h2.ang + angDiff(a, h2.ang) * 0.35;
  }
  h2.pen = { x: filterX2.filter(rawX, t), y: filterY2.filter(rawY, t) };
  if (!h2.vis) h2.vis = { x: h2.pen.x, y: h2.pen.y };
  const size = Math.hypot(w.x - mid.x, w.y - mid.y);
  const ratio = size > 0 ? Math.hypot(th.x - ix.x, th.y - ix.y) / size : 1;
  if (!h2.pinch) {
    h2.on = ratio < PINCH_START ? h2.on + 1 : 0;
    if (h2.on >= DEBOUNCE_FRAMES) {
      h2.pinch = true;
      h2.off = 0;
    }
  } else if (ratio > PINCH_STOP) {
    if (++h2.off >= 3) {
      h2.pinch = false;
      h2.on = 0;
      releaseGrab2();
    }
  } else {
    h2.off = 0;
  }
  // While pinched and holding nothing, pick up whatever is under the ring (no need to be exact at the first instant).
  if (h2.pinch && !h2.grab) {
    const tObj = objectAtPoint(h2.pen);
    if (tObj && !(grabbed && grabbed.obj === tObj) && !selecting2(tObj)) {
      const st = !tObj.body || tObj.body.isStatic;
      const ref = st ? tObj.bodies[0].position : tObj.body.position;
      const om = st ? 0 : tObj.body.mass;
      if (!st) Body.setMass(tObj.body, om * GRAB_MASS_MULT);
      h2.grab = {
        obj: tObj,
        st: st,
        om: om,
        cvx: 0,
        cvy: 0,
        h0: h2.ang,
        b0: st ? 0 : tObj.body.angle,
        offX: ref.x - h2.pen.x,
        offY: ref.y - h2.pen.y
      };
      if (typeof playTone === "function") playTone(520, 0.05);
    }
  }
}

function selecting2() {
  return false;
}

function handleNoHand2(nowMs) {
  // Forgive short tracking drop-outs so the held object is not dropped on a single missed frame.
  if (nowMs !== undefined && h2.seen && nowMs - h2.seen < 250) return;
  if (h2.grab) releaseGrab2();
  h2.pen = null;
  h2.vis = null;
  h2.pinch = false;
  h2.on = 0;
  filterX2.reset();
  filterY2.reset();
}

// One hand-tracking pass on the newest camera frame.
function trackFrame() {
  if (!landmarker || video.readyState < 2) return;
  const t0 = performance.now();
  const result = landmarker.detectForVideo(video, t0);
  const t1 = performance.now();
  trackMs = trackMs * 0.9 + (t1 - t0) * 0.1;
  if (result.landmarks && result.landmarks.length > 0) {
    const L = result.landmarks;
    let idx = 0;
    if (L.length > 1 && realPen) {
      const d = (i) => Math.hypot(
        (1 - (L[i][4].x + L[i][8].x) / 2) * canvas.width - realPen.x,
        ((L[i][4].y + L[i][8].y) / 2) * canvas.height - realPen.y
      );
      idx = d(1) < d(0) ? 1 : 0;   // keep the hand that was already drawing as the main hand
    }
    _hadHand = true;
    handleHand(L[idx], t1);
    if (L.length > 1) handleHand2(L[1 - idx], t1);
    else handleNoHand2(t1);
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
  const p0 = toCanvas(e);
  if (tabAt(p0)) {
    toggleBar();
    return;
  }
  const hitButton = showBar ? buttonAt(p0) : null;
  if (hitButton) {
    pressButton(hitButton, performance.now());
    return;
  }
  if (e.shiftKey) {
    const picked = objectAtPoint(p0);
    if (picked) toggleSelect(picked);
    return;
  }
  mouseCurrent = [p0];
  canvas.setPointerCapture(e.pointerId);
});

canvas.addEventListener("pointermove", (e) => {
  if (!mouseCurrent) return;
  const p = toCanvas(e);
  const last = mouseCurrent[mouseCurrent.length - 1];
  if (dist(p, last) >= MIN_POINT_GAP) mouseCurrent.push(p);
});

function finishMouseStroke() {
  if (mouseCurrent) commitStroke(mouseCurrent);
  mouseCurrent = null;
}

canvas.addEventListener("pointerup", finishMouseStroke);
canvas.addEventListener("pointercancel", finishMouseStroke);
canvas.addEventListener("dblclick", (e) => {
  const p = toCanvas(e);
  if (tabAt(p) || (showBar && buttonAt(p))) return;
  spawnTestBall(p.x, p.y);
});