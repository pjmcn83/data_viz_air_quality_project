// ── Tooltip global ───────────────────────────
const tooltip = d3.select("body")
  .append("div")
  .attr("id", "tooltip");

// ── Strip BOM from all string fields ─────────
function stripBOM(obj) {
  const clean = {};
  for (const key in obj) {
    const k = key.replace(/^\uFEFF/, "").trim();
    const v = obj[key];
    clean[k] = typeof v === "string" ? v.replace(/^\uFEFF/, "").trim() : v;
  }
  return clean;
}

let chartData = [];

function debounce(fn, delay) {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), delay);
  };
}

// ── Load data ─────────────────────────────────
fetch("../data/cities.json")
  .then(res => res.json())
  .then(raw => {
    chartData = raw.map(stripBOM);
    console.log(`✅ ${chartData.length} cities loaded`);
    buildLegend();
    buildChart(chartData);
    window.addEventListener("resize", debounce(() => buildChart(chartData), 120));
  })
  .catch(err => console.error("❌ Error:", err));


// ── Legend ────────────────────────────────────
function buildLegend() {
  const container = document.getElementById("chart-container");
  const legend    = document.createElement("div");
  legend.id       = "legend";
  legend.innerHTML = `
    <div class="legend-item">
      <div class="legend-dot"></div>
      <span>City</span>
    </div>
    <div class="legend-item">
      <div class="legend-dot highlighted"></div>
      <span>Top / Bottom 3</span>
    </div>
    <div class="legend-item">
      <div class="legend-iqr"></div>
      <span>Interquartile range</span>
    </div>
    <div class="legend-item">
      <div class="legend-mean"></div>
      <span>Regional median</span>
    </div>
  `;
  container.appendChild(legend);
}


// ── Main chart ────────────────────────────────
function buildChart(data) {
  const container = document.getElementById("chart-container");
  container.querySelectorAll(".axis-row, .region-row").forEach(el => el.remove());

  if (!data.length) return;

  const W       = Math.max(560, document.getElementById("app").clientWidth - 64);
  const marginL = 8;
  const marginR = 170;
  const innerW  = W - marginL - marginR;

  const values = data.map(d => +d.index);
  const extent = d3.extent(values);
  const domain = extent[0] === extent[1]
    ? [extent[0] - 0.05, extent[1] + 0.05]
    : extent;

  const xScale = d3.scaleLinear()
    .domain(domain)
    .range([0, innerW])
    .nice();

  const regions = d3.groups(data, d => d.region)
    .sort((a, b) => {
      const medA = d3.median(a[1], d => d.index);
      const medB = d3.median(b[1], d => d.index);
      return medB - medA;
    });

  buildXAxis(container, xScale, W, marginL, marginR, true);
  regions.forEach(([region, cities]) => {
    buildRegionRow(container, region, cities, xScale, W, marginL, marginR, innerW);
  });
  buildXAxis(container, xScale, W, marginL, marginR, false);
}


// ── X axis ────────────────────────────────────
function buildXAxis(container, xScale, W, marginL, marginR, isTop) {
  const H   = 28;
  const div = document.createElement("div");
  div.className = "axis-row";
  container.appendChild(div);

  const svg = d3.select(div)
    .append("svg")
    .attr("width",  W)
    .attr("height", H);

  const axis = isTop
    ? d3.axisTop(xScale).ticks(5).tickFormat(d3.format(".1f")).tickSize(4)
    : d3.axisBottom(xScale).ticks(5).tickFormat(d3.format(".1f")).tickSize(4);

  svg.append("g")
    .attr("transform", `translate(${marginL}, ${isTop ? H - 4 : 4})`)
    .call(axis)
    .call(g => g.select(".domain").attr("stroke", "#2a3f58"))
    .call(g => g.selectAll(".tick line").attr("stroke", "#2a3f58"))
    .call(g => g.selectAll(".tick text")
      .attr("fill",        "#5a7a96")
      .attr("font-size",   "10px")
      .attr("font-family", "'JetBrains Mono', monospace"));
}


// ── Region row ────────────────────────────────
function buildRegionRow(container, region, cities, xScale, W, marginL, marginR, innerW) {
  const H       = 150;
  const cy      = H / 2;
  const jitterH = 90;

  // Sort and identify top/bottom 3
  const sorted  = [...cities].sort((a, b) => b.index - a.index);
  const top3    = new Set(sorted.slice(0, 3).map(d => d.city));
  const bottom3 = new Set(sorted.slice(-3).map(d => d.city));

  // Compute boxplot statistics
  const values  = cities.map(d => d.index).sort(d3.ascending);
  const q1      = d3.quantile(values, 0.25);
  const median  = d3.quantile(values, 0.50);
  const q3      = d3.quantile(values, 0.75);
  const iqr     = q3 - q1;
  const whiskerLo = Math.max(d3.min(values), q1 - 1.5 * iqr);
  const whiskerHi = Math.min(d3.max(values), q3 + 1.5 * iqr);

  // Reproducible vertical jitter per city
  cities.forEach(d => {
    const seed = hashCode(d.city);
    const rand = ((seed * 9301 + 49297) % 233280) / 233280 * 2 - 1;
    d._jitter  = rand * (jitterH / 2);
  });

  // Row container
  const row = document.createElement("div");
  row.className = "region-row";
  row.innerHTML = `<div class="region-label">${region}</div>`;
  container.appendChild(row);

  const svg = d3.select(row)
    .append("svg")
    .attr("class",  "region-chart")
    .attr("width",  W)
    .attr("height", H);

  // Clip path
  const clipId = `clip-${region.replace(/[\s&]+/g, "-")}`;
  svg.append("defs")
    .append("clipPath").attr("id", clipId)
    .append("rect")
    .attr("x", 0).attr("y", 0)
    .attr("width", innerW).attr("height", H);

  const g        = svg.append("g").attr("transform", `translate(${marginL}, 0)`);
  const gClipped = g.append("g").attr("clip-path", `url(#${clipId})`);

  // ── Background ───────────────────────────────
  gClipped.append("rect")
    .attr("x", 0).attr("y", 0)
    .attr("width",  innerW)
    .attr("height", H)
    .attr("fill",   "#0d1622")
    .attr("rx",     6);

  // ── Grid lines ───────────────────────────────
  gClipped.selectAll(".grid-line")
    .data(xScale.ticks(6))
    .join("line")
    .attr("x1", d => xScale(d)).attr("x2", d => xScale(d))
    .attr("y1", 0).attr("y2", H)
    .attr("stroke",       "#1a2d3f")
    .attr("stroke-width", 1);

  // ── IQR box (The Economist style) ────────────
  const boxTop    = cy - jitterH / 2 - 8;
  const boxBottom = cy + jitterH / 2 + 8;
  const boxH      = boxBottom - boxTop;

  gClipped.append("rect")
    .attr("x",      xScale(q1))
    .attr("y",      boxTop)
    .attr("width",  xScale(q3) - xScale(q1))
    .attr("height", boxH)
    .attr("fill",   "rgba(56,189,248,0.13)")
    .attr("stroke", "rgba(56,189,248,0.25)")
    .attr("stroke-width", 1)
    .attr("rx",     3);

  // ── Whisker lines ─────────────────────────────
  gClipped.append("line")
    .attr("x1", xScale(whiskerLo)).attr("x2", xScale(q1))
    .attr("y1", cy).attr("y2", cy)
    .attr("stroke",           "rgba(56,189,248,0.3)")
    .attr("stroke-width",     1.5)
    .attr("stroke-dasharray", "3,3");

  gClipped.append("line")
    .attr("x1", xScale(q3)).attr("x2", xScale(whiskerHi))
    .attr("y1", cy).attr("y2", cy)
    .attr("stroke",           "rgba(56,189,248,0.3)")
    .attr("stroke-width",     1.5)
    .attr("stroke-dasharray", "3,3");

  // ── Normal dots ──────────────────────────────
  gClipped.selectAll(".dot-normal")
    .data(cities.filter(d => !top3.has(d.city) && !bottom3.has(d.city)))
    .join("circle")
    .attr("cx",      d => xScale(d.index))
    .attr("cy",      d => cy + d._jitter)
    .attr("r",       4)
    .attr("fill",    "#38bdf8")
    .attr("opacity", .32)
    .style("cursor", "pointer")
    .on("mouseover", (event, d) => showTooltip(event, d))
    .on("mousemove", event => moveTooltip(event))
    .on("mouseout",  () => hideTooltip());

  // ── Highlighted dots (top/bottom 3) ──────────
  gClipped.selectAll(".dot-highlight")
    .data(cities.filter(d => top3.has(d.city) || bottom3.has(d.city)))
    .join("circle")
    .attr("cx",           d => xScale(d.index))
    .attr("cy",           d => cy + d._jitter)
    .attr("r",            6)
    .attr("fill",         "#ffffff")
    .attr("stroke",       d => top3.has(d.city) ? "#38bdf8" : "#f87171")
    .attr("stroke-width", 2)
    .style("cursor",      "pointer")
    .on("mouseover", (event, d) => showTooltip(event, d))
    .on("mousemove", event => moveTooltip(event))
    .on("mouseout",  () => hideTooltip());

  // ── Median line ───────────────────────────────
  gClipped.append("line")
    .attr("x1", xScale(median)).attr("x2", xScale(median))
    .attr("y1", boxTop).attr("y2", boxBottom)
    .attr("stroke",       "#f87171")
    .attr("stroke-width", 2);

  // ── City labels (top/bottom 3) ────────────────
  const toLabel   = [...sorted.slice(0, 3), ...sorted.slice(-3)];
  const obstacles = cities.map(d => ({
    x: xScale(d.index),
    y: cy + d._jitter,
    r: top3.has(d.city) || bottom3.has(d.city) ? 6 : 4
  }));
  const placedLabels = [];

  const candidates = [
    { dx:  14, dy:   0,  anchor: "start"  },
    { dx: -14, dy:   0,  anchor: "end"    },
    { dx:   0, dy: -18,  anchor: "middle" },
    { dx:   0, dy:  18,  anchor: "middle" },
    { dx:  14, dy: -14,  anchor: "start"  },
    { dx: -14, dy: -14,  anchor: "end"    },
    { dx:  14, dy:  14,  anchor: "start"  },
    { dx: -14, dy:  14,  anchor: "end"    },
  ];

  const fontSize = 10.5;
  const labelW   = 80;
  const labelH   = fontSize;

  function overlapsObstacle(lx, ly) {
    for (const o of obstacles) {
      const dx = lx - o.x, dy = ly - o.y;
      if (Math.sqrt(dx*dx + dy*dy) < o.r + 10) return true;
    }
    for (const p of placedLabels) {
      if (Math.abs(lx - p.lx) < labelW && Math.abs(ly - p.ly) < labelH + 4) return true;
    }
    return false;
  }

  toLabel.forEach(d => {
    const px = xScale(d.index);
    const py = cy + d._jitter;

    let chosen = candidates[0];
    for (const c of candidates) {
      if (!overlapsObstacle(px + c.dx, py + c.dy)) { chosen = c; break; }
    }

    const lx = px + chosen.dx;
    const ly = py + chosen.dy;
    placedLabels.push({ lx, ly });

    // Connector line
    g.append("line")
      .attr("x1", px).attr("y1", py)
      .attr("x2", lx).attr("y2", ly - fontSize / 2)
      .attr("stroke",       "#334d66")
      .attr("stroke-width", 1);

    // Label
    g.append("text")
      .attr("x",                 lx)
      .attr("y",                 ly)
      .attr("text-anchor",       chosen.anchor)
      .attr("dominant-baseline", "text-bottom")
      .attr("fill",              "#c8dae8")
      .attr("font-size",         `${fontSize}px`)
      .attr("font-weight",       "600")
      .attr("font-family",       "'Syne', sans-serif")
      .text(d.city);
  });

}


// ── Tooltip ───────────────────────────────────
function showTooltip(event, d) {
  tooltip.style("opacity", 1).html(`
    <div class="tt-city">${d.city}</div>
    <div class="tt-country">${d.country} · ${d.region}</div>
    <div class="tt-score">Index: ${d.index.toFixed(3)}</div>
  `);
}

function moveTooltip(event) {
  tooltip
    .style("left", (event.clientX + 14) + "px")
    .style("top",  (event.clientY - 36) + "px");
}

function hideTooltip() {
  tooltip.style("opacity", 0);
}


// ── Reproducible hash for jitter ─────────────
function hashCode(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash);
}