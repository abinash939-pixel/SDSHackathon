(() => {
  const button = document.getElementById("voiceCommandsBtn");
  if (!button) return;

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    button.disabled = true;
    button.title = "Speech recognition is not supported by this browser.";
    if (typeof showToast === "function") {
      showToast("Voice commands are not supported by this browser");
    }
    return;
  }

  const recognition = new SpeechRecognition();
  let listening = false;
  let preparing = false;
  let localSpeechReady = false;
  let recognitionActive = false;
  const handledResults = new Set();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = "en-US";

  function updateButton() {
    button.textContent = preparing
      ? "Preparing voice commands..."
      : (listening ? "Stop voice commands" : "Start voice commands");
    button.disabled = preparing;
    button.setAttribute("aria-pressed", String(listening));
  }

  function startRecognition(showStatus) {
    if (!listening || recognitionActive) return;
    try {
      recognition.processLocally = true;
      recognitionActive = true;
      recognition.start();
      if (showStatus && typeof showToast === "function") {
        showToast("Listening with on-device speech recognition");
      }
    } catch (error) {
      recognitionActive = false;
      listening = false;
      updateButton();
      console.error("Could not start voice command recognition:", error);
      if (typeof showToast === "function") showToast("Could not start voice commands");
    }
  }

  function startListening() {
    listening = true;
    preparing = false;
    updateButton();
    startRecognition(true);
  }

  async function startVoiceCommands() {
    preparing = true;
    updateButton();

    if (!("processLocally" in recognition)) {
      preparing = false;
      updateButton();
      if (typeof showToast === "function") {
        showToast("On-device speech is not supported here. Use an up-to-date Chrome browser.");
      }
      return;
    }

    try {
      if (!localSpeechReady && typeof SpeechRecognition.available === "function") {
        const options = { langs: [recognition.lang], processLocally: true, quality: "command" };
        const availability = await SpeechRecognition.available(options);
        if (availability === "unavailable") {
          throw new Error("On-device English speech is unavailable in this browser.");
        }
        if (availability === "downloadable" || availability === "downloading") {
          if (typeof SpeechRecognition.install !== "function") {
            throw new Error("The browser cannot install the on-device English speech pack.");
          }
          if (typeof showToast === "function") {
            showToast("Preparing the on-device English speech pack");
          }
          const installed = await SpeechRecognition.install({
            langs: [recognition.lang],
            quality: "command"
          });
          if (!installed) {
            throw new Error("The on-device English speech pack could not be installed.");
          }
        }
        localSpeechReady = true;
      }
      startListening();
    } catch (error) {
      preparing = false;
      listening = false;
      updateButton();
      console.error("On-device speech recognition setup failed:", error);
      if (typeof showToast === "function") {
        showToast("On-device English speech is unavailable. Update Chrome and install its English speech pack.");
      }
    }
  }

  function randomBetween(min, max) {
    return min + Math.random() * (max - min);
  }

  function regularPolygon(center, radius, sides, rotation) {
    return Array.from({ length: sides }, (_, index) => {
      const angle = rotation + index * Math.PI * 2 / sides;
      return {
        x: center.x + Math.cos(angle) * radius,
        y: center.y + Math.sin(angle) * radius
      };
    });
  }

  function createVoiceShape(requestedShape) {
    const canvas = document.getElementById("overlay");
    if (!canvas || canvas.width < 1 || canvas.height < 1) {
      if (typeof showToast === "function") showToast("Wait for the camera before drawing a shape");
      return false;
    }

    const shapeNames = ["circle", "triangle", "square", "rectangle", "diamond", "pentagon", "hexagon", "star"];
    const shape = requestedShape === "shape"
      ? shapeNames[Math.floor(Math.random() * shapeNames.length)]
      : requestedShape;
    const maxRadius = Math.max(18, Math.min(56, Math.min(canvas.width, canvas.height) * 0.12));
    const minRadius = Math.min(maxRadius, Math.max(24, maxRadius * 0.65));
    const radius = randomBetween(minRadius, maxRadius);
    const marginX = Math.min(radius * 1.8, canvas.width / 2);
    const marginY = Math.min(radius * 1.8, canvas.height / 2);
    const center = {
      x: randomBetween(marginX, Math.max(marginX, canvas.width - marginX)),
      y: randomBetween(marginY, Math.max(marginY, canvas.height - marginY))
    };
    const rotation = randomBetween(-Math.PI, Math.PI);
    let created = false;
    let label = "";
    let behavior = "";

    if (shape === "circle") {
      const points = window.makeCirclePoints(center, radius, 32);
      created = addCircleObject(points, { center: center, radius: radius, poly: points });
      label = "Circle";
    } else {
      let poly;
      if (shape === "triangle") {
        poly = regularPolygon(center, radius, 3, rotation);
        label = "Triangle";
        behavior = "Solid Wedge";
      } else if (shape === "square") {
        const squareRadius = radius / Math.SQRT2;
        poly = regularPolygon(center, squareRadius, 4, Math.PI / 4);
        label = "Square";
        behavior = "Balanced Block";
      } else if (shape === "rectangle") {
        const halfWidth = radius * randomBetween(1.05, 1.35);
        const halfHeight = radius * randomBetween(0.65, 0.85);
        poly = [
          { x: center.x - halfWidth, y: center.y - halfHeight },
          { x: center.x + halfWidth, y: center.y - halfHeight },
          { x: center.x + halfWidth, y: center.y + halfHeight },
          { x: center.x - halfWidth, y: center.y + halfHeight }
        ];
        label = "Rectangle";
        behavior = "Heavy Plank";
      } else if (shape === "diamond") {
        poly = [
          { x: center.x, y: center.y - radius },
          { x: center.x + radius * 0.72, y: center.y },
          { x: center.x, y: center.y + radius },
          { x: center.x - radius * 0.72, y: center.y }
        ];
        label = "Diamond";
        behavior = "Bouncy Gem";
      } else if (shape === "pentagon" || shape === "hexagon") {
        poly = regularPolygon(center, radius, shape === "pentagon" ? 5 : 6, rotation);
        label = shape === "pentagon" ? "Pentagon" : "Hexagon";
        behavior = "Solid Body";
      } else if (shape === "star") {
        poly = window.makeStarPoints(center, radius, radius * 0.42, 5);
        label = "Star";
        behavior = "Super Bumper";
      }

      if (poly) created = addSolid(poly, poly, label, behavior);
    }

    if (!created) {
      if (typeof showToast === "function") showToast("Could not create a " + shape);
      return false;
    }

    const object = objects[objects.length - 1];
    object.color = drawingColor;
    assignLocalObjectIdentity(object);
    sendObjectCreation(object);
    trimObjects();
    if (typeof showToast === "function") showToast("Drew " + label.toLowerCase());
    return true;
  }

  function runVoiceCommand(transcript) {
    const command = findVoiceCommand(normalizeCommand(transcript));
    if (!command) return false;
    const drawMatch = getDrawShapeMatch(command);
    if (drawMatch) {
      return createVoiceShape(drawMatch[1]);
    } else if (command === "draw mode on") {
      setDrawMode(true);
    } else if (command === "draw mode off") {
      setDrawMode(false);
    } else if (/^(?:please )?(?:resume|continue|unpause)(?: (?:the )?(?:simulation|world|game|physics))?$/.test(command)) {
      setPausedWorld(false);
      if (typeof showToast === "function") showToast("Simulation resumed");
    } else if (command === "float mode") {
      setGravityEnabled(false);
      if (typeof showToast === "function") showToast("Float mode - gravity off");
    } else if (command === "fall down") {
      setGravityEnabled(true);
      if (typeof showToast === "function") showToast("Fall down - gravity on");
    } else if (["pause", "pause simulation", "pause the simulation"].includes(command)) {
      setPausedWorld(true);
      if (typeof showToast === "function") showToast("Simulation paused");
    } else if (command === "destroy all") {
      clearAll();
    } else if (command === "undo") {
      runAction("undo");
    } else {
      return false;
    }
    return true;
  }

  function normalizeCommand(transcript) {
    return transcript.toLowerCase().replace(/[.,!?]/g, " ").replace(/\s+/g, " ").trim();
  }

  function getDrawShapeMatch(command) {
    return command.match(/^(?:(?:draw|make|create) )?(?:a |an )?(circle|triangle|square|rectangle|diamond|pentagon|hexagon|star|shape)$/);
  }

  function findVoiceCommand(transcript) {
    const patterns = [
      /\b(?:(?:draw|make|create) )?(?:a |an )?(?:circle|triangle|square|rectangle|diamond|pentagon|hexagon|star|shape)\b/,
      /\b(?:draw mode on|draw mode off)\b/,
      /\b(?:please )?(?:resume|continue|unpause)(?: (?:the )?(?:simulation|world|game|physics))?\b/,
      /\bfloat mode\b/,
      /\bfall down\b/,
      /\b(?:pause the simulation|pause simulation|pause)\b/,
      /\bdestroy all\b/,
      /\bundo\b/
    ];
    let firstMatch = null;
    for (const pattern of patterns) {
      const match = pattern.exec(transcript);
      if (match && (!firstMatch || match.index < firstMatch.index)) firstMatch = match;
    }
    return firstMatch ? firstMatch[0].trim() : "";
  }

  function isCompleteCommand(command) {
    return !!findVoiceCommand(command);
  }

  recognition.onstart = () => {
    recognitionActive = true;
    handledResults.clear();
  };

  recognition.onresult = (event) => {
    for (let i = event.resultIndex; i < event.results.length; i++) {
      if (handledResults.has(i)) continue;
      const result = event.results[i];
      const transcript = normalizeCommand(result[0].transcript);
      const command = findVoiceCommand(transcript);
      if (result.isFinal) {
        if (runVoiceCommand(transcript)) {
          handledResults.add(i);
        } else if (command && typeof showToast === "function") {
          showToast("Heard: " + result[0].transcript.trim().slice(0, 70));
        }
      } else if (command && isCompleteCommand(command) && !handledResults.has(i)) {
        if (runVoiceCommand(transcript)) handledResults.add(i);
      }
    }
  };

  recognition.onerror = (event) => {
    console.error("Voice command recognition error:", event.error);
    if (event.error === "not-allowed" || event.error === "service-not-allowed" ||
        event.error === "network" || event.error === "language-not-supported") {
      listening = false;
      updateButton();
      if (typeof showToast === "function") {
        if (event.error === "network") {
          showToast("On-device speech could not start. Update Chrome and install its English speech pack.");
        } else if (event.error === "language-not-supported") {
          showToast("On-device English speech is unavailable. Install the browser language pack and retry.");
        } else {
          showToast("Microphone permission is required for voice commands");
        }
      }
    } else if (typeof showToast === "function") {
      showToast(event.error === "no-speech"
        ? "No speech detected. Check your microphone and try again."
        : "Voice recognition error: " + event.error);
    }
  };

  recognition.onend = () => {
    recognitionActive = false;
    if (listening) startRecognition(false);
  };

  button.addEventListener("click", () => {
    if (listening) {
      listening = false;
      updateButton();
      if (recognitionActive) recognition.stop();
      if (typeof showToast === "function") showToast("Voice commands stopped");
      return;
    }

    if (preparing) return;
    startVoiceCommands().catch((error) => {
      preparing = false;
      listening = false;
      updateButton();
      console.error("Could not prepare voice command recognition:", error);
      if (typeof showToast === "function") showToast("Could not prepare voice commands");
    });
  });
})();
