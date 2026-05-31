const OWM_KEY  = "fc1022093d14113c2d909d4476504f77"; // OpenWeatherMap — fallback + forecast only
const WAQI_KEY = "726a81b34948a877174e2c72d7363bd34c2552eb"; // WAQI — PRIMARY source (real ground sensors)

/* =====================
   DATE / TIME
   ===================== */
function updateDateTime() {
  const now  = new Date();
  const opts = { weekday: "short", month: "short", day: "numeric" };
  document.getElementById("datetime").textContent = now.toLocaleDateString("en-US", opts);
}
updateDateTime();
setInterval(updateDateTime, 60000);

/* =====================
   THEME TOGGLE
   ===================== */
const themeBtn = document.getElementById("themeBtn");
let isDark = true;
themeBtn.addEventListener("click", () => {
  isDark = !isDark;
  document.documentElement.setAttribute("data-theme", isDark ? "dark" : "light");
  themeBtn.innerHTML = isDark ? '<i class="fas fa-moon"></i>' : '<i class="fas fa-sun"></i>';
});

/* =====================
   HAMBURGER
   ===================== */
document.getElementById("hamburger").addEventListener("click", () => {
  document.getElementById("mobileNav").classList.toggle("open");
});

/* =====================
   RECENT SEARCHES
   ===================== */
function getRecent() {
  try { return JSON.parse(localStorage.getItem("bs_recent") || "[]"); }
  catch { return []; }
}
function saveRecent(city) {
  let list = getRecent().filter(c => c.toLowerCase() !== city.toLowerCase());
  list.unshift(city);
  list = list.slice(0, 5);
  try { localStorage.setItem("bs_recent", JSON.stringify(list)); } catch {}
  renderRecent();
}
function renderRecent() {
  const wrap = document.getElementById("recentSearches");
  wrap.innerHTML = getRecent()
    .map(c => `<span class="recent-tag" onclick="fetchAQI('${c}')">${c}</span>`)
    .join("");
}
renderRecent();

/* ============================================================
   AQI MATH ENGINE  (US EPA standard)
   Used for: forecast chart + OWM fallback only.
   Primary AQI comes directly from WAQI real sensors.
   ============================================================ */
function calcAQI(Cp, BPHi, BPLo, IHi, ILo) {
  return Math.round(((IHi - ILo) / (BPHi - BPLo)) * (Cp - BPLo) + ILo);
}
function aqiFromPM25(pm) {
  pm = Math.min(pm, 500);
  if (pm <=  0)    return 0;
  if (pm <= 12.0)  return calcAQI(pm,  12.0,   0.0,  50,   0);
  if (pm <= 35.4)  return calcAQI(pm,  35.4,  12.1, 100,  51);
  if (pm <= 55.4)  return calcAQI(pm,  55.4,  35.5, 150, 101);
  if (pm <= 150.4) return calcAQI(pm, 150.4,  55.5, 200, 151);
  if (pm <= 250.4) return calcAQI(pm, 250.4, 150.5, 300, 201);
  if (pm <= 350.4) return calcAQI(pm, 350.4, 250.5, 400, 301);
  return calcAQI(pm, 500.4, 350.5, 500, 401);
}
function aqiFromPM10(pm) {
  pm = Math.round(pm);
  if (pm <=  0)   return 0;
  if (pm <=  54)  return calcAQI(pm,   54,   0,  50,   0);
  if (pm <= 154)  return calcAQI(pm,  154,  55, 100,  51);
  if (pm <= 254)  return calcAQI(pm,  254, 155, 150, 101);
  if (pm <= 354)  return calcAQI(pm,  354, 255, 200, 151);
  if (pm <= 424)  return calcAQI(pm,  424, 355, 300, 201);
  if (pm <= 504)  return calcAQI(pm,  504, 425, 400, 301);
  return calcAQI(pm, 604, 505, 500, 401);
}
function aqiFromO3(ppb) {   // WAQI gives ppb directly
  if (ppb <=   0) return 0;
  if (ppb <=  54) return calcAQI(ppb,   54,   0,  50,   0);
  if (ppb <=  70) return calcAQI(ppb,   70,  55, 100,  51);
  if (ppb <=  85) return calcAQI(ppb,   85,  71, 150, 101);
  if (ppb <= 105) return calcAQI(ppb,  105,  86, 200, 151);
  if (ppb <= 200) return calcAQI(ppb,  200, 106, 300, 201);
  return 301;
}
function aqiFromPM25_owm(pm) { return aqiFromPM25(pm); }
function aqiFromPM10_owm(pm) { return aqiFromPM10(pm); }
function aqiFromO3_owm(ugm3) { return aqiFromO3(ugm3 / 1.96); }  // OWM μg/m³ → ppb
function aqiFromNO2_owm(ugm3) {
  const ppb = ugm3 / 1.88;
  if (ppb <=   0) return 0;
  if (ppb <=  53) return calcAQI(ppb,   53,   0,  50,   0);
  if (ppb <= 100) return calcAQI(ppb,  100,  54, 100,  51);
  if (ppb <= 360) return calcAQI(ppb,  360, 101, 150, 101);
  if (ppb <= 649) return calcAQI(ppb,  649, 361, 200, 151);
  return 201;
}
function aqiFromCO_owm(ugm3) {
  const ppm = ugm3 / 1145; // OWM μg/m³ → ppm
  if (ppm <=  0)   return 0;
  if (ppm <=  4.4) return calcAQI(ppm,  4.4,   0,  50,   0);
  if (ppm <=  9.4) return calcAQI(ppm,  9.4,  4.5, 100,  51);
  if (ppm <= 12.4) return calcAQI(ppm, 12.4,  9.5, 150, 101);
  if (ppm <= 15.4) return calcAQI(ppm, 15.4, 12.5, 200, 151);
  if (ppm <= 30.4) return calcAQI(ppm, 30.4, 15.5, 300, 201);
  return 201;
}

// Used for OWM fallback + forecast chart
function calculateAQIFromOWM(comp) {
  const candidates = [
    { name: "PM2.5", aqi: aqiFromPM25_owm(comp.pm2_5 || 0) },
    { name: "PM10",  aqi: aqiFromPM10_owm(comp.pm10  || 0) },
    { name: "O₃",    aqi: aqiFromO3_owm(comp.o3      || 0) },
    { name: "NO₂",   aqi: aqiFromNO2_owm(comp.no2    || 0) },
    { name: "CO",    aqi: aqiFromCO_owm(comp.co       || 0) },
  ];
  const worst = candidates.reduce((a, b) => b.aqi > a.aqi ? b : a);
  return { aqi: Math.min(worst.aqi, 500), dominant: worst.name };
}

/* =====================
   AQI INFO
   ===================== */
function getAQIInfo(aqi) {
  if (aqi <=  50) return { color: "#22d3a3", status: "Good",                    risk: 10,  desc: "Air quality is satisfactory. No restrictions needed.",         advice: "Great day for outdoor activities!",                                        tags: ["🚶 Walk outside","🏃 Exercise freely","🪟 Open windows"] };
  if (aqi <= 100) return { color: "#f5c842", status: "Moderate",                risk: 35,  desc: "Acceptable quality. Sensitive individuals may notice effects.",  advice: "Generally fine. Sensitive groups should limit prolonged outdoor exertion.", tags: ["😷 Sensitive groups: caution","🌬️ Ventilate indoors","🌿 Check pollen levels"] };
  if (aqi <= 150) return { color: "#f59642", status: "Unhealthy for Sensitive", risk: 55,  desc: "Sensitive groups may experience health effects.",                advice: "Limit outdoor time if you have asthma, heart or lung conditions.",         tags: ["🏠 Stay indoors","😷 Wear a mask","💊 Keep inhalers handy"] };
  if (aqi <= 200) return { color: "#f54242", status: "Unhealthy",               risk: 75,  desc: "Everyone may experience health effects.",                       advice: "Reduce outdoor activities. Keep windows closed.",                           tags: ["🚫 Avoid outdoor exercise","😷 N95 mask outdoors","🏠 Use air purifier"] };
  if (aqi <= 300) return { color: "#c026d3", status: "Very Unhealthy",          risk: 90,  desc: "Health alert — everyone at risk.",                              advice: "Stay indoors. Avoid all outdoor exertion.",                                 tags: ["⚠️ Health alert","🔴 Stay inside","💨 Air purifier essential"] };
  return           { color: "#7f1d1d",       status: "Hazardous",               risk: 100, desc: "Emergency conditions. Entire population is affected.",           advice: "Do not go outside. Seal windows and doors if possible.",                    tags: ["🚨 Emergency","🏥 Seek medical help if symptomatic","🚪 Seal gaps"] };
}

/* =====================
   TIMESTAMP HELPERS
   ===================== */
function formatTimestamp(unixSeconds) {
  if (!unixSeconds) return "just now";
  const diff = Math.round((Date.now() - unixSeconds * 1000) / 60000);
  if (diff <  1)  return "just now";
  if (diff <  60) return `${diff} min ago`;
  if (diff < 120) return "1 hr ago";
  return `${Math.round(diff / 60)} hrs ago`;
}
function formatTimestampFull(unixSeconds) {
  if (!unixSeconds) return "—";
  return new Date(unixSeconds * 1000).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

/* =====================
   GAUGE CANVAS
   ===================== */
function drawGauge(aqi, color) {
  const canvas = document.getElementById("gaugeCanvas");
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  const cx = W / 2, cy = H - 10, r = 100;

  ctx.beginPath();
  ctx.arc(cx, cy, r, Math.PI, 0);
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 14; ctx.lineCap = "round"; ctx.stroke();

  const pct = Math.min(aqi / 300, 1);
  const fillEnd = Math.PI - pct * Math.PI;
  ctx.beginPath();
  ctx.arc(cx, cy, r, Math.PI, fillEnd, true);
  ctx.strokeStyle = color; ctx.lineWidth = 14; ctx.lineCap = "round";
  ctx.shadowColor = color; ctx.shadowBlur = 14; ctx.stroke(); ctx.shadowBlur = 0;

  const angle = Math.PI - pct * Math.PI;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + r * Math.cos(angle), cy + r * Math.sin(angle));
  ctx.strokeStyle = "white"; ctx.lineWidth = 2; ctx.lineCap = "round"; ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx, cy, 5, 0, Math.PI * 2);
  ctx.fillStyle = color; ctx.fill();
}

/* =====================
   RISK RING CANVAS
   ===================== */
function drawRiskRing(pct, color) {
  const canvas = document.getElementById("riskCanvas");
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const cx = canvas.width / 2, cy = canvas.height / 2, r = 65;

  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(255,255,255,0.07)"; ctx.lineWidth = 12; ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + (pct / 100) * Math.PI * 2);
  ctx.strokeStyle = color; ctx.lineWidth = 12; ctx.lineCap = "round";
  ctx.shadowColor = color; ctx.shadowBlur = 12; ctx.stroke(); ctx.shadowBlur = 0;
}

/* =====================
   FORECAST CHART
   ===================== */
function drawForecastChart(labels, values, color) {
  const canvas = document.getElementById("forecastChart");
  const ctx = canvas.getContext("2d");
  document.getElementById("chartEmpty").classList.add("hidden");

  const W = canvas.offsetWidth || 600, H = 180;
  canvas.width = W; canvas.height = H;
  const PAD = { top: 20, right: 20, bottom: 40, left: 45 };
  const cW = W - PAD.left - PAD.right;
  const cH = H - PAD.top - PAD.bottom;
  ctx.clearRect(0, 0, W, H);

  const maxV = Math.max(...values, 100), minV = 0;
  const toX = i => PAD.left + (i / (values.length - 1)) * cW;
  const toY = v => PAD.top + cH - ((v - minV) / (maxV - minV)) * cH;

  // Grid lines
  for (let i = 0; i <= 4; i++) {
    const y = PAD.top + (cH / 4) * i;
    ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(PAD.left + cW, y);
    ctx.strokeStyle = "rgba(255,255,255,0.06)"; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.font = "10px 'Space Mono', monospace"; ctx.textAlign = "right";
    ctx.fillText(Math.round(maxV - (maxV / 4) * i), PAD.left - 6, y + 4);
  }

  // X labels every 6 items
  labels.forEach((lbl, i) => {
    if (i % 6 !== 0) return;
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.font = "10px 'Space Mono', monospace"; ctx.textAlign = "center";
    ctx.fillText(lbl, toX(i), H - 8);
  });

  // Gradient fill
  const grad = ctx.createLinearGradient(0, PAD.top, 0, PAD.top + cH);
  grad.addColorStop(0, color + "55"); grad.addColorStop(1, color + "00");
  ctx.beginPath(); ctx.moveTo(toX(0), toY(values[0]));
  for (let i = 1; i < values.length; i++) {
    const xc = (toX(i-1) + toX(i)) / 2;
    ctx.bezierCurveTo(xc, toY(values[i-1]), xc, toY(values[i]), toX(i), toY(values[i]));
  }
  ctx.lineTo(toX(values.length-1), PAD.top + cH);
  ctx.lineTo(toX(0), PAD.top + cH);
  ctx.closePath(); ctx.fillStyle = grad; ctx.fill();

  // Line
  ctx.beginPath(); ctx.moveTo(toX(0), toY(values[0]));
  for (let i = 1; i < values.length; i++) {
    const xc = (toX(i-1) + toX(i)) / 2;
    ctx.bezierCurveTo(xc, toY(values[i-1]), xc, toY(values[i]), toX(i), toY(values[i]));
  }
  ctx.strokeStyle = color; ctx.lineWidth = 2.5;
  ctx.shadowColor = color; ctx.shadowBlur = 8; ctx.stroke(); ctx.shadowBlur = 0;

  // Dots
  values.forEach((v, i) => {
    if (i % 6 !== 0) return;
    ctx.beginPath(); ctx.arc(toX(i), toY(v), 4, 0, Math.PI * 2);
    ctx.fillStyle = color; ctx.fill();
    ctx.strokeStyle = "#13142b"; ctx.lineWidth = 2; ctx.stroke();
  });
}

/* =====================
   POLLUTANT CARDS
   Renders from whatever source we have (WAQI or OWM)
   ===================== */
function renderPollutants(data) {
  // data = { pm25, pm10, o3, no2, so2, co }  — all in their display units
  const cards = [
    { name: "PM2.5", unit: "μg/m³", val: data.pm25, safe: 12,    warn: 35   },
    { name: "PM10",  unit: "μg/m³", val: data.pm10, safe: 54,    warn: 154  },
    { name: "O₃",    unit: "ppb",   val: data.o3,   safe: 54,    warn: 105  },
    { name: "NO₂",   unit: "ppb",   val: data.no2,  safe: 53,    warn: 100  },
    { name: "SO₂",   unit: "ppb",   val: data.so2,  safe: 35,    warn: 75   },
    { name: "CO",    unit: "ppm",   val: data.co,   safe: 4.4,   warn: 9.4  },
  ];

  document.getElementById("pollutantGrid").innerHTML = cards.map(c => {
    const val   = c.val ?? 0;
    const color = val <= c.safe ? "#22d3a3" : val <= c.warn ? "#f5c842" : "#f54242";
    const pct   = Math.min((val / c.warn) * 100, 100);
    return `
      <div class="pollutant-card">
        <div class="poll-name">${c.name}</div>
        <div class="poll-value" style="color:${color}">${val.toFixed(1)}<span class="poll-unit"> ${c.unit}</span></div>
        <div class="poll-bar-wrap">
          <div class="poll-bar" style="width:${pct}%;background:${color}"></div>
        </div>
      </div>`;
  }).join("");
}

/* ============================================================
   EXTRACT POLLUTANTS FROM WAQI RESPONSE
   WAQI iaqi object — values already in display units:
     pm25 → μg/m³,  pm10 → μg/m³
     o3   → ppb,    no2  → ppb,   so2 → ppb,  co → ppm
   ============================================================ */
function extractWAQIPollutants(iaqi) {
  const g = (key) => (iaqi[key] && iaqi[key].v != null) ? +iaqi[key].v : null;
  return {
    pm25: g("pm25"),
    pm10: g("pm10"),
    o3:   g("o3"),
    no2:  g("no2"),
    so2:  g("so2"),
    co:   g("co"),
  };
}

// Find which pollutant is dominant from WAQI iaqi data
function dominantFromWAQI(iaqi) {
  const pm25 = iaqi.pm25?.v || 0;
  const pm10 = iaqi.pm10?.v || 0;
  const o3   = iaqi.o3?.v   || 0;
  const no2  = iaqi.no2?.v  || 0;

  // Convert each to AQI sub-index to find the real dominant
  const candidates = [
    { name: "PM2.5", aqi: aqiFromPM25(pm25) },
    { name: "PM10",  aqi: aqiFromPM10(pm10) },
    { name: "O₃",    aqi: aqiFromO3(o3)     },
    { name: "NO₂",   aqi: aqiFromNO2_owm(no2 * 1.88) }, // ppb → μg/m³ for our fn
  ];
  return candidates.reduce((a, b) => b.aqi > a.aqi ? b : a).name;
}

/* =====================
   UPDATE UI
   ===================== */
function updateUI({ aqi, dominant, pollutants, forecastData, cityName, dataSource, dataTs, pollSource, pollTs }) {
  const info = getAQIInfo(aqi);

  // Source & timestamp
  document.getElementById("dataSource").textContent  = dataSource;
  document.getElementById("dataUpdated").textContent = formatTimestamp(dataTs);
  document.getElementById("pollTimestamp").textContent = "As of " + formatTimestampFull(pollTs || dataTs);

  // Left panel
  document.getElementById("location").textContent = cityName;
  document.getElementById("skeletonMain").style.display = "none";
  document.getElementById("mainContent").classList.add("visible");
  document.getElementById("mainAqi").textContent   = aqi;
  document.getElementById("mainAqi").style.color   = info.color;
  document.getElementById("aqiStatus").textContent = info.status;
  drawGauge(aqi, info.color);

  document.getElementById("pollutant").textContent = dominant;
  document.getElementById("risk").textContent      = info.risk + "%";

  document.getElementById("adviceText").textContent = info.advice;
  document.getElementById("adviceTags").innerHTML   = info.tags
    .map(t => `<span class="advice-tag">${t}</span>`).join("");

  // Globe / popup
  document.getElementById("marker").textContent      = aqi;
  document.getElementById("marker").style.background = info.color;
  document.getElementById("badge").textContent       = aqi;
  document.getElementById("badge").style.background  = info.color;
  document.getElementById("popupCity").textContent   = cityName;
  document.getElementById("popupAqi").textContent    = aqi;
  document.getElementById("popupStatus").textContent = info.status;
  document.getElementById("popup").style.background  = info.color + "ee";

  // Risk ring
  document.getElementById("riskVal").textContent  = info.risk + "%";
  document.getElementById("riskDesc").textContent = info.desc;
  drawRiskRing(info.risk, info.color);

  // Pollutant cards
  renderPollutants(pollutants);

  // Forecast chart — OWM forecast components → EPA AQI math
  if (forecastData?.list?.length) {
    const vals = forecastData.list.map(item => {
      const { aqi: fa } = calculateAQIFromOWM(item.components);
      return fa;
    });
    const lbls = forecastData.list.map(item =>
      new Date(item.dt * 1000).getHours() + ":00"
    );
    setTimeout(() => drawForecastChart(lbls, vals, info.color), 100);
  }
}

/* =====================
   LOADING / ERROR
   ===================== */
function setLoading(on) {
  document.getElementById("loadingOverlay").classList.toggle("active", on);
}
function showError(msg) {
  document.getElementById("errorText").textContent     = msg;
  document.getElementById("errorBanner").style.display = "flex";
}

/* ============================================================
   FETCH AQI
   Priority:
     1. WAQI  → AQI number + pollutant values (real sensors ✅)
     2. OWM   → forecast chart data (48 hr)
     3. OWM   → fallback if WAQI has no station for the city
   ============================================================ */
async function fetchAQI(city) {
  if (!city) return;
  setLoading(true);
  document.getElementById("errorBanner").style.display = "none";

  try {
    // ── Step 1: Geocoding via OWM ────────────────────────
    const geoRes  = await fetch(
      `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(city)}&limit=1&appid=${OWM_KEY}`
    );
    const geoData = await geoRes.json();

    if (!geoData.length) {
      showError(`"${city}" not found. Try a different spelling.`);
      setLoading(false); return;
    }
    const { lat, lon, name, country } = geoData[0];
    const cityName = `${name}, ${country}`;

    // ── Step 2: WAQI — real AQI + real pollutant readings ─
    // Use geo:lat;lon format — always finds the nearest real station,
    // much more reliable than searching by city name string.
    let aqi, dominant, pollutants, dataSource, dataTs, pollTs;

    const waqiRes  = await fetch(
      `https://api.waqi.info/feed/geo:${lat};${lon}/?token=${WAQI_KEY}`
    );
    const waqiData = await waqiRes.json();

    const waqiOk = waqiData.status === "ok" &&
                   waqiData.data?.aqi &&
                   waqiData.data.aqi !== "-" &&
                   !isNaN(+waqiData.data.aqi);

    if (waqiOk) {
      // ✅ WAQI has a real station for this city
      aqi        = +waqiData.data.aqi;
      const iaqi = waqiData.data.iaqi || {};
      pollutants = extractWAQIPollutants(iaqi);
      dominant   = dominantFromWAQI(iaqi);
      const stationName = waqiData.data.city?.name || name;
      dataSource = `WAQI · ${stationName}`;
      dataTs     = waqiData.data.time?.v
                     ? Math.floor(new Date(waqiData.data.time.v).getTime() / 1000)
                     : null;
      pollTs     = dataTs;
    } else {
      // ⚠️ WAQI has no station — fall back to OWM + EPA math
      const owmRes  = await fetch(
        `https://api.openweathermap.org/data/2.5/air_pollution?lat=${lat}&lon=${lon}&appid=${OWM_KEY}`
      );
      const owmData = await owmRes.json();
      const comp    = owmData.list[0].components;
      const result  = calculateAQIFromOWM(comp);

      aqi        = result.aqi;
      dominant   = result.dominant;
      dataSource = "EPA calc (OWM fallback)";
      dataTs     = owmData.list[0].dt;
      pollTs     = dataTs;

      // Convert OWM μg/m³ to display units for pollutant cards
      pollutants = {
        pm25: comp.pm2_5,
        pm10: comp.pm10,
        o3:   +(comp.o3   / 1.96).toFixed(1),  // μg/m³ → ppb
        no2:  +(comp.no2  / 1.88).toFixed(1),  // μg/m³ → ppb
        so2:  +(comp.so2  / 2.62).toFixed(1),  // μg/m³ → ppb
        co:   +(comp.co   / 1145).toFixed(2),  // μg/m³ → ppm
      };
    }

    // ── Step 3: OWM 48-hr forecast (always from OWM) ─────
    let forecastData = null;
    try {
      const forecastRes = await fetch(
        `https://api.openweathermap.org/data/2.5/air_pollution/forecast?lat=${lat}&lon=${lon}&appid=${OWM_KEY}`
      );
      forecastData = await forecastRes.json();
    } catch { /* forecast is optional */ }

    // ── Step 4: Update UI ─────────────────────────────────
    updateUI({ aqi, dominant, pollutants, forecastData, cityName, dataSource, dataTs, pollTs });
    saveRecent(name);

  } catch (err) {
    showError("Network error. Check your connection or API key.");
    console.error(err);
  } finally {
    setLoading(false);
  }
}

/* =====================
   SEARCH EVENTS
   ===================== */
const input     = document.getElementById("citySearch");
const searchBtn = document.getElementById("searchButton");

searchBtn.addEventListener("click", () => {
  const val = input.value.trim();
  if (val) fetchAQI(val);
});
input.addEventListener("keypress", e => {
  if (e.key === "Enter" && input.value.trim()) fetchAQI(input.value.trim());
});

/* =====================
   GEOLOCATION
   ===================== */
document.getElementById("geoBtn").addEventListener("click", () => {
  if (!navigator.geolocation) { showError("Geolocation not supported."); return; }
  setLoading(true);
  navigator.geolocation.getCurrentPosition(
    async pos => {
      try {
        const res  = await fetch(
          `https://api.openweathermap.org/geo/1.0/reverse?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}&limit=1&appid=${OWM_KEY}`
        );
        const data = await res.json();
        setLoading(false);
        if (data.length) fetchAQI(data[0].name);
        else showError("Could not determine your city.");
      } catch { showError("Geolocation lookup failed."); setLoading(false); }
    },
    () => { showError("Location access denied."); setLoading(false); }
  );
});

/* =====================
   DEFAULT CITY
   ===================== */
fetchAQI("Chandigarh");