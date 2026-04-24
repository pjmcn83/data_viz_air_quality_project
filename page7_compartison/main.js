let DATA = [];

// ── 1. Load & clean JSON data ────────────────
fetch("../data/cities.json")
  .then(res => res.json())
  .then(data => {
    DATA = data.map(stripBOM);
    console.log(`✅ ${DATA.length} cities loaded`);
    initSelectors(1);
    initSelectors(2);
    showEmpty(1);
    showEmpty(2);
  })
  .catch(err => console.error("❌ Error loading data:", err));


// ── 2. Strip BOM from all string fields ───────
function stripBOM(obj) {
  const clean = {};
  for (const key in obj) {
    const k = key.replace(/^\uFEFF/, "").trim();
    const v = obj[key];
    clean[k] = typeof v === "string" ? v.replace(/^\uFEFF/, "").trim() : v;
  }
  return clean;
}


// ── 3. Populate selectors ────────────────────
function initSelectors(p) {
  const regions = [...new Set(DATA.map(d => d.region))].sort();
  populateSelect(`region-${p}`, regions, "All regions");
  populateSelect(`country-${p}`, [...new Set(DATA.map(d => d.country))].sort(), "All countries");
  populateSelect(`city-${p}`, [], "Select a city...");

  document.getElementById(`region-${p}`).addEventListener("change",  () => onRegionChange(p));
  document.getElementById(`country-${p}`).addEventListener("change", () => onCountryChange(p));
  document.getElementById(`city-${p}`).addEventListener("change",    () => onCityChange(p));
}


// ── 4. Helper: fill a <select> ────────────────
function populateSelect(id, options, placeholder) {
  const el = document.getElementById(id);
  el.innerHTML = `<option value="">${placeholder}</option>` +
    options.map(o => `<option value="${o}">${o}</option>`).join("");
}


// ── 5. Cascade selectors ─────────────────────
function onRegionChange(p) {
  const region   = document.getElementById(`region-${p}`).value;
  const filtered = region ? DATA.filter(d => d.region === region) : DATA;
  populateSelect(`country-${p}`, [...new Set(filtered.map(d => d.country))].sort(), "All countries");
  populateSelect(`city-${p}`, [], "Select a city...");
  updateBadge(p, null);
  showEmpty(p);
}

function onCountryChange(p) {
  const region  = document.getElementById(`region-${p}`).value;
  const country = document.getElementById(`country-${p}`).value;
  let filtered  = DATA;
  if (region)  filtered = filtered.filter(d => d.region  === region);
  if (country) filtered = filtered.filter(d => d.country === country);
  populateSelect(`city-${p}`, [...new Set(filtered.map(d => d.city))].sort(), "Select a city...");
  updateBadge(p, null);
  showEmpty(p);
}

function onCityChange(p) {
  const cityName = document.getElementById(`city-${p}`).value;
  const city     = DATA.find(d => d.city === cityName) || null;
  updateBadge(p, city);
  if (city) drawRadar(p, city);
  else showEmpty(p);
}


// ── 6. Empty state ────────────────────────────
function showEmpty(p) {
  const container = document.getElementById(`chart-${p}`);
  container.innerHTML = `
    <div class="chart-empty">
      <div class="chart-empty-icon">⬡</div>
      <div class="chart-empty-text">Select a city to display</div>
    </div>`;
}


// ── 7. Radar axes ─────────────────────────────
// All values normalized [0,1] — higher = more vulnerable
const AXES = [
  { key: "hdi_norm",              label: "HDI",         good: "↓" },
  { key: "greenness_norm",        label: "Greenness",   good: "↓" },
  { key: "sensors_norm",          label: "Sensors",     good: "↓" },
  { key: "density_norm",          label: "Density",     good: "↑" },
  { key: "death_pm2_norm",        label: "PM2.5 Mort.", good: "↑" },
  { key: "land_consumption_norm", label: "Land Use",    good: "↑" },
];

const COLOR = {
  1: { stroke: "#38bdf8", fill: "rgba(56,189,248,0.10)" },
  2: { stroke: "#f472b6", fill: "rgba(244,114,182,0.10)" },
};


// ── 8. Draw radar ─────────────────────────────
function drawRadar(p, city) {
  const container = document.getElementById(`chart-${p}`);
  container.innerHTML = "";

  const W      = container.clientWidth  || 400;
  const H      = container.clientHeight || 400;
  const size   = Math.min(W, H, 440);
  const margin = 88;           // increased to prevent label clipping
  const R      = (size / 2) - margin;
  const cx     = size / 2;
  const cy     = size / 2;
  const n      = AXES.length;
  const levels = 5;
  const angle  = (2 * Math.PI) / n;
  const c      = COLOR[p];

  const svg = d3.select(container)
    .append("svg")
    .attr("width",   size)
    .attr("height",  size)
    .attr("viewBox", `0 0 ${size} ${size}`)
    .style("overflow", "visible");

  // ── 8a. Radial gradient fill ─────────────────
  const defs = svg.append("defs");
  const gradId = `radar-grad-${p}`;
  const grad = defs.append("radialGradient")
    .attr("id", gradId)
    .attr("cx", "50%").attr("cy", "50%").attr("r", "50%");
  grad.append("stop").attr("offset", "0%")
    .attr("stop-color", c.stroke).attr("stop-opacity", 0.06);
  grad.append("stop").attr("offset", "100%")
    .attr("stop-color", c.stroke).attr("stop-opacity", 0);

  svg.append("circle")
    .attr("cx", cx).attr("cy", cy).attr("r", R)
    .attr("fill", `url(#${gradId})`);

  // ── 8b. Reference rings ──────────────────────
  for (let lv = 1; lv <= levels; lv++) {
    const r = (R / levels) * lv;
    const pts = AXES.map((_, i) => {
      const a = angle * i - Math.PI / 2;
      return `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`;
    }).join(" ");

    svg.append("polygon")
      .attr("points",       pts)
      .attr("fill",         lv % 2 === 0 ? "rgba(26,45,69,0.4)" : "none")
      .attr("stroke",       "#1a2d45")
      .attr("stroke-width", 1);

    // Level label on top axis only
    svg.append("text")
      .attr("x",         cx + 4)
      .attr("y",         cy - r + 3)
      .attr("fill",      "#2d4a66")
      .attr("font-size", "8px")
      .attr("font-family", "'JetBrains Mono', monospace")
      .text((lv / levels).toFixed(1));
  }

  // ── 8c. Axis lines + labels ──────────────────
  AXES.forEach((axis, i) => {
    const a  = angle * i - Math.PI / 2;
    const x2 = cx + R * Math.cos(a);
    const y2 = cy + R * Math.sin(a);

    svg.append("line")
      .attr("x1", cx).attr("y1", cy)
      .attr("x2", x2).attr("y2", y2)
      .attr("stroke",       "#1a2d45")
      .attr("stroke-width", 1.5);

    const labelR = R + 34;
    const lx     = cx + labelR * Math.cos(a);
    const ly     = cy + labelR * Math.sin(a);
    const anchor = Math.cos(a) > 0.15 ? "start" : Math.cos(a) < -0.15 ? "end" : "middle";

    svg.append("text")
      .attr("x",           lx)
      .attr("y",           ly - 5)
      .attr("text-anchor", anchor)
      .attr("fill",        "#8aa5c0")
      .attr("font-size",   "10.5px")
      .attr("font-weight", "700")
      .attr("font-family", "'Syne', sans-serif")
      .attr("letter-spacing", "0.03em")
      .text(axis.label);

    const isWorse = axis.good === "↑";
    svg.append("text")
      .attr("x",           lx)
      .attr("y",           ly + 9)
      .attr("text-anchor", anchor)
      .attr("fill",        isWorse ? "#f87171" : "#4ade80")
      .attr("font-size",   "8.5px")
      .attr("font-family", "'JetBrains Mono', monospace")
      .text(isWorse ? "↑ worse" : "↓ worse");
  });

  // ── 8d. City polygon ─────────────────────────
  const values = AXES.map(axis => {
    const v = city[axis.key];
    return isNaN(v) ? 0 : Math.max(0, Math.min(1, v));
  });

  const polyPoints = values.map((v, i) => {
    const a = angle * i - Math.PI / 2;
    return `${cx + v * R * Math.cos(a)},${cy + v * R * Math.sin(a)}`;
  }).join(" ");

  svg.append("polygon")
    .attr("points",          polyPoints)
    .attr("fill",            c.fill)
    .attr("stroke",          c.stroke)
    .attr("stroke-width",    2)
    .attr("stroke-linejoin", "round")
    .attr("opacity",         0)
    .transition().duration(600).ease(d3.easeCubicOut)
    .attr("opacity",         1);

  // ── 8e. Vertex dots + tooltips ───────────────
  values.forEach((v, i) => {
    const a  = angle * i - Math.PI / 2;
    const vx = cx + v * R * Math.cos(a);
    const vy = cy + v * R * Math.sin(a);

    const dot = svg.append("circle")
      .attr("cx", vx).attr("cy", vy)
      .attr("r",            5)
      .attr("fill",         c.stroke)
      .attr("stroke",       "#060a12")
      .attr("stroke-width", 2)
      .attr("opacity",      0)
      .style("cursor",      "pointer");

    dot.transition().delay(500).duration(200).attr("opacity", 1);

    // Tooltip
    const tipW  = 92, tipH = 34;
    const tipX  = vx + (Math.cos(a) >= 0 ? 10 : -tipW - 10);
    const tipY  = vy - tipH / 2;
    const tip   = svg.append("g").attr("opacity", 0).attr("pointer-events", "none");

    tip.append("rect")
      .attr("x", tipX).attr("y", tipY)
      .attr("width", tipW).attr("height", tipH).attr("rx", 5)
      .attr("fill", "#0d1420")
      .attr("stroke", c.stroke).attr("stroke-width", 1);

    tip.append("text")
      .attr("x", tipX + tipW / 2).attr("y", tipY + 12)
      .attr("text-anchor", "middle")
      .attr("fill", "#6b84a0").attr("font-size", "8px")
      .attr("font-family", "'JetBrains Mono', monospace")
      .text(AXES[i].label);

    tip.append("text")
      .attr("x", tipX + tipW / 2).attr("y", tipY + 26)
      .attr("text-anchor", "middle")
      .attr("fill", c.stroke)
      .attr("font-size", "11px").attr("font-weight", "700")
      .attr("font-family", "'JetBrains Mono', monospace")
      .text(v.toFixed(3));

    dot.on("mouseover", () => {
      dot.attr("r", 7);
      tip.transition().duration(120).attr("opacity", 1);
    }).on("mouseout", () => {
      dot.attr("r", 5);
      tip.transition().duration(120).attr("opacity", 0);
    });
  });
}


// ── 9. Update badge ───────────────────────────
function updateBadge(p, city) {
  document.getElementById(`badge-city-${p}`).textContent = city ? city.city : "—";
  document.getElementById(`badge-meta-${p}`).textContent = city
    ? `${city.country} · ${city.region}` : "Select a city";

  const scoreEl = document.getElementById(`badge-score-${p}`);
  const badge   = document.getElementById(`badge-${p}`);

  if (city && typeof city.index === "number") {
    scoreEl.textContent = city.index.toFixed(3);

    // Progress bar
    let bar = badge.querySelector(".badge-bar");
    if (!bar) {
      bar = document.createElement("div");
      bar.className = "badge-bar";
      const fill = document.createElement("div");
      fill.className = "badge-bar-fill";
      bar.appendChild(fill);
      badge.querySelector(".badge-right").appendChild(bar);
    }
    // Animate fill width
    requestAnimationFrame(() => {
      const fill = bar.querySelector(".badge-bar-fill");
      fill.style.width = "0%";
      requestAnimationFrame(() => {
        fill.style.width = `${(city.index * 100).toFixed(1)}%`;
      });
    });
  } else {
    scoreEl.textContent = "—";
    const bar = badge.querySelector(".badge-bar");
    if (bar) bar.querySelector(".badge-bar-fill").style.width = "0%";
  }
}