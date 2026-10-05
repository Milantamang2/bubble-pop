import { GardenAudio } from "./audio.js";
import { loadState, saveState, clearState } from "./save.js";

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const loading = $("#loading");
const app = $("#app");
const scene = $("#scene");
const ambientCanvas = $("#ambientCanvas");
const ctx2d = ambientCanvas.getContext("2d");
const objects = $("#objects");
const butterflies = $("#butterflies");
const fireflies = $("#fireflies");
const pond = $("#pond");
const message = $("#message");
const toolHint = $("#toolHint");
const stars = $("#stars");
const sun = $("#sun");
const moon = $("#moon");

const audio = new GardenAudio();

const defaults = {
  timeOfDay: 0.20,
  weather: "clear",
  tool: "none",
  particles: 55,
  audioEnabled: false,
  ambientVolume: 0.35,
  effectsVolume: 0.45,
  reducedMotion: false,
  highContrast: false,
  flowers: [],
  stones: [],
  plants: [],
  leaves: []
};

let state = structuredClone(defaults);
let pointer = { x: 0, y: 0, inside: false };
let particles = [];
let fireflyClock = 0;
let butterflyClock = 0;
let lastFrame = performance.now();
let lastSave = 0;
let initialHints = ["Welcome to your quiet garden.", "There is nothing you need to do.", "Move, click, and explore."];
let hintIndex = 0;

function mergeState(saved) {
  state = {
    ...defaults,
    ...(saved || {}),
    flowers: Array.isArray(saved?.flowers) ? saved.flowers : [],
    stones: Array.isArray(saved?.stones) ? saved.stones : [],
    plants: Array.isArray(saved?.plants) ? saved.plants : [],
    leaves: Array.isArray(saved?.leaves) ? saved.leaves : []
  };
}

function saveSoon(force = false) {
  const now = performance.now();
  if (force || now - lastSave > 500) {
    lastSave = now;
    saveState({
      timeOfDay: state.timeOfDay,
      weather: state.weather,
      particles: state.particles,
      audioEnabled: state.audioEnabled,
      ambientVolume: state.ambientVolume,
      effectsVolume: state.effectsVolume,
      reducedMotion: state.reducedMotion,
      highContrast: state.highContrast,
      flowers: state.flowers,
      stones: state.stones,
      plants: state.plants,
      leaves: state.leaves
    });
  }
}

function showMessage(text, duration = 2100) {
  message.textContent = text;
  message.classList.remove("hide");
  clearTimeout(showMessage.timer);
  showMessage.timer = setTimeout(() => message.classList.add("hide"), duration);
}

function showToolHint(text) {
  toolHint.textContent = text;
  toolHint.hidden = false;
  clearTimeout(showToolHint.timer);
  showToolHint.timer = setTimeout(() => toolHint.hidden = true, 4000);
}

function ripple(x, y) {
  const r = document.createElement("span");
  r.className = "ripple";
  const rect = scene.getBoundingClientRect();
  r.style.left = `${x - rect.left}px`;
  r.style.top = `${y - rect.top}px`;
  scene.appendChild(r);

  for (let i = 0; i < 6; i++) {
    const dot = document.createElement("span");
    dot.className = "splash-dot";
    dot.style.left = `${x - rect.left}px`;
    dot.style.top = `${y - rect.top}px`;
    dot.style.setProperty("--dx", `${(Math.random() * 34) - 17}px`);
    dot.style.setProperty("--dy", `${(Math.random() * 22) - 11}px`);
    scene.appendChild(dot);
    setTimeout(() => dot.remove(), 750);
  }
  setTimeout(() => r.remove(), 1000);
  audio.effect("water");
}

function randomPosition(type) {
  const pos = {
    x: 12 + Math.random() * 76,
    y: type === "stone" ? 64 + Math.random() * 27 : 54 + Math.random() * 34
  };
  return pos;
}

function addFlower(type, x, y, persist = true) {
  const flower = document.createElement("div");
  flower.className = `object flower ${type.replace("flower-", "")} sway`;
  flower.style.left = `${x}%`;
  flower.style.top = `${y}%`;
  flower.dataset.type = type;

  const color = {
    "flower-white": "#fffef4",
    "flower-pink": "#f4a7bd",
    "flower-purple": "#bba8ea",
    "flower-yellow": "#f3da76"
  }[type] || "#f4a7bd";

  flower.innerHTML = `
    <div class="flower-head">
      <i class="petal p1" style="background:${color}"></i>
      <i class="petal p2" style="background:${color}"></i>
      <i class="petal p3" style="background:${color}"></i>
      <i class="petal p4" style="background:${color}"></i>
      <i class="petal p5" style="background:${color}"></i>
      <i class="flower-center"></i>
    </div>
    <i class="stem"></i><i class="leaf leaf-a"></i><i class="leaf leaf-b"></i>
  `;

  flower.addEventListener("click", (e) => {
    if (state.tool !== "none") return;
    $(".flower-head", flower).classList.remove("bloom");
    void flower.offsetWidth;
    $(".flower-head", flower).classList.add("bloom");
    ripple(e.clientX, e.clientY);
    audio.effect("flower");
    showMessage("A little care. A little calm.");
  });

  objects.appendChild(flower);

  if (persist) {
    state.flowers.push({ type, x, y });
    saveSoon(true);
  }
}

function addStone(x, y, persist = true, small = false) {
  const stone = document.createElement("div");
  stone.className = `object stone ${small ? "small" : ""}`;
  stone.style.left = `${x}%`;
  stone.style.top = `${y}%`;
  stone.setAttribute("aria-label", "Draggable garden stone");
  stone.setAttribute("role", "img");

  bindDrag(stone, "stone");
  objects.appendChild(stone);

  if (persist) {
    state.stones.push({ x, y, small });
    saveSoon(true);
  }
}

function addPlant(x, y, persist = true) {
  const plant = document.createElement("div");
  plant.className = "object plant";
  plant.style.left = `${x}%`;
  plant.style.top = `${y}%`;
  plant.innerHTML = `
    <i class="plant-stem"></i>
    <i class="plant-leaf leaf-a"></i>
    <i class="plant-leaf leaf-b"></i>
    <i class="plant-leaf leaf-b" style="right:3px;top:36px;transform:rotate(164deg)"></i>
  `;
  bindDrag(plant, "plant");
  objects.appendChild(plant);

  if (persist) {
    state.plants.push({ x, y });
    saveSoon(true);
  }
}

function addLeaf(x, y, persist = true) {
  const leaf = document.createElement("div");
  leaf.className = "object leaf-object";
  leaf.style.left = `${x}%`;
  leaf.style.top = `${y}%`;
  leaf.textContent = "🍃";
  bindDrag(leaf, "leaf");
  objects.appendChild(leaf);

  if (persist) {
    state.leaves.push({ x, y });
    saveSoon(true);
  }
}

function bindDrag(el, kind) {
  let dragging = false;

  const move = (clientX, clientY) => {
    const rect = scene.getBoundingClientRect();
    const x = Math.max(2, Math.min(98, ((clientX - rect.left) / rect.width) * 100));
    const y = Math.max(43, Math.min(94, ((clientY - rect.top) / rect.height) * 100));
    el.style.left = `${x}%`;
    el.style.top = `${y}%`;
  };

  el.addEventListener("pointerdown", e => {
    if (state.tool !== "none") return;
    dragging = true;
    el.classList.add("dragging");
    el.setPointerCapture?.(e.pointerId);
  });

  el.addEventListener("pointermove", e => {
    if (!dragging) return;
    move(e.clientX, e.clientY);
  });

  el.addEventListener("pointerup", e => {
    if (!dragging) return;
    dragging = false;
    el.classList.remove("dragging");
    audio.effect("stone");
    persistObjectPositions();
    el.releasePointerCapture?.(e.pointerId);
  });
}

function persistObjectPositions() {
  state.stones = $$(".stone", objects).map(el => ({
    x: parseFloat(el.style.left),
    y: parseFloat(el.style.top),
    small: el.classList.contains("small")
  }));
  state.plants = $$(".plant", objects).map(el => ({
    x: parseFloat(el.style.left),
    y: parseFloat(el.style.top)
  }));
  state.leaves = $$(".leaf-object", objects).map(el => ({
    x: parseFloat(el.style.left),
    y: parseFloat(el.style.top)
  }));
  saveSoon(true);
}

function renderSavedObjects() {
  objects.innerHTML = "";
  state.flowers.forEach(f => addFlower(f.type, f.x, f.y, false));
  state.stones.forEach(s => addStone(s.x, s.y, false, s.small));
  state.plants.forEach(p => addPlant(p.x, p.y, false));
  state.leaves.forEach(l => addLeaf(l.x, l.y, false));
}

function placeCurrentTool(clientX, clientY) {
  if (state.tool === "none") return;

  const rect = scene.getBoundingClientRect();
  const x = Math.max(3, Math.min(97, ((clientX - rect.left) / rect.width) * 100));
  const y = Math.max(48, Math.min(92, ((clientY - rect.top) / rect.height) * 100));

  if (state.tool.startsWith("flower-")) {
    addFlower(state.tool, x, y, true);
    audio.effect("flower");
    showMessage("A flower grows here. 🌸");
  } else if (state.tool === "stone") {
    addStone(x, y, true, Math.random() > .6);
    audio.effect("stone");
    showMessage("A quiet stone finds its place. 🪨");
  } else if (state.tool === "plant") {
    addPlant(x, y, true);
    audio.effect("plant");
    showMessage("A little green life joins the garden. 🌿");
  } else if (state.tool === "leaf") {
    addLeaf(x, y, true);
    audio.effect("leaf");
    showMessage("A little leaf settles in. 🍃");
  }

  selectTool("none");
}

function selectTool(tool) {
  state.tool = tool;
  $$(".tool-choice").forEach(btn => btn.classList.toggle("active", btn.dataset.tool === tool));
  $("#toolsBtn").setAttribute("aria-expanded", tool !== "none" ? "true" : "false");
  if (tool === "none") {
    showToolHint("Explore freely. Click the pond or objects.");
  } else {
    const labels = {
      "flower-white":"Click a spot in the garden to plant it.",
      "flower-pink":"Click a spot in the garden to plant it.",
      "flower-purple":"Click a spot in the garden to plant it.",
      "flower-yellow":"Click a spot in the garden to plant it.",
      stone:"Click a spot, then drag your stone whenever you like.",
      plant:"Click a spot in the meadow to add a plant.",
      leaf:"Click a spot to let a leaf settle there."
    };
    showToolHint(labels[tool]);
  }
}

function cycleTime() {
  state.timeOfDay = (state.timeOfDay + 0.22) % 1;
  updateLighting();
  saveSoon(true);
}

function updateLighting() {
  const t = state.timeOfDay;

  // 0 = midnight, .25 = morning, .5 = noon, .75 = evening
  let brightness = 1;
  let top = "#b8e3ed";
  let bottom = "#e3f0df";

  if (t < 0.18) {
    brightness = 0.62;
    top = "#182a45"; bottom = "#405b72";
    sun.style.opacity = "0"; moon.style.opacity = "1"; stars.style.opacity = ".88";
  } else if (t < 0.30) {
    brightness = 0.80;
    top = "#6f9cb0"; bottom = "#d5d7bf";
    sun.style.opacity = ".42"; moon.style.opacity = ".48"; stars.style.opacity = ".3";
  } else if (t < 0.63) {
    brightness = 1;
    top = "#b8e3ed"; bottom = "#e3f0df";
    sun.style.opacity = "1"; moon.style.opacity = "0"; stars.style.opacity = "0";
  } else if (t < 0.80) {
    brightness = 0.96;
    top = "#f2c1a2"; bottom = "#efdbbc";
    sun.style.opacity = ".7"; moon.style.opacity = "0"; stars.style.opacity = "0";
  } else {
    brightness = 0.72;
    top = "#293c58"; bottom = "#526075";
    sun.style.opacity = "0"; moon.style.opacity = "1"; stars.style.opacity = ".9";
  }

  document.documentElement.style.setProperty("--dayBrightness", brightness);
  document.documentElement.style.setProperty("--skyTop", top);
  document.documentElement.style.setProperty("--skyBottom", bottom);
  $("#timeBtn").textContent = t > .8 || t < .2 ? "🌙" : t > .62 ? "🌅" : "☀️";
}

function makeStars() {
  stars.innerHTML = "";
  for (let i = 0; i < 42; i++) {
    const s = document.createElement("i");
    s.className = "star";
    s.style.left = `${Math.random() * 100}%`;
    s.style.top = `${Math.random() * 55}%`;
    s.style.opacity = String(0.35 + Math.random() * 0.65);
    stars.appendChild(s);
  }
}

function seedParticles() {
  particles = [];
  const count = Math.floor(40 + state.particles * .8);
  for (let i = 0; i < count; i++) {
    particles.push({
      x: Math.random() * innerWidth,
      y: Math.random() * innerHeight,
      size: Math.random() * 2.2 + .5,
      speed: Math.random() * 0.16 + .04,
      alpha: Math.random() * .42 + .08,
      phase: Math.random() * Math.PI * 2
    });
  }
}

function resizeCanvas() {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  ambientCanvas.width = innerWidth * dpr;
  ambientCanvas.height = innerHeight * dpr;
  ambientCanvas.style.width = innerWidth + "px";
  ambientCanvas.style.height = innerHeight + "px";
  ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
  seedParticles();
}

function drawParticles(now) {
  ctx2d.clearRect(0, 0, innerWidth, innerHeight);
  if (state.reducedMotion) return;

  for (const p of particles) {
    p.x += Math.sin(now * 0.0004 + p.phase) * 0.12;
    p.y -= p.speed;
    if (p.y < -10) {
      p.y = innerHeight + 8;
      p.x = Math.random() * innerWidth;
    }
    const twinkle = 0.65 + Math.sin(now * 0.001 + p.phase) * .25;
    ctx2d.fillStyle = `rgba(255,252,218,${p.alpha * twinkle})`;
    ctx2d.beginPath();
    ctx2d.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx2d.fill();
  }
}

function updateWeatherVisuals() {
  document.body.dataset.weather = state.weather;
  document.body.classList.toggle("reduce-motion", state.reducedMotion);
  document.body.classList.toggle("high-contrast", state.highContrast);
}

function spawnFirefly() {
  if (state.timeOfDay > .78 || state.timeOfDay < .18 || state.weather === "rain") {
    const f = document.createElement("button");
    f.className = "firefly";
    f.setAttribute("aria-label", "Touch a firefly");
    f.style.left = `${8 + Math.random() * 84}%`;
    f.style.top = `${38 + Math.random() * 40}%`;
    f.style.animationDuration = `${4.2 + Math.random() * 3}s`;
    f.addEventListener("click", () => {
      audio.effect("firefly");
      const rect = scene.getBoundingClientRect();
      const x = (parseFloat(f.style.left) / 100) * rect.width;
      const y = (parseFloat(f.style.top) / 100) * rect.height;
      ripple(rect.left + x, rect.top + y);
      f.remove();
      showMessage("A tiny light found you. ✨");
    }, { once: true });
    fireflies.appendChild(f);
    setTimeout(() => f.remove(), 9000);
  }
}

function spawnButterfly() {
  if (state.reducedMotion || state.weather === "rain") return;
  const f = $(".flower", objects);
  if (!f || Math.random() > .35) return;

  const b = document.createElement("div");
  b.className = "butterfly";
  b.textContent = Math.random() > .5 ? "🦋" : "🦋";
  b.style.left = f.style.left;
  b.style.top = f.style.top;
  butterflies.appendChild(b);
  setTimeout(() => b.remove(), 11100);
}

function handleAmbient(now, dt) {
  const daySpeed = parseFloat($("#daySpeed").value);
  state.timeOfDay = (state.timeOfDay + daySpeed * dt / 180) % 1;
  updateLighting();

  fireflyClock += dt;
  butterflyClock += dt;

  if (fireflyClock > (state.reducedMotion ? 8 : 4.5)) {
    fireflyClock = 0;
    spawnFirefly();
  }

  if (butterflyClock > 13) {
    butterflyClock = 0;
    spawnButterfly();
  }

  drawParticles(now);
}

function gardenClick(e) {
  if (e.target.closest(".toolbar") || e.target.closest(".settings-panel") || e.target.closest(".dialog-layer")) return;

  if (state.tool !== "none") {
    placeCurrentTool(e.clientX, e.clientY);
    return;
  }

  const target = e.target.closest(".flower,.stone,.plant,.leaf-object");
  if (target) {
    if (target.classList.contains("stone") || target.classList.contains("plant") || target.classList.contains("leaf-object")) return;
    return;
  }
}

pond.addEventListener("pointerdown", e => {
  ripple(e.clientX, e.clientY);
  showMessage("Ripples come and go. 🌊");
});

pond.addEventListener("keydown", e => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    const r = pond.getBoundingClientRect();
    ripple(r.left + r.width/2, r.top + r.height/2);
  }
});

scene.addEventListener("click", gardenClick);

scene.addEventListener("pointermove", e => {
  pointer.x = e.clientX; pointer.y = e.clientY; pointer.inside = true;
  if (state.weather === "breeze" && !state.reducedMotion) {
    const x = (e.clientX / innerWidth - .5) * 2;
    const y = (e.clientY / innerHeight - .5) * 2;
    document.querySelector(".meadow").style.transform = `translate(${x * 2}px,${y * 1}px)`;
  }
});

scene.addEventListener("pointerleave", () => pointer.inside = false);

$("#toolsBtn").addEventListener("click", () => {
  const menu = $("#toolsMenu");
  menu.hidden = !menu.hidden;
  $("#toolsBtn").setAttribute("aria-expanded", String(!menu.hidden));
});

$$(".tool-choice").forEach(btn => {
  btn.addEventListener("click", () => {
    selectTool(btn.dataset.tool);
    $("#toolsMenu").hidden = true;
    $("#toolsBtn").setAttribute("aria-expanded", "false");
  });
});

$("#timeBtn").addEventListener("click", cycleTime);

$("#soundBtn").addEventListener("click", async () => {
  state.audioEnabled = !state.audioEnabled;
  await audio.setEnabled(state.audioEnabled);
  audio.setVolumes(state.ambientVolume, state.effectsVolume);
  $("#soundBtn").setAttribute("aria-pressed", String(state.audioEnabled));
  $("#soundBtn").textContent = state.audioEnabled ? "🔊 Sound" : "🔈 Sound";
  saveSoon(true);
  showMessage(state.audioEnabled ? "Nature sounds are playing softly." : "The garden is quiet again.");
});

function openSettings() {
  $("#settingsPanel").hidden = false;
  $("#daySpeed").value = $("#daySpeed").dataset.current || "0.07";
  $("#weather").value = state.weather;
  $("#particleDensity").value = String(state.particles);
  $("#ambientVolume").value = String(Math.round(state.ambientVolume * 100));
  $("#effectsVolume").value = String(Math.round(state.effectsVolume * 100));
  $("#reducedMotion").checked = state.reducedMotion;
  $("#highContrast").checked = state.highContrast;
}

function closeSettings() {
  $("#settingsPanel").hidden = true;
}

$("#settingsBtn").addEventListener("click", openSettings);
$("#closeSettings").addEventListener("click", closeSettings);
$("#closeSettings2").addEventListener("click", closeSettings);

$("#daySpeed").addEventListener("change", e => {
  e.target.dataset.current = e.target.value;
  saveSoon(true);
});
$("#weather").addEventListener("change", e => {
  state.weather = e.target.value;
  updateWeatherVisuals();
  saveSoon(true);
  showMessage(state.weather === "rain" ? "A soft rain settles over the garden." : state.weather === "breeze" ? "A gentle breeze is moving through." : "The sky is clear again.");
});
$("#particleDensity").addEventListener("input", e => {
  state.particles = Number(e.target.value);
  seedParticles();
  saveSoon();
});
$("#ambientVolume").addEventListener("input", e => {
  state.ambientVolume = Number(e.target.value)/100;
  audio.setVolumes(state.ambientVolume, state.effectsVolume);
  saveSoon();
});
$("#effectsVolume").addEventListener("input", e => {
  state.effectsVolume = Number(e.target.value)/100;
  audio.setVolumes(state.ambientVolume, state.effectsVolume);
  saveSoon();
});
$("#reducedMotion").addEventListener("change", e => {
  state.reducedMotion = e.target.checked;
  updateWeatherVisuals();
  saveSoon(true);
  $("#accessibilityNote").hidden = !state.reducedMotion;
});
$("#highContrast").addEventListener("change", e => {
  state.highContrast = e.target.checked;
  updateWeatherVisuals();
  saveSoon(true);
});
$("#clearSaved").addEventListener("click", () => {
  clearState();
  location.reload();
});

$("#resetBtn").addEventListener("click", () => {
  $("#resetDialog").hidden = false;
});
$("#cancelReset").addEventListener("click", () => $("#resetDialog").hidden = true);
$("#confirmReset").addEventListener("click", () => {
  state = structuredClone(defaults);
  clearState();
  $("#resetDialog").hidden = true;
  renderSavedObjects();
  updateLighting();
  updateWeatherVisuals();
  selectTool("none");
  saveSoon(true);
  showMessage("A fresh garden, just for you. 🌱");
});

window.addEventListener("resize", resizeCanvas);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) saveSoon(true);
});

function loop(now) {
  const dt = Math.min((now - lastFrame) / 1000, .05);
  lastFrame = now;
  handleAmbient(now, dt);
  requestAnimationFrame(loop);
}

// Initialize.
const saved = loadState();
mergeState(saved);
$("#daySpeed").dataset.current = "0.07";
$("#weather").value = state.weather;
$("#particleDensity").value = String(state.particles);
$("#ambientVolume").value = String(Math.round(state.ambientVolume * 100));
$("#effectsVolume").value = String(Math.round(state.effectsVolume * 100));
$("#reducedMotion").checked = state.reducedMotion;
$("#highContrast").checked = state.highContrast;
$("#soundBtn").setAttribute("aria-pressed", String(state.audioEnabled));
$("#soundBtn").textContent = state.audioEnabled ? "🔊 Sound" : "🔈 Sound";

makeStars();
renderSavedObjects();
updateLighting();
updateWeatherVisuals();
resizeCanvas();

setTimeout(() => {
  loading.style.opacity = "0";
  loading.style.transition = "opacity .6s ease";
  setTimeout(() => {
    loading.remove();
    app.hidden = false;
    showMessage(initialHints[0], 2700);
    setTimeout(() => showMessage(initialHints[1], 2700), 3100);
    setTimeout(() => showMessage(initialHints[2], 2900), 6200);
  }, 600);
}, 700);

requestAnimationFrame(loop);
