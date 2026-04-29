// ── Tooltip ───────────────────────────────────
const tooltip = d3.select("body")
  .append("div")
  .attr("id", "tooltip");

// ── Strip BOM from all string fields ─────────
function stripBOM(obj) {
  const clean = {};
  for (const key in obj) {
    const k = key.replace(/^﻿/, "").trim();
    const v = obj[key];
    clean[k] = typeof v === "string" ? v.replace(/^﻿/, "").trim() : v;
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
    buildChart(chartData);
    window.addEventListener("resize", debounce(() => buildChart(chartData), 120));
  })
  .catch(err => console.error("❌ Error:", err));


// ── Helper function to identify Global North regions ────────
function isGlobalNorth(region) {
  const northernRegions = ["Europe", "Australia and New Zealand", "Northern America"];
  return northernRegions.includes(region);
}

// ── Legend ────────────────────────────────────
function buildLegend() {
  document.getElementById("legend").innerHTML = `
    <div class="legend-item">
      <div class="legend-dot"></div>
      <span>City</span>
    </div>
    <div class="legend-item">
      <div class="legend-dot highlighted top"></div>
      <span>Top 3 per region</span>
    </div>
    <div class="legend-item">
      <div class="legend-dot highlighted bottom"></div>
      <span>Bottom 3 per region</span>
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
}


// ── Main chart ────────────────────────────────
function buildChart(data) {
  const container = document.getElementById("chart-container");
  container.innerHTML = "";
  if (!data.length) return;

  const W = Math.max(container.clientWidth || 900, 600);
  const H = Math.max(container.clientHeight || 500, 380);

  const margin = {
    top: Math.max(18, H * 0.04),
    right: Math.max(8, W * 0.01),
    bottom: Math.max(55, H * 0.11),
    left: Math.max(40, W * 0.04)
  };
  const innerW = W - margin.left - margin.right;
  const innerH = H - margin.top - margin.bottom;

  // ── Scales ────────────────────────────────────
  const regions = d3.groups(data, d => d.region)
    .sort((a, b) => d3.median(b[1], d => +d.index) - d3.median(a[1], d => +d.index));

  const allValues = data.map(d => +d.index);
  const ext = d3.extent(allValues);
  const domain = ext[0] === ext[1] ? [ext[0] - 0.05, ext[1] + 0.05] : ext;

  const xScale = d3.scaleBand()
    .domain(regions.map(([r]) => r))
    .range([0, innerW])
    .padding(0.42);

  const yScale = d3.scaleLinear()
    .domain(domain).nice()
    .range([innerH, 0]);

  // ── SVG ───────────────────────────────────────
  const svg = d3.select(container)
    .append("svg")
    .attr("width", W)
    .attr("height", H)
    .style("overflow", "visible");

  const g = svg.append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  // Background panel
  g.append("rect")
    .attr("width", innerW)
    .attr("height", innerH)
    .attr("fill", "#07090f")
    .attr("rx", 6);

  // ── Horizontal grid lines ─────────────────────
  g.selectAll(".hgrid")
    .data(yScale.ticks(5))
    .join("line")
    .attr("class", "hgrid")
    .attr("x1", 0).attr("x2", innerW)
    .attr("y1", d => yScale(d)).attr("y2", d => yScale(d))
    .attr("stroke", "rgba(255,255,255,0.06)")
    .attr("stroke-width", 1);

  // ── Y axis ────────────────────────────────────
  g.append("g")
    .call(d3.axisLeft(yScale).ticks(5).tickFormat(d3.format(".1f")).tickSize(4))
    .call(ax => ax.select(".domain").attr("stroke", "rgba(255,255,255,0.1)"))
    .call(ax => ax.selectAll(".tick line").attr("stroke", "rgba(255,255,255,0.1)"))
    .call(ax => ax.selectAll(".tick text")
      .attr("fill", "#ffffff")
      .attr("font-size", "10px")
      .attr("font-family", "'Manrope', sans-serif"));

  // ── Manual dot position overrides ────────────
  // Values are fractions of jitterW: negative = left, positive = right
  const dotJitterOverrides = {
    "Colombo": -0.65,
    "Touba": -0.45,
  };

  // ── Precompute all region data ────────────────
  // Done up-front so we can build a global dot obstacle list before
  // placing any labels, giving the collision check full awareness of
  // every dot across every region at once.
  const regionData = regions.map(([region, cities]) => {
    const bw = xScale.bandwidth();
    const cx = xScale(region) + bw / 2;
    const boxW = Math.min(bw * 0.55, 52);
    const jitterW = bw * 0.30;

    const sorted = [...cities].sort((a, b) => +b.index - +a.index);
    const top3 = new Set(sorted.slice(0, 3).map(d => d.city));
    const bottom3 = new Set(sorted.slice(-3).map(d => d.city));
    const seen = new Set();
    const toLabel = [...sorted.slice(0, 3), ...sorted.slice(-3)].filter(d => {
      if (seen.has(d.city)) return false;
      seen.add(d.city);
      return true;
    });

    const vals = cities.map(d => +d.index).sort(d3.ascending);
    const q1 = d3.quantile(vals, 0.25);
    const median = d3.quantile(vals, 0.50);
    const q3 = d3.quantile(vals, 0.75);
    const iqr = q3 - q1;
    const whiskerLo = Math.max(d3.min(vals), q1 - 1.5 * iqr);
    const whiskerHi = Math.min(d3.max(vals), q3 + 1.5 * iqr);

    cities.forEach(d => {
      d._status = top3.has(d.city) ? "top" : bottom3.has(d.city) ? "bottom" : "normal";
      if (d.city in dotJitterOverrides) {
        d._jitter = dotJitterOverrides[d.city] * jitterW;
      } else {
        const seed = hashCode(d.city);
        const rand = ((seed * 9301 + 49297) % 233280) / 233280 * 2 - 1;
        d._jitter = rand * jitterW;
      }
    });

    return {
      region, cities, cx, boxW, top3, bottom3, toLabel,
      q1, median, q3, whiskerLo, whiskerHi
    };
  });

  // Global dot list — checked during label placement for every region
  const allDots = [];
  regionData.forEach(({ cities, cx, top3, bottom3 }) => {
    cities.forEach(d => {
      allDots.push({
        x: cx + d._jitter,
        y: yScale(+d.index),
        r: (top3.has(d.city) || bottom3.has(d.city)) ? 5 : 3
      });
    });
  });

  // ── Draw boxplots and dots ────────────────────
  regionData.forEach(({ region, cities, cx, boxW, top3, bottom3,
    q1, median, q3, whiskerLo, whiskerHi }) => {
    const isNorth = isGlobalNorth(region);

    // Define colors based on region
    const whiskerColor = isNorth ? "rgba(41,128,235,0.3)" : "rgba(235,148,41,0.3)";
    const boxFillColor = isNorth ? "rgba(41,128,235,0.12)" : "rgba(235,148,41,0.12)";
    const boxStrokeColor = isNorth ? "rgba(41,128,235,0.25)" : "rgba(235,148,41,0.25)";
    const medianColor = isNorth ? "#2980eb" : "#eb9429";
    const dotColor = isNorth ? "#2980eb" : "#eb9429";

    // Column background panel
    g.append("rect")
      .attr("x", xScale(region))
      .attr("y", 0)
      .attr("width", xScale.bandwidth())
      .attr("height", innerH)
      .attr("fill", "rgba(255,255,255,0.05)")
      .attr("rx", 5);

    // Upper whisker (q3 → whiskerHi)
    g.append("line")
      .attr("x1", cx).attr("x2", cx)
      .attr("y1", yScale(q3)).attr("y2", yScale(whiskerHi))
      .attr("stroke", whiskerColor)
      .attr("stroke-width", 1.5)
      .attr("stroke-dasharray", "3,3");

    // Lower whisker (q1 → whiskerLo)
    g.append("line")
      .attr("x1", cx).attr("x2", cx)
      .attr("y1", yScale(q1)).attr("y2", yScale(whiskerLo))
      .attr("stroke", whiskerColor)
      .attr("stroke-width", 1.5)
      .attr("stroke-dasharray", "3,3");

    // IQR box
    g.append("rect")
      .attr("x", cx - boxW / 2)
      .attr("y", yScale(q3))
      .attr("width", boxW)
      .attr("height", Math.max(1, yScale(q1) - yScale(q3)))
      .attr("fill", boxFillColor)
      .attr("stroke", boxStrokeColor)
      .attr("stroke-width", 1)
      .attr("rx", 3);

    // Median line (horizontal across box)
    g.append("line")
      .attr("x1", cx - boxW / 2).attr("x2", cx + boxW / 2)
      .attr("y1", yScale(median)).attr("y2", yScale(median))
      .attr("stroke", medianColor)
      .attr("stroke-width", 2);

    // Normal dots
    g.selectAll(null)
      .data(cities.filter(d => !top3.has(d.city) && !bottom3.has(d.city)))
      .join("circle")
      .attr("cx", d => cx + d._jitter)
      .attr("cy", d => yScale(+d.index))
      .attr("r", 3)
      .attr("fill", dotColor)
      .attr("opacity", 0.32)
      .style("cursor", "pointer")
      .on("mouseover", (event, d) => showTooltip(event, d))
      .on("mousemove", event => moveTooltip(event))
      .on("mouseout", () => hideTooltip());

    // Highlighted dots (top / bottom 3)
    g.selectAll(null)
      .data(cities.filter(d => top3.has(d.city) || bottom3.has(d.city)))
      .join("circle")
      .attr("cx", d => cx + d._jitter)
      .attr("cy", d => yScale(+d.index))
      .attr("r", 5)
      .attr("fill", "#ffffff")
      .attr("stroke", d => top3.has(d.city) ? "#f87171" : "#22c55e")
      .attr("stroke-width", 2)
      .style("cursor", "pointer")
      .on("mouseover", (event, d) => showTooltip(event, d))
      .on("mousemove", event => moveTooltip(event))
      .on("mouseout", () => hideTooltip());
  });

  // ── City labels (top / bottom 3 per region) ───
  // Horizontal-first candidates: labels sit to the side of dots,
  // which suits a vertical strip chart better than above/below.
  const fontSize = 10.5;
  const estLabelW = 78;
  const estLabelH = fontSize;
  const placedLabels = [];

  const candidates = [
    { dx: 16, dy: 0, anchor: "start" },
    { dx: -16, dy: 0, anchor: "end" },
    { dx: 16, dy: -13, anchor: "start" },
    { dx: -16, dy: -13, anchor: "end" },
    { dx: 16, dy: 13, anchor: "start" },
    { dx: -16, dy: 13, anchor: "end" },
    { dx: 0, dy: -18, anchor: "middle" },
    { dx: 0, dy: 18, anchor: "middle" },
  ];

  function overlapsAny(lx, ly) {
    if (ly < 3 || ly > innerH - 3) return true;
    for (const o of allDots) {
      if ((lx - o.x) ** 2 + (ly - o.y) ** 2 < (o.r + 8) ** 2) return true;
    }
    for (const p of placedLabels) {
      if (Math.abs(lx - p.lx) < estLabelW && Math.abs(ly - p.ly) < estLabelH + 3) return true;
    }
    return false;
  }

  const labelOverrides = {
    "Colombo": { dx: -16, dy: 0, anchor: "end" },
    "Hamburg": { dx: 6, dy: 18, anchor: "start" },
    "Havana": { dx: 0, dy: 18, anchor: "end" },
    "Hyderabad (Pak)": { dx: 0, dy: -18, anchor: "middle" },
    "Karachi": { dx: -16, dy: 0, anchor: "end" },
    "Kyiv": { dx: -16, dy: 0, anchor: "end" },
    "Mogadishu": { dx: -8, dy: -16, anchor: "end" },
    "Port-au-Prince": { dx: -15, dy: -15, anchor: "start" },
    "Sydney": { dx: -16, dy: 0, anchor: "end" },
    "Touba": { dx: 0, dy: -18, anchor: "middle" },
  };

  regionData.forEach(({ toLabel, cx }) => {
    toLabel.forEach(d => {
      const px = cx + d._jitter;
      const py = yScale(+d.index);

      let chosen = labelOverrides[d.city];
      if (!chosen) {
        chosen = candidates[0];
        for (const c of candidates) {
          if (!overlapsAny(px + c.dx, py + c.dy)) { chosen = c; break; }
        }
      }

      const lx = px + chosen.dx;
      const ly = py + chosen.dy;
      placedLabels.push({ lx, ly });

      g.append("line")
        .attr("x1", px).attr("y1", py)
        .attr("x2", lx).attr("y2", ly - fontSize / 2)
        .attr("stroke", "rgba(255,255,255,0.18)")
        .attr("stroke-width", 1);

      g.append("text")
        .attr("x", lx)
        .attr("y", ly)
        .attr("text-anchor", chosen.anchor)
        .attr("dominant-baseline", "text-bottom")
        .attr("fill", "#ffffff")
        .attr("font-size", `${fontSize}px`)
        .attr("font-weight", "600")
        .attr("font-family", "'Manrope', sans-serif")
        .text(d.city);
    });
  });

  // ── North-South Divide line ───────────────────
  // Find positions of "Latin America and the Caribbean" and "Europe"
  const lacrIndex = regions.findIndex(([r]) => r === "Latin America and the Caribbean");
  const europeIndex = regions.findIndex(([r]) => r === "Europe");

  if (lacrIndex !== -1 && europeIndex !== -1 && europeIndex > lacrIndex) {
    const lacrRegion = regions[lacrIndex][0];
    const europeRegion = regions[europeIndex][0];

    // Position of the dividing line (between the two regions)
    const lacrEnd = xScale(lacrRegion) + xScale.bandwidth();
    const europeStart = xScale(europeRegion);
    const divideX = (lacrEnd + europeStart) / 2;

    // Draw vertical dashed line
    g.append("line")
      .attr("x1", divideX)
      .attr("x2", divideX)
      .attr("y1", 0)
      .attr("y2", innerH)
      .attr("stroke", "#eb9429")
      .attr("stroke-width", 2)
      .attr("stroke-dasharray", "5,5")
      .attr("opacity", 0.5);

    // Add legend text "North - South Divide" (vertical orientation)
    const divideText = g.append("text")
      .attr("x", 800)
      .attr("y", -20)
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "text-bottom")
      .attr("font-size", "12px")
      .attr("font-family", "'Manrope', sans-serif")
      .attr("font-weight", "600")
      .attr("letter-spacing", "0.05em")
      .attr("transform", `rotate(-90, ${divideX}, -15)`);

    divideText.append("tspan")
      .attr("fill", "#2980eb")
      .text("North");

    divideText.append("tspan")
      .attr("fill", "#eb9429")
      .text(" - South Divide");
  }

  // ── Info box with Global North/South statistics ───────
  const boxX = innerW - 400;
  const boxY = 40;
  const boxW = 310;
  const boxPadding = 20;

  // Background box with subtle border
  g.append("rect")
    .attr("x", boxX)
    .attr("y", boxY)
    .attr("width", boxW)
    .attr("height", 140)
    .attr("fill", "rgba(7, 9, 15, 0.85)")
    .attr("stroke", "#eb9429")
    .attr("stroke-width", 0.8)
    .attr("rx", 5);

  // Text content function with proper wrapping
  function wrapText(parent, text, x, y, maxWidth, lineHeight) {
    const words = text.split(/\s+/);
    let line = "";
    let lineNum = 0;
    const charWidth = 10;

    words.forEach((word, i) => {
      const testLine = line + (line ? " " : "") + word;
      if ((testLine.length * charWidth > maxWidth && line) || word.includes("\n")) {
        if (line) {
          parent.append("tspan")
            .attr("x", x)
            .attr("dy", lineNum > 0 ? lineHeight : 0)
            .text(line);
          lineNum++;
          line = word;
        } else {
          parent.append("tspan")
            .attr("x", x)
            .attr("dy", lineNum > 0 ? lineHeight : 0)
            .text(word);
          lineNum++;
          line = "";
        }
      } else {
        line = testLine;
      }
    });
    if (line) {
      parent.append("tspan")
        .attr("x", x)
        .attr("dy", lineNum > 0 ? lineHeight : 0)
        .text(line);
    }
  }

  const textX = boxX + boxPadding + 5;
  const textY = boxY + boxPadding + 13;
  const fontSize_box = 13;
  const lineHeight = 21;
  const maxTextWidth = boxW - (boxPadding * 3.5);

  const quoteText = g.append("text")
    .attr("x", textX)
    .attr("y", textY)
    .attr("font-size", `${fontSize_box}px`)
    .attr("font-family", "'Manrope', sans-serif")
    .attr("fill", "#e2e8f0")
    .attr("font-weight", "430")
    .attr("letter-spacing", "0.3px")
    .style("pointer-events", "none");

  // Build the quote with proper formatting and highlights
  const parts = [
    { text: "The ", color: "#e2e8f0", bold: false },
    { text: "Global North", color: "#eb9429", bold: true },
    { text: " contains ", color: "#e2e8f0", bold: false },
    { text: "228,922,087 people", color: "#eb9429", bold: true },
    { text: " distributed across 81 cities with populations over one million, whereas the ", color: "#e2e8f0", bold: false },
    { text: "Global South", color: "#22c55e", bold: true },
    { text: " accounts for ", color: "#e2e8f0", bold: false },
    { text: "1,665,354,511 people", color: "#22c55e", bold: true },
    { text: " living in 434 cities of same size.", color: "#e2e8f0", bold: false }
  ];

  let currentLine = "";
  let lineNum = 0;
  const charWidth = 5.5;

  parts.forEach((part, idx) => {
    const words = part.text.split(/\s+/);

    words.forEach((word, wIdx) => {
      const testLine = currentLine + (currentLine ? " " : "") + word;

      if ((testLine.length * charWidth > maxTextWidth && currentLine) ||
        (wIdx === 0 && idx > 0 && currentLine && (testLine.length * charWidth > maxTextWidth))) {
        // Flush current line
        if (currentLine) {
          const tspan = quoteText.append("tspan")
            .attr("x", textX)
            .attr("dy", lineNum > 0 ? lineHeight : 0)
            .attr("fill", "#e2e8f0")
            .text(currentLine);
          lineNum++;
        }
        currentLine = word;
      } else {
        currentLine = testLine;
      }

      // If this is the last word in a part, or we need to apply color
      if (wIdx === words.length - 1 && word.trim()) {
        // We'll handle color in the next pass
      }
    });
  });

  // Simpler approach: render the full text with color spans
  quoteText.html("");

  const fullText = "The Global South contains 1,665,354,511 people distributed across 434 cities with populations over one million, whereas the Global North accounts for 228,922,087 people living in 81 cities of same size.";

  // Create a helper to intelligently split and color text
  const segments = [];
  let remaining = fullText;
  const patterns = [
    { pattern: "Global North", color: "#2980eb", bold: true },
    { pattern: "228,922,087 people", color: "#2980eb", bold: true },
    { pattern: "Global South", color: "#eb9429", bold: true },
    { pattern: "1,665,354,511 people", color: "#eb9429", bold: true }
  ];

  function splitWithColors(text) {
    let result = [];
    let pos = 0;

    while (pos < text.length) {
      let found = false;
      for (const p of patterns) {
        const idx = text.indexOf(p.pattern, pos);
        if (idx === pos) {
          result.push({ text: p.pattern, color: p.color, bold: p.bold });
          pos += p.pattern.length;
          found = true;
          break;
        }
      }
      if (!found) {
        let nextIdx = text.length;
        for (const p of patterns) {
          const idx = text.indexOf(p.pattern, pos);
          if (idx > pos && idx < nextIdx) nextIdx = idx;
        }
        result.push({ text: text.substring(pos, nextIdx), color: "#e2e8f0", bold: false });
        pos = nextIdx;
      }
    }
    return result;
  }

  const coloredSegments = splitWithColors(fullText);

  // Now render with proper line wrapping
  let currentLineSegments = [];
  let currentLineWidth = 0;
  let firstLine = true;

  coloredSegments.forEach(segment => {
    const words = segment.text.split(/\s+/).filter(w => w.length > 0);

    words.forEach((word, widx) => {
      const wordWidth = word.length * charWidth;

      if (currentLineWidth + wordWidth + (currentLineSegments.length > 0 ? charWidth : 0) > maxTextWidth && currentLineSegments.length > 0) {
        // Render current line
        const dy = firstLine ? 0 : lineHeight;
        const tspan = quoteText.append("tspan")
          .attr("x", textX)
          .attr("dy", dy);

        currentLineSegments.forEach(seg => {
          tspan.append("tspan")
            .attr("fill", seg.color)
            .attr("font-weight", seg.bold ? "600" : "400")
            .text(seg.text);
        });

        currentLineSegments = [];
        currentLineWidth = 0;
        firstLine = false;
      }

      const displayWord = (currentLineSegments.length > 0 && currentLineSegments[currentLineSegments.length - 1].text.slice(-1) !== " ") ? " " + word : word;

      if (currentLineSegments.length > 0 && currentLineSegments[currentLineSegments.length - 1].color === segment.color) {
        currentLineSegments[currentLineSegments.length - 1].text += displayWord;
      } else {
        currentLineSegments.push({ text: displayWord, color: segment.color, bold: segment.bold });
      }

      currentLineWidth += displayWord.length * charWidth;
    });
  });

  // Render final line
  if (currentLineSegments.length > 0) {
    const dy = firstLine ? 0 : lineHeight;
    const tspan = quoteText.append("tspan")
      .attr("x", textX)
      .attr("dy", dy);

    currentLineSegments.forEach(seg => {
      tspan.append("tspan")
        .attr("fill", seg.color)
        .attr("font-weight", seg.bold ? "600" : "400")
        .text(seg.text);
    });
  }

  // ── Info box (Left - Bottom) - Global North/South average index ───
  const boxW_sw = Math.min(innerW * 0.55, 540); 
  const boxX_sw = Math.max(20, innerW * 0.02);   
  const boxH_sw = 42;
  const boxY_sw = innerH - boxH_sw - 16;          
  const boxPadding_sw = 12;


  // Text content with proper formatting
  const textX_sw = boxX_sw + boxPadding_sw;
  const textY_sw = boxY_sw + boxPadding_sw + 14;
  const fontSize_box_sw = 15;

  // First, render text to measure width
  const tempStatsText = g.append("text")
    .attr("x", textX_sw)
    .attr("y", textY_sw)
    .attr("font-size", `${fontSize_box_sw}px`)
    .attr("font-family", "'Manrope', sans-serif")
    .attr("fill", "#e2e8f0")
    .attr("font-weight", "400")
    .attr("letter-spacing", "0.3px")
    .style("pointer-events", "none")
    .style("visibility", "hidden");

  // Build text to calculate width
  tempStatsText.append("tspan").text("Global South");
  tempStatsText.append("tspan").text(" average index 0.51 vs. ");
  tempStatsText.append("tspan").text("Global North");
  tempStatsText.append("tspan").text("average index 0.32");

  // Estimate the bounding box
  let estimatedWidth = boxW_sw;

  // Remove temp text
  tempStatsText.remove();

  // Background box with accent border (sized to fit content)
  g.append("rect")
    .attr("x", boxX_sw)
    .attr("y", boxY_sw)
    .attr("width", estimatedWidth)
    .attr("height", boxH_sw)
    .attr("fill", "rgba(7, 9, 15, 0.85)")
    .attr("stroke", "#eb9429")
    .attr("stroke-width", 0.8)
    .attr("opacity", 0.6)
    .attr("rx", 5);

  // Final text element with color highlights
  const statsText = g.append("text")
    .attr("x", textX_sw)
    .attr("y", textY_sw)
    .attr("font-size", `${fontSize_box_sw}px`)
    .attr("font-family", "'Manrope', sans-serif")
    .attr("fill", "#e2e8f0")
    .attr("font-weight", "400")
    .attr("letter-spacing", "0.3px")
    .style("pointer-events", "none");

  // Add text with color highlights  
  statsText.append("tspan")
    .attr("fill", "#eb9429")
    .attr("font-weight", "600")
    .text("Global South");

  statsText.append("tspan")
    .attr("fill", "#e2e8f0")
    .text(" average index ");

  statsText.append("tspan")
    .attr("fill", "#eb9429")
    .attr("font-weight", "600")
    .text("0.51");

  statsText.append("tspan")
    .attr("fill", "#e2e8f0")
    .text(" vs. ");

  statsText.append("tspan")
    .attr("fill", "#2980eb")
    .attr("font-weight", "600")
    .text("Global North");

  statsText.append("tspan")
    .attr("fill", "#e2e8f0")
    .text(" average index ");

  statsText.append("tspan")
    .attr("fill", "#2980eb")
    .attr("font-weight", "600")
    .text("0.32");

  // ── X axis tick marks ─────────────────────────
  g.append("g")
    .attr("transform", `translate(0,${innerH})`)
    .call(d3.axisBottom(xScale).tickSize(4).tickFormat(""))
    .call(ax => ax.select(".domain").attr("stroke", "rgba(255,255,255,0.1)"))
    .call(ax => ax.selectAll(".tick line").attr("stroke", "rgba(255,255,255,0.1)"));

  // ── Wrapped region labels ─────────────────────
  // maxW is capped at the bandwidth (column width) so labels never
  // bleed into the gap belonging to an adjacent region.
  const step = xScale.step();
  const maxW = xScale.bandwidth();
  const charPx = 7.2;

  regions.forEach(([region]) => {
    const raw = region.replace(/^﻿/, "").trim();
    const lowercase = new Set(["and", "the", "of", "in", "a"]);
    const clean = raw.split(/\s+/).map((w, i) => {
      const l = w.toLowerCase();
      return (i === 0 || !lowercase.has(l)) ? l.charAt(0).toUpperCase() + l.slice(1) : l;
    }).join(" ");
    const cx = xScale(region) + xScale.bandwidth() / 2;
    const words = clean.split(/\s+/);

    const lines = [];
    let cur = "";
    words.forEach(w => {
      const test = cur ? cur + " " + w : w;
      if (test.length * charPx > maxW && cur) {
        lines.push(cur);
        cur = w;
      } else {
        cur = test;
      }
    });
    if (cur) lines.push(cur);

    const textEl = g.append("text")
      .attr("text-anchor", "middle")
      .attr("fill", "#ffffff")
      .attr("font-size", "11px")
      .attr("font-family", "'Syne', sans-serif")
      .attr("font-weight", "700")
      .attr("letter-spacing", "0.04em");

    lines.forEach((line, i) => {
      textEl.append("tspan")
        .attr("x", cx)
        .attr("y", innerH + 16 + i * 13)
        .text(line);
    });
  });
}


// ── Tooltip helpers ───────────────────────────
function showTooltip(event, d) {
  const accentColour = d._status === "top" ? "#f87171"
    : d._status === "bottom" ? "#22c55e"
      : "#eb9429";
  tooltip
    .style("opacity", 1)
    .style("border-left-color", accentColour)
    .html(`
      <div class="tt-city">${d.city}</div>
      <div class="tt-country">${d.country}</div>
      <div class="tt-score">${(+d.index).toFixed(3)}</div>
    `);
}

function moveTooltip(event) {
  tooltip
    .style("left", (event.clientX + 14) + "px")
    .style("top", (event.clientY - 36) + "px");
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
