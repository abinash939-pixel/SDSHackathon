let peer;
let conn;
let remoteOwnerId = null;
let sceneSyncTimer = null;
const micToggleBtn = document.getElementById('micToggleBtn');

function syncMicrophoneButton() {
  if (!micToggleBtn) return;
  const stream = document.getElementById('video').srcObject;
  const tracks = stream ? stream.getAudioTracks() : [];
  const available = tracks.some((track) => track.readyState === 'live');
  const enabled = available && tracks.every((track) => track.enabled);
  const label = available ? (enabled ? 'Mute microphone' : 'Unmute microphone') : 'Microphone unavailable';
  micToggleBtn.disabled = !available;
  micToggleBtn.dataset.icon = enabled ? 'mic' : 'micOff';
  micToggleBtn.setAttribute('aria-label', label);
  micToggleBtn.setAttribute('title', label);
  micToggleBtn.setAttribute('aria-pressed', String(available && !enabled));
  micToggleBtn.classList.toggle('on', available && !enabled);
  if (typeof initToolbarIcons === 'function') initToolbarIcons();
}

if (micToggleBtn) {
  micToggleBtn.addEventListener('click', () => {
    const stream = document.getElementById('video').srcObject;
    const tracks = stream ? stream.getAudioTracks() : [];
    if (tracks.length === 0) return;
    const enable = !tracks.every((track) => track.enabled);
    tracks.forEach((track) => { track.enabled = enable; });
    syncMicrophoneButton();
    if (typeof showToast === 'function') showToast(enable ? 'Microphone on' : 'Microphone muted');
  });
}
window.addEventListener('local-media-ready', syncMicrophoneButton);

const sharedOwnerId = (window.crypto && typeof window.crypto.randomUUID === "function")
  ? window.crypto.randomUUID()
  : "owner-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
window.sharedSpace = {
  localOwnerId: sharedOwnerId,
  authorityOwnerId: sharedOwnerId,
  remoteOwnerId: null,
  applyingRemoteUpdate: false
};

window.isMultiplayerConnected = function () {
  return !!(conn && conn.open && remoteOwnerId);
};

window.isMinigameAuthority = function () {
  return window.sharedSpace.localOwnerId === window.sharedSpace.authorityOwnerId;
};

window.requestMinigameAction = function (action, gameId) {
  if (!window.isMultiplayerConnected() || window.isMinigameAuthority()) return false;
  sendToPeer({
    type: 'minigame-request',
    ownerId: window.sharedSpace.localOwnerId,
    action: action,
    gameId: gameId
  });
  return true;
};

window.requestMinigameControl = function (index) {
  if (!window.isMultiplayerConnected() || window.isMinigameAuthority()) return false;
  sendToPeer({
    type: 'minigame-control-request',
    ownerId: window.sharedSpace.localOwnerId,
    index: index
  });
  return true;
};

window.broadcastMinigameState = function (state) {
  if (!window.isMultiplayerConnected() || !window.isMinigameAuthority()) return;
  sendToPeer({
    type: 'minigame-state',
    ownerId: window.sharedSpace.localOwnerId,
    state: state
  });
};

window.broadcastMinigameControl = function (index) {
  if (!window.isMultiplayerConnected() || !window.isMinigameAuthority()) return;
  sendToPeer({
    type: 'minigame-control',
    ownerId: window.sharedSpace.localOwnerId,
    index: index
  });
};

window.sendMinigameEvent = function (event) {
  if (!window.isMultiplayerConnected()) return;
  sendToPeer({ type: 'minigame-event', ownerId: window.sharedSpace.localOwnerId, event: event });
};

window.broadcastMinigameHands = function (hands) {
  if (!window.isMultiplayerConnected() || !Array.isArray(hands)) return;
  const normalized = hands.slice(0, 1).map((hand) => hand.map((point) => ({
    x: point.x,
    y: point.y,
    z: Number.isFinite(point.z) ? point.z : 0
  })));
  sendToPeer({
    type: 'minigame-hands',
    ownerId: window.sharedSpace.localOwnerId,
    hands: normalized
  });
};

function initMultiplayer() {
  syncMicrophoneButton();
  peer = new Peer(undefined, { debug: 2 });

  peer.on('open', (id) => {
    document.getElementById('myIdDisplay').textContent = id;
  });

  peer.on('error', (error) => {
    console.error('PeerJS error:', error);
    document.getElementById('myIdDisplay').textContent =
      'Connection error. Signaling server may be blocked.';
  });

  peer.on('connection', (connection) => {
    setupDataConnection(connection);
  });

  peer.on('call', (call) => {
    const localStream = document.getElementById('video').srcObject;
    call.answer(localStream);

    call.on('stream', (remoteStream) => {
      playRemoteStream(remoteStream);
    });

    if (typeof showToast === 'function') showToast("Friend Connected!");
  });
}

document.getElementById('connectBtn').addEventListener('click', () => {
  const remoteId = document.getElementById('peerIdInput').value.trim();
  if (!remoteId) return;

  if (!peer || !peer.open) {
    if (typeof showToast === 'function') showToast('Peer connection is still starting.');
    return;
  }

  const localStream = document.getElementById('video').srcObject;
  if (!localStream) {
    if (typeof showToast === 'function') showToast("Camera not ready yet!");
    return;
  }

  setupDataConnection(peer.connect(remoteId));
  const call = peer.call(remoteId, localStream);

  call.on('stream', (remoteStream) => {
    playRemoteStream(remoteStream);
  });

  if (typeof showToast === 'function') showToast("Calling friend...");
});

function setupDataConnection(connection) {
  conn = connection;

  conn.on('open', () => {
    conn.send({ type: 'hello', ownerId: window.sharedSpace.localOwnerId });
    if (typeof showToast === 'function') showToast('Drawing sync connected.');
  });

  conn.on('data', (data) => {
    if (!data || typeof data !== 'object') return;
    if (data.type === 'hello') {
      if (typeof data.ownerId === 'string' && data.ownerId !== window.sharedSpace.localOwnerId) {
        remoteOwnerId = data.ownerId;
        window.sharedSpace.remoteOwnerId = remoteOwnerId;
        document.getElementById('wrap').dataset.partnerConnected = 'true';
        window.sharedSpace.authorityOwnerId =
          sharedOwnerId < remoteOwnerId ? sharedOwnerId : remoteOwnerId;
        window.broadcastWorldState();
        for (const object of objects) {
          if (object.ownerId === window.sharedSpace.localOwnerId) {
            window.broadcastObjectCreation(object);
          }
          if (typeof window.GameEngine !== 'undefined') {
            window.broadcastMinigameState(window.GameEngine.getSessionState());
          }
        }
        if (sceneSyncTimer !== null) clearInterval(sceneSyncTimer);
        sceneSyncTimer = window.setInterval(broadcastSceneState, 50);
      }
      return;
    }
    if (data.type === 'scene-state') {
      if (data.ownerId === remoteOwnerId &&
          data.ownerId === window.sharedSpace.authorityOwnerId) {
        applySceneState(data.objects);
        if (window.GameEngine && data.gameState) {
          window.GameEngine.applySyncState(data.gameState);
        }
      }
      return;
    }
    if (data.type === 'minigame-state' &&
        data.ownerId === window.sharedSpace.authorityOwnerId &&
        window.GameEngine && data.state) {
      window.GameEngine.applyRemoteState(data.state);
      return;
    }
    if (data.type === 'minigame-control' &&
        data.ownerId === window.sharedSpace.authorityOwnerId &&
        window.GameEngine && Number.isInteger(data.index)) {
      window.GameEngine.handleRemoteControl(data.index);
      return;
    }
    if (data.type === 'minigame-request' &&
        data.ownerId === remoteOwnerId && window.isMinigameAuthority() &&
        window.GameEngine &&
        (data.action === 'start' && typeof data.gameId === 'string' ||
          data.action === 'stop')) {
      window.GameEngine.handleRemoteRequest(data.action, data.gameId);
      return;
    }
    if (data.type === 'minigame-control-request' &&
        data.ownerId === remoteOwnerId && window.isMinigameAuthority() &&
        window.GameEngine && Number.isInteger(data.index)) {
      window.GameEngine.handleRemoteControl(data.index);
      return;
    }
    if (data.type === 'minigame-event' && data.ownerId === remoteOwnerId &&
        window.GameEngine && data.event) {
      window.GameEngine.handleGameEvent(data.event, data.ownerId);
      return;
    }
    if (data.type === 'minigame-hands' && data.ownerId === remoteOwnerId &&
        window.GameEngine && Array.isArray(data.hands) && data.hands.length <= 2) {
      const hands = data.hands.filter((hand) =>
        Array.isArray(hand) && hand.length === 21 &&
        hand.every((point) => point && Number.isFinite(point.x) &&
          Number.isFinite(point.y) && point.x >= 0 && point.x <= 1 &&
          point.y >= 0 && point.y <= 1)
      );
      window.GameEngine.setRemoteHands(hands);
      return;
    }
    if (typeof remoteOwnerId !== 'string' || data.ownerId !== remoteOwnerId) return;

    if (data.type === 'world-state' &&
        typeof data.paused === 'boolean' && typeof data.gravityOn === 'boolean') {
      setPausedWorld(data.paused, false);
      setGravityEnabled(data.gravityOn, false);
      if (typeof data.linesFall === 'boolean') setLinesFall(data.linesFall, false);
      if (typeof data.pushFrozen === 'boolean') setPushFrozen(data.pushFrozen, false);
      return;
    }

    if (data.type === 'stroke' && Array.isArray(data.points) &&
        typeof data.objectId === 'string') {
      if (objects.some((o) => o.objectId === data.objectId)) return;
      const canvas = document.getElementById('overlay');
      const points = data.points.filter((p) =>
        p && Number.isFinite(p.x) && Number.isFinite(p.y)
      ).map((point) => ({
        x: point.x * canvas.width,
        y: point.y * canvas.height
      }));
      if (points.length === data.points.length) {
        commitStroke(points, true, remoteOwnerId, data.objectId, data.color);
      }
      return;
    }

    if (data.type === 'object-create' && window.GameEngine &&
        window.GameEngine.isGameRunning('asteroid-shooter')) return;

    if (data.type === 'object-create' && typeof data.objectId === 'string' && data.object) {
      if (objects.some((o) => o.objectId === data.objectId)) return;
      const objectData = scaleSerializedObject(data.object, true);
      if (deserObj(objectData)) {
        const created = objects[objects.length - 1];
        created.ownerId = remoteOwnerId;
        created.objectId = data.objectId;
      }
      return;
    }

    if (data.type === 'object-remove' && typeof data.objectId === 'string') {
      const target = objects.find((o) =>
        o.objectId === data.objectId && o.ownerId === remoteOwnerId
      );
      if (target) {
        window.sharedSpace.applyingRemoteUpdate = true;
        try {
          removeObject(target);
        } finally {
          window.sharedSpace.applyingRemoteUpdate = false;
        }
      }
      return;
    }

    if (data.type === 'object-move' && typeof data.objectId === 'string') {
      applyRemoteMove(data);
    }
  });

  conn.on('error', (error) => {
    console.error('PeerJS data connection error:', error);
    document.getElementById('wrap').dataset.partnerConnected = 'false';
  });
  conn.on('close', () => {
    document.getElementById('wrap').dataset.partnerConnected = 'false';
    remoteOwnerId = null;
    window.sharedSpace.remoteOwnerId = null;
    window.sharedSpace.authorityOwnerId = window.sharedSpace.localOwnerId;
    if (window.GameEngine) window.GameEngine.setRemoteHands([]);
    if (sceneSyncTimer !== null) {
      clearInterval(sceneSyncTimer);
      sceneSyncTimer = null;
    }
  });
}

function sendToPeer(message) {
  if (conn && conn.open) conn.send(message);
}

window.broadcastWorldState = function () {
  sendToPeer({
    type: 'world-state',
    ownerId: window.sharedSpace.localOwnerId,
    paused: pausedWorld,
    gravityOn: gravityOn,
    linesFall: linesFall,
    pushFrozen: pushFrozen
  });
};

function broadcastSceneState() {
  if (!conn || !conn.open ||
      window.sharedSpace.authorityOwnerId !== window.sharedSpace.localOwnerId) return;
  if (document.hidden) return;
  const canvas = document.getElementById('overlay');
  sendToPeer({
    type: 'scene-state',
    ownerId: window.sharedSpace.localOwnerId,
    gameState: window.GameEngine ? window.GameEngine.getSyncState() : null,
    objects: objects.map((object) => ({
      objectId: object.objectId,
      ownerId: object.ownerId,
      floating: !!object.floating,
      pinned: !!object.pinned,
      scaleMultiplier: object.scaleMultiplier || 1,
      bodies: (object.kind === 'platform' ? object.bodies.slice(0, 1) : object.bodies).map((body) => ({
        x: body.position.x / canvas.width,
        y: body.position.y / canvas.height,
        angle: body.angle,
        vx: body.velocity.x / canvas.width,
        vy: body.velocity.y / canvas.height,
        angularVelocity: body.angularVelocity,
        isStatic: body.isStatic
      }))
    }))
  });
}

function applySceneState(sceneObjects) {
  if (!Array.isArray(sceneObjects)) return;
  const canvas = document.getElementById('overlay');
  window.sharedSpace.applyingRemoteUpdate = true;
  try {
    for (const state of sceneObjects) {
      if (!state || typeof state.objectId !== 'string' ||
          !Array.isArray(state.bodies) || typeof state.floating !== 'boolean' ||
          typeof state.pinned !== 'boolean') continue;
      const object = objects.find((item) =>
        item.objectId === state.objectId && item.ownerId === state.ownerId
      );
      const expectedBodyCount = object && object.kind === 'platform' ? 1 : object && object.bodies.length;
      if (!object || object.bodies.length === 0 || expectedBodyCount !== state.bodies.length) continue;

      if (Number.isFinite(state.scaleMultiplier) && typeof scaleObject === 'function') {
        const currentScale = object.scaleMultiplier || 1;
        scaleObject(object, state.scaleMultiplier / currentScale);
      }

      if (object.kind === 'platform') {
        const first = state.bodies[0];
        if (!first || !Number.isFinite(first.x) || !Number.isFinite(first.y)) continue;
        const anchor = object.bodies[0].position;
        shiftStatic(
          object,
          first.x * canvas.width - anchor.x,
          first.y * canvas.height - anchor.y
        );
      }

      if (object.body && object.kind !== 'spiral') {
        setFloating(object, state.floating);
        object.pinned = state.pinned;
      }
      const stateBodies = object.kind === 'platform' ? [object.bodies[0]] : object.bodies;
      for (let i = 0; i < stateBodies.length; i++) {
        const body = stateBodies[i];
        const target = state.bodies[i];
        if (!target || ![
          target.x, target.y, target.angle, target.vx, target.vy,
          target.angularVelocity
        ].every(Number.isFinite) || typeof target.isStatic !== 'boolean') continue;
        if (body.isStatic !== target.isStatic) Body.setStatic(body, target.isStatic);
        Body.setPosition(body, {
          x: target.x * canvas.width,
          y: target.y * canvas.height
        });
        Body.setAngle(body, target.angle);
        Body.setVelocity(body, {
          x: target.vx * canvas.width,
          y: target.vy * canvas.height
        });
        Body.setAngularVelocity(body, target.angularVelocity);
        body._ip = {
          x: body.position.x,
          y: body.position.y,
          a: body.angle
        };
      }
    }
  } finally {
    window.sharedSpace.applyingRemoteUpdate = false;
  }
}

function scaleSerializedObject(data, toPixels) {
  const canvas = document.getElementById('overlay');
  const scaleX = toPixels ? canvas.width : 1 / canvas.width;
  const scaleY = toPixels ? canvas.height : 1 / canvas.height;
  const radiusScale = (canvas.width + canvas.height) / 2;
  const result = { ...data };
  for (const key of ['raw', 'v', 's']) {
    if (Array.isArray(result[key])) {
      result[key] = result[key].map((point) => ({
        x: point.x * scaleX,
        y: point.y * scaleY
      }));
    }
  }
  if (Array.isArray(result.components)) {
    result.components = result.components.map((component) => scaleSerializedObject(component, toPixels));
  }
  if (Number.isFinite(result.wellRadius)) {
    result.wellRadius = toPixels
      ? result.wellRadius * radiusScale
      : result.wellRadius / radiusScale;
  }
  return result;
}

window.broadcastStroke = function (points, ownerId, objectId, color) {
  if (!Array.isArray(points)) return;
  const canvas = document.getElementById('overlay');
  sendToPeer({
    type: 'stroke',
    ownerId: ownerId,
    objectId: objectId,
    color: isValidDrawingColor(color) ? color : null,
    points: points.map((point) => ({
      x: point.x / canvas.width,
      y: point.y / canvas.height
    }))
  });
};

window.broadcastObjectCreation = function (object) {
  if (!object || !object.objectId || typeof serObj !== 'function') return;
  sendToPeer({
    type: 'object-create',
    ownerId: object.ownerId,
    objectId: object.objectId,
    object: scaleSerializedObject(serObj(object), false)
  });
};

window.broadcastObjectRemoval = function (object) {
  if (!object || !object.objectId || window.sharedSpace.applyingRemoteUpdate) return;
  sendToPeer({
    type: 'object-remove',
    ownerId: object.ownerId,
    objectId: object.objectId
  });
};

window.broadcastObjectMove = function (object) {
  if (!object || !object.objectId) return;
  const canvas = document.getElementById('overlay');
  const body = object.body || object.bodies[0];
  if (!body) return;
  sendToPeer({
    type: 'object-move',
    ownerId: object.ownerId,
    objectId: object.objectId,
    x: body.position.x / canvas.width,
    y: body.position.y / canvas.height,
    angle: object.body ? object.body.angle : 0,
    vx: object.body ? object.body.velocity.x / canvas.width : 0,
    vy: object.body ? object.body.velocity.y / canvas.height : 0,
    angularVelocity: object.body ? object.body.angularVelocity : 0,
    isStatic: object.body ? object.body.isStatic : true,
    floating: !!object.floating,
    scaleMultiplier: object.scaleMultiplier || 1
  });
};

function applyRemoteMove(data) {
  const values = [data.x, data.y, data.angle, data.vx, data.vy, data.angularVelocity];
  if (!values.every(Number.isFinite) || typeof data.isStatic !== 'boolean' ||
      typeof data.floating !== 'boolean') return;
  const object = objects.find((o) =>
    o.objectId === data.objectId && o.ownerId === remoteOwnerId
  );
  if (!object) return;

  if (Number.isFinite(data.scaleMultiplier) && typeof scaleObject === 'function') {
    const currentScale = object.scaleMultiplier || 1;
    scaleObject(object, data.scaleMultiplier / currentScale);
  }

  const canvas = document.getElementById('overlay');
  const body = object.body || object.bodies[0];
  if (!body) return;
  const target = { x: data.x * canvas.width, y: data.y * canvas.height };
  if (object.body && object.kind !== "spiral") setFloating(object, data.floating);
  if (object.body) {
    Body.setPosition(object.body, target);
    Body.setAngle(object.body, data.angle);
    if (object.body.isStatic !== data.isStatic) Body.setStatic(object.body, data.isStatic);
    Body.setVelocity(object.body, {
      x: data.vx * canvas.width,
      y: data.vy * canvas.height
    });
    Body.setAngularVelocity(object.body, data.angularVelocity);
  } else {
    shiftStatic(object, target.x - body.position.x, target.y - body.position.y);
  }
}

function playRemoteStream(remoteStream) {
  const remoteVideo = document.getElementById('remoteVideo');
  remoteVideo.muted = false;
  remoteVideo.volume = 1;
  remoteVideo.playsInline = true;
  remoteVideo.srcObject = remoteStream;
  const startPlayback = () => {
    remoteVideo.play().then(() => {
      if (typeof showToast === 'function') showToast("Video and audio connected");
    }).catch(() => {
      if (typeof showToast === 'function') showToast("Call connected. Click the partner video to enable audio.");
    });
  };
  remoteVideo.onloadedmetadata = startPlayback;
  remoteVideo.onclick = startPlayback;
}

window.addEventListener('DOMContentLoaded', initMultiplayer);
