/* SMART DUSTBIN DASHBOARD - LIVE FIREBASE VERSION
   Reads the ESP32 data from Firebase Realtime Database.
   No demo/simulated readings are used.
*/

const FIREBASE_DATABASE_URL =
  "https://smart-dustbin-b3e9f-default-rtdb.firebaseio.com";
const FIREBASE_PATH = "/smart_dustbin.json";
const UPDATE_INTERVAL = 2000;

const $ = (id) => document.getElementById(id);

const garbageLevelElement = $("garbageLevel");
const garbageProgress = $("garbageProgress");
const garbageStatus = $("garbageStatus");
const shutterStatusElement = $("shutterStatus");
const shutterIndicator = $("shutterIndicator");
const servoAngle = $("servoAngle");
const alertBox = $("alertBox");
const footerTime = $("footerTime");
const connectionStatus = $("connectionStatus");
const wifiStatus = $("wifiStatus");

let garbageChart = null;
const historyLabels = [];
const historyValues = [];
let refreshInProgress = false;
let lastDisplayedLevel = null;

function updateGarbageLevel(level, firebaseStatus) {
  const numericLevel = Number(level);
  if (!Number.isFinite(numericLevel)) {
    throw new Error("Firebase garbage level is not numeric: " + level);
  }

  const safeLevel = Math.max(0, Math.min(100, numericLevel));

  if (garbageLevelElement) {
    garbageLevelElement.textContent = `${safeLevel.toFixed(1)}%`;
  }
  if (garbageProgress) {
    garbageProgress.style.width = `${safeLevel}%`;
  }

  const status = String(firebaseStatus || (
    safeLevel >= 90 ? "FULL" : safeLevel >= 70 ? "ALMOST FULL" : "NORMAL"
  )).toUpperCase();

  if (garbageStatus) {
    garbageStatus.textContent = status;
    garbageStatus.style.color = safeLevel >= 90 ? "#ef4444" :
      safeLevel >= 70 ? "#f59e0b" : "#22c55e";
  }

  if (garbageProgress) {
    garbageProgress.style.background = safeLevel >= 90 ? "#ef4444" :
      safeLevel >= 70 ? "#f59e0b" : "#22c55e";
  }

  if (alertBox) {
    alertBox.classList.toggle("hidden", safeLevel < 90);
  }

  return safeLevel;
}

function updateShutter(status, angle) {
  const normalizedStatus = String(status ?? "CLOSED").toUpperCase();
  const isOpen = normalizedStatus === "OPEN" || status === true;
  const angleValue = Number(angle);
  const displayedAngle = Number.isFinite(angleValue) ? angleValue : (isOpen ? 90 : 0);

  if (shutterStatusElement) shutterStatusElement.textContent = isOpen ? "OPEN" : "CLOSED";
  if (shutterIndicator) {
    shutterIndicator.textContent = isOpen ? "OPEN" : "CLOSED";
    shutterIndicator.className = `shutter-indicator ${isOpen ? "open" : "closed"}`;
  }
  if (servoAngle) servoAngle.textContent = `${displayedAngle}Â°`;
}

function setConnection(isOnline, wifiValue) {
  if (connectionStatus) connectionStatus.textContent = isOnline ? "ONLINE" : "OFFLINE";

  if (wifiStatus) {
    const wifiOnline = wifiValue === true ||
      ["connected", "online", "true", "1"].includes(String(wifiValue).toLowerCase());
    wifiStatus.textContent = isOnline && wifiOnline ? "ONLINE" : "OFFLINE";
  }
}

function initializeChart() {
  const canvas = $("garbageChart");
  if (!canvas || !window.Chart) {
    console.warn("Chart.js or #garbageChart is unavailable; chart will be skipped.");
    return;
  }

  garbageChart = new Chart(canvas.getContext("2d"), {
    type: "line",
    data: {
      labels: historyLabels,
      datasets: [{
        label: "Garbage Level (%)",
        data: historyValues,
        borderWidth: 2,
        tension: 0.35,
        fill: true,
        borderColor: "#22c55e",
        backgroundColor: "rgba(34,197,94,0.08)",
        pointRadius: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { min: 0, max: 100, ticks: { callback: value => `${value}%` } }
      }
    }
  });
}

function addHistoryReading(level) {
  if (!garbageChart) return;

  // Avoid adding duplicate points when Firebase has not changed.
  if (lastDisplayedLevel === level) return;
  lastDisplayedLevel = level;

  historyLabels.push(new Date().toLocaleTimeString([], {
    hour: "2-digit", minute: "2-digit", second: "2-digit"
  }));
  historyValues.push(level);

  if (historyLabels.length > 100) {
    historyLabels.shift();
    historyValues.shift();
  }
  garbageChart.update("none");
}

function applyFirebaseData(data) {
  if (!data || !data.garbage || data.garbage.level === undefined || data.garbage.level === null) {
    throw new Error("Missing Firebase field: /smart_dustbin/garbage/level");
  }

  const level = updateGarbageLevel(data.garbage.level, data.garbage.status);

  if (data.shutter) {
    updateShutter(data.shutter.status, data.shutter.angle);
  }

  setConnection(true, data.system ? data.system.wifi : true);

  const nowText = new Date().toLocaleTimeString();
  if (footerTime) footerTime.textContent = nowText;

  addHistoryReading(level);
  console.log(`[Firebase] Live reading: ${level.toFixed(1)}% at ${nowText}`);
}

async function refreshDashboard() {
  if (refreshInProgress) return;
  refreshInProgress = true;

  try {
    const url = `${FIREBASE_DATABASE_URL}${FIREBASE_PATH}?_=${Date.now()}`;
    const response = await fetch(url, {
      method: "GET",
      cache: "no-store",
      headers: { "Accept": "application/json" }
    });

    if (!response.ok) {
      throw new Error(`Firebase returned HTTP ${response.status}`);
    }

    const data = await response.json();
    applyFirebaseData(data);
  } catch (error) {
    setConnection(false, false);
    console.error("Dashboard Firebase update failed:", error);
  } finally {
    refreshInProgress = false;
  }
}

function initializeChartPeriod() {
  const selector = $("chartPeriod");
  if (!selector) return;

  selector.addEventListener("change", () => {
    if (!garbageChart) return;
    const count = selector.value === "24" ? 24 : selector.value === "12" ? 12 : 7;
    garbageChart.data.labels = historyLabels.slice(-count);
    garbageChart.data.datasets[0].data = historyValues.slice(-count);
    garbageChart.update();
  });
}

// Confirm that the browser is executing this exact updated file.
console.log("Smart Dustbin live Firebase app.js loaded.");
initializeChart();
initializeChartPeriod();
refreshDashboard();
setInterval(refreshDashboard, UPDATE_INTERVAL);