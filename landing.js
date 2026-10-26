(() => {
  const currentDay = document.querySelector("#currentDay");
  const currentTime = document.querySelector("#currentTime");
  if (currentDay && currentTime) {
    const updateMastheadClock = () => {
      const now = new Date();
      currentDay.textContent = `${now.toLocaleDateString(undefined, { weekday: "long" }).toUpperCase()} CHALLENGE`;
      currentTime.textContent = [now.getHours(), now.getMinutes(), now.getSeconds()]
        .map((value) => String(value).padStart(2, "0"))
        .join(":");
    };
    updateMastheadClock();
    window.setInterval(updateMastheadClock, 1000);
  }

  const rays = document.querySelector(".posterBacklight");
  const rayHero = document.querySelector(".landingScreen");
  if (rays && rayHero) {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let rayFramePending = false;
    function updateRays() {
      rayFramePending = false;
      const height = Math.max(1, rayHero.offsetHeight);
      const progress = Math.max(0, Math.min(1, -rayHero.getBoundingClientRect().top / height));
      rays.style.setProperty("--rays-center", (rayHero.offsetTop + height / 2) + "px");
      rays.style.setProperty("--rays-scale", reducedMotion.matches ? "1" : String(1 + progress * 0.65));
      rays.style.setProperty("--rays-opacity", String(1 - progress));
    }
    function scheduleRays() {
      if (rayFramePending) return;
      rayFramePending = true;
      requestAnimationFrame(updateRays);
    }
    window.addEventListener("scroll", scheduleRays, { passive: true });
    window.addEventListener("resize", scheduleRays);
    reducedMotion.addEventListener("change", scheduleRays);
    updateRays();
  }

  const arrowSections = [
    { section: document.querySelector(".landingScreen"), arrow: document.querySelector(".scrollArrow") },
    { section: document.querySelector(".modeSection"), arrow: document.querySelector(".modeNextLink") },
    { section: document.querySelector(".aboutSection"), arrow: document.querySelector(".aboutTopLink") }
  ].filter(({ section, arrow }) => section && arrow);

  const updateActiveArrow = () => {
    const center = window.innerHeight / 2;
    const active = arrowSections.find(({ section }) => {
      const bounds = section.getBoundingClientRect();
      return bounds.top <= center && bounds.bottom > center;
    });
    arrowSections.forEach(({ arrow }) => {
      const unlocked = arrow.dataset.unlocked !== "false";
      arrow.classList.toggle("is-visible", unlocked && arrow === active?.arrow);
    });
  };

  if ("IntersectionObserver" in window) {
    const arrowObserver = new IntersectionObserver(updateActiveArrow, {
      rootMargin: "-45% 0px -45% 0px",
      threshold: 0
    });
    arrowSections.forEach(({ section }) => arrowObserver.observe(section));
    updateActiveArrow();
  } else {
    window.addEventListener("scroll", updateActiveArrow, { passive: true });
    window.addEventListener("resize", updateActiveArrow);
    updateActiveArrow();
  }

  const tvScene = document.querySelector("#tvScene");
  const television = document.querySelector("#vintageTv");
  const scrollArrow = document.querySelector(".scrollArrow");
  const screenPrompt = document.querySelector(".tvScreenPrompt");
  const tvCaption = document.querySelector("#tvCaption");
  const tvBurst = document.querySelector(".tvBurst");
  const tvPopShapes = document.querySelector(".tvPopShapes");
  const edgeBlocks = document.querySelector(".edgeBlocks");

  if (tvScene && television && scrollArrow && tvBurst && tvPopShapes && edgeBlocks) {
    let tuningClicks = 0;
    let arrowTimerStarted = false;
    const explodedSessionKey = "sketch2sim-tv-exploded";
    const alreadyExploded = sessionStorage.getItem(explodedSessionKey) === "true"
      || sessionStorage.getItem("sketch2ism-tv-exploded") === "true";
    const tuneMessages = [
      ["SIGNAL FOUND", "A little static... try the dial once more."],
      ["LOCKING FREQUENCY", "One more click to bring the picture through."],
      ["SIGNAL BREAKTHROUGH", "The signal is yours. Choose a mode below to start playing."]
    ];
    const accentColors = ["#ff85bd", "#ffe338", "#b9f43b", "#c5a4ff"];

    function addPopShapes() {
      for (let index = 0; index < 9; index += 1) {
        const shape = document.createElement("i");
        const angle = Math.random() * Math.PI * 2;
        const distance = 45 + Math.random() * 125;
        shape.className = ["", "popCircle", "popDiamond"][Math.floor(Math.random() * 3)];
        shape.style.setProperty("--pop-x", `${Math.cos(angle) * distance}px`);
        shape.style.setProperty("--pop-y", `${Math.sin(angle) * distance}px`);
        shape.style.setProperty("--pop-size", `${10 + Math.round(Math.random() * 18)}px`);
        shape.style.setProperty("--pop-turn", `${Math.round(Math.random() * 160 - 80)}deg`);
        shape.style.setProperty("--pop-color", accentColors[Math.floor(Math.random() * accentColors.length)]);
        shape.style.animationDelay = `${Math.round(Math.random() * 90)}ms`;
        tvPopShapes.append(shape);
        window.setTimeout(() => shape.remove(), 900);
      }
    }

    function addEdgeBlocks() {
      const positions = [];
      const count = 12;
      const width = edgeBlocks.clientWidth || window.innerWidth;
      const height = edgeBlocks.clientHeight || window.innerHeight;
      const size = Math.min(112, Math.max(64, width * 0.075));
      // Choose the most open of several random spots to avoid both rows and large gaps.
      for (let index = 0; index < count; index++) {
        let best = null;
        let bestDistance = -1;
        for (let attempt = 0; attempt < 180; attempt++) {
          const x = 12 + Math.random() * Math.max(1, width - size - 24);
          const y = height * 0.09 + Math.random() * Math.max(1, height * 0.86 - size);
          const overlapsTitle = x < width * 0.84 && x + size > width * 0.16 &&
            y < height * 0.65 && y + size > height * 0.36;
          const overlapsArrow = x < width * 0.55 && x + size > width * 0.45 && y + size > height * 0.89;
          if (overlapsTitle || overlapsArrow) continue;
          let nearest = Infinity;
          for (const [left, top] of positions) {
            const dx = x - left * width / 100;
            const dy = y - top * height / 100;
            nearest = Math.min(nearest, dx * dx + dy * dy);
          }
          if (nearest > bestDistance) {
            bestDistance = nearest;
            best = [x / width * 100, y / height * 100];
          }
        }
        if (best) positions.push(best);
      }
      const doodles = [
        '<rect x="10" y="10" width="44" height="44"/>',
        '<path d="M32 5 60 55H4Z"/>',
        '<circle cx="32" cy="32" r="25"/>'
      ];
      const shapeOrder = Array.from({ length: count }, (_, index) => index % doodles.length);
      for (let index = shapeOrder.length - 1; index > 0; index--) {
        const other = Math.floor(Math.random() * (index + 1));
        [shapeOrder[index], shapeOrder[other]] = [shapeOrder[other], shapeOrder[index]];
      }
      positions.forEach(([left, top], index) => {
        const block = document.createElement("i");
        const doodle = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        doodle.setAttribute("viewBox", "-7 -7 78 78");
        doodle.setAttribute("aria-hidden", "true");
        const drawing = doodles[shapeOrder[index]];
        doodle.innerHTML = '<g stroke="#fff8ed" stroke-width="10">' + drawing + '</g>' +
          '<g stroke="#171717" stroke-width="3">' + drawing + '</g>';
        block.appendChild(doodle);
        block.style.setProperty("--edge-left", left + "%");
        block.style.setProperty("--edge-top", top + "%");
        block.style.setProperty("--edge-turn", (Math.random() * 44 - 22) + "deg");
        block.style.setProperty("--edge-delay", (index * 25) + "ms");
        block.style.setProperty("--edge-color", accentColors[Math.floor(Math.random() * accentColors.length)]);
        edgeBlocks.append(block);
      });
    }

    for (let index = 0; index < 22; index += 1) {
      const box = document.createElement("i");
      const angle = Math.random() * Math.PI * 2;
      const distance = 130 + Math.random() * 300;
      const horizontal = Math.max(-window.innerWidth * 0.43, Math.min(window.innerWidth * 0.43, Math.cos(angle) * distance));
      const vertical = Math.max(-window.innerHeight * 0.42, Math.min(window.innerHeight * 0.42, Math.sin(angle) * distance));
      box.style.setProperty("--box-x", `${horizontal}px`);
      box.style.setProperty("--box-y", `${vertical}px`);
      box.style.setProperty("--box-turn", `${Math.round(Math.random() * 300 - 150)}deg`);
      box.style.setProperty("--box-size", `${10 + Math.round(Math.random() * 24)}px`);
      box.style.setProperty("--box-delay", `${Math.round(Math.random() * 170)}ms`);
      box.style.setProperty("--box-color", ["#ff653f", "#ffd84c", "#db43ba", "#42cdb8", "#7557dd"][index % 5]);
      tvBurst.append(box);
    }

    function unlockScrollArrow() {
      if (arrowTimerStarted) return;
      arrowTimerStarted = true;
      scrollArrow.dataset.unlocked = "true";
      scrollArrow.removeAttribute("aria-hidden");
      scrollArrow.removeAttribute("tabindex");
      updateActiveArrow();
    }

    function revealTelevision() {
      television.disabled = true;
      television.setAttribute("aria-label", "Television signal revealed Sketch2sim.");
      screenPrompt.textContent = "SIGNAL BREAKTHROUGH";
      tvCaption.textContent = "The signal is yours. Choose a mode below to start playing.";
      tvScene.classList.remove("tune-one", "tune-two");
      tvScene.classList.add("is-exploded");
      addEdgeBlocks();
    }

    if (alreadyExploded) {
      revealTelevision();
      unlockScrollArrow();
    }

    television.addEventListener("click", () => {
      if (tvScene.classList.contains("is-exploded")) return;
      tuningClicks += 1;
      screenPrompt.textContent = tuneMessages[tuningClicks - 1][0];
      tvCaption.textContent = tuneMessages[tuningClicks - 1][1];

      if (tuningClicks < 3) {
        const effectClass = tuningClicks === 1 ? "tune-one" : "tune-two";
        tvScene.classList.remove("tune-one", "tune-two");
        void tvScene.offsetWidth;
        tvScene.classList.add(effectClass);
        addPopShapes();
        television.setAttribute("aria-label", `Television tuned ${tuningClicks} times. Click ${3 - tuningClicks} more time${tuningClicks === 2 ? "" : "s"} to reveal Sketch2sim.`);
        window.setTimeout(() => tvScene.classList.remove(effectClass), 800);
        return;
      }

      sessionStorage.setItem(explodedSessionKey, "true");
      revealTelevision();
      unlockScrollArrow();
    });

  }

  // Blend the page background from the warm hero color into the lighter
  // mode-page color as the visitor scrolls through the first screen.
  const hero = document.querySelector(".landingScreen");
  const modeSection = document.querySelector(".modeSection");
  const aboutSection = document.querySelector(".aboutSection");
  let backgroundFramePending = false;

  function updateLandingBackground() {
    if (!hero) return;
    const scroll = window.scrollY;
    const modeStart = modeSection?.offsetTop ?? hero.offsetHeight;
    const aboutStart = aboutSection?.offsetTop ?? modeStart + modeSection.offsetHeight;
    const stops = [
      { y: 0, color: [255, 240, 215] },       // warm cream
      { y: modeStart, color: [255, 249, 237] }, // light cream
      { y: aboutStart, color: [255, 245, 226] } // warm cream
    ];
    let from = stops[0];
    let to = stops[1];
    if (scroll >= stops[1].y) {
      from = stops[1];
      to = stops[2];
    }
    const progress = Math.max(0, Math.min((scroll - from.y) / Math.max(1, to.y - from.y), 1));
    const color = `rgb(${from.color.map((value, index) =>
      Math.round(value + (to.color[index] - value) * progress)
    ).join(", ")})`;

    document.documentElement.style.setProperty("--landing-background", color);
    document.body.style.setProperty("--landing-background", color);
  }

  window.addEventListener("scroll", () => {
    if (backgroundFramePending) return;
    backgroundFramePending = true;
    window.requestAnimationFrame(() => {
      backgroundFramePending = false;
      updateLandingBackground();
    });
  }, { passive: true });
  window.addEventListener("resize", updateLandingBackground);
  updateLandingBackground();

  const canvas = document.getElementById("physicsPreview");
  if (!canvas || typeof window.createLandingPhysicsDemo !== "function") return;

  const context = canvas.getContext("2d");
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  let width = 0;
  let height = 0;
  let previousFrame = performance.now();
  const demo = window.createLandingPhysicsDemo(1, 1);
  let activePointer = null;
  let activeShape = null;
  let draggedShape = false;
  let dragStart = null;
  let dragOffset = null;

  function resizePreview() {
    const bounds = canvas.getBoundingClientRect();
    width = Math.max(1, bounds.width);
    height = Math.max(1, bounds.height);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    demo.resize(width, height);
  }

  function canvasPoint(event) {
    const bounds = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - bounds.left) * (width / bounds.width),
      y: (event.clientY - bounds.top) * (height / bounds.height)
    };
  }

  canvas.addEventListener("pointerdown", (event) => {
    const point = canvasPoint(event);
    const shape = demo.shapeAt(point.x, point.y);
    if (!shape) return;
    event.preventDefault();
    activePointer = event.pointerId;
    draggedShape = false;
    dragStart = point;
    canvas.setPointerCapture(event.pointerId);
    canvas.dataset.dragging = "true";
    activeShape = shape;
    dragOffset = { x: shape.body.position.x - point.x, y: shape.body.position.y - point.y };
    demo.setGrabbed(shape, true);
  });

  canvas.addEventListener("pointermove", (event) => {
    if (event.pointerId !== activePointer || !activeShape) return;
    const point = canvasPoint(event);
    if (Math.hypot(point.x - dragStart.x, point.y - dragStart.y) > 4) draggedShape = true;
    demo.moveShape(activeShape, point.x + dragOffset.x, point.y + dragOffset.y);
  });

  function finishPointer(event, shouldPop = false) {
    if (event.pointerId !== activePointer) return;
    if (activeShape) demo.setGrabbed(activeShape, false);
    if (shouldPop && !draggedShape && activeShape) demo.popShape(activeShape);
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    activePointer = null;
    activeShape = null;
    dragStart = null;
    dragOffset = null;
    delete canvas.dataset.dragging;
  }

  canvas.addEventListener("pointerup", (event) => finishPointer(event, true));
  canvas.addEventListener("pointercancel", (event) => finishPointer(event));

  let previewVisible = true;
  if ("IntersectionObserver" in window) {
    const previewObserver = new IntersectionObserver((entries) => {
      previewVisible = entries.some((entry) => entry.isIntersecting);
    }, { rootMargin: "80px" });
    previewObserver.observe(canvas);
  }
  let spawnTimer = 0;
  let lastPreviewRenderAt = -Infinity;
  function drawFrame(now) {
    if (document.hidden || !previewVisible || now - lastPreviewRenderAt < 1000 / 30 - 0.5) {
      if (document.hidden || !previewVisible) previousFrame = now;
      window.requestAnimationFrame(drawFrame);
      return;
    }
    lastPreviewRenderAt = now;
    const delta = Math.min(now - previousFrame, 80);
    previousFrame = now;
    spawnTimer += delta;
    if (spawnTimer >= 620) {
      spawnTimer %= 620;
      demo.spawn();
    }

    demo.update(delta);
    context.clearRect(0, 0, width, height);
    demo.draw(context);
    window.requestAnimationFrame(drawFrame);
  }

  resizePreview();
  demo.spawn();
  window.addEventListener("resize", resizePreview);
  if ("ResizeObserver" in window) new ResizeObserver(resizePreview).observe(canvas);
  window.requestAnimationFrame(drawFrame);
})();
