
require("dotenv").config();
const nodemailer = require("nodemailer");

const NORMAL_INTERVAL = 10 * 60 * 1000;
const FULL_INTERVAL = 5 * 60 * 1000;

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.GMAIL_SENDER,
    pass: process.env.GMAIL_APP_PASSWORD?.replace(/\s/g, "")
  }
});

let lastEmailSent = Date.now();
let previousFull = false;
let checking = false;

async function readFirebase(path) {
  const databaseUrl = process.env.FIREBASE_DATABASE_URL.replace(/\/+$/, "");
  const response = await fetch(`${databaseUrl}/${path}.json`);

  if (!response.ok) {
    throw new Error(`Firebase HTTP ${response.status}`);
  }

  return response.json();
}

async function sendAlert(level, status, shutter) {
  await transporter.sendMail({
    from: process.env.GMAIL_SENDER,
    to: process.env.ALERT_RECIPIENT,
    subject: `Smart Dustbin Alert: ${status}`,
    text:
      `Garbage Level: ${level}%\n` +
      `Status: ${status}\n` +
      `Shutter: ${shutter ?? "Unknown"}\n` +
      `Time: ${new Date().toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata"
      })}`
  });

  console.log(`Email sent: ${status}, ${level}%`);
}

async function checkAlerts() {
  if (checking) return;
  checking = true;

  try {
    const garbage = await readFirebase("smart_dustbin/garbage");

    if (!garbage || !Number.isFinite(Number(garbage.level))) {
      console.log("Waiting for valid Firebase garbage data...");
      return;
    }

    const level = Math.max(0, Math.min(100, Number(garbage.level)));
    const isFull = level >= 90;

    const status = isFull
      ? "FULL"
      : level >= 70
        ? "ALMOST FULL"
        : "NORMAL";

    const becameFull = isFull && !previousFull;
    const interval = isFull ? FULL_INTERVAL : NORMAL_INTERVAL;
    const intervalDue = Date.now() - lastEmailSent >= interval;

    if (becameFull || intervalDue) {
      const shutter = await readFirebase("smart_dustbin/shutter/status");

      await sendAlert(level.toFixed(1), status, shutter);
      lastEmailSent = Date.now();
    }

    previousFull = isFull;
  } catch (error) {
    console.error("Alert check failed:", error.message);
  } finally {
    checking = false;
  }
}

async function start() {
  const requiredVariables = [
    "GMAIL_SENDER",
    "GMAIL_APP_PASSWORD",
    "ALERT_RECIPIENT",
    "FIREBASE_DATABASE_URL"
  ];
  const missingVariables = requiredVariables.filter(name => !process.env[name]);

  if (missingVariables.length > 0) {
    throw new Error(`Missing required environment variables: ${missingVariables.join(", ")}`);
  }

  await transporter.verify();

  console.log("Gmail connection verified.");
  console.log("Smart Dustbin email monitor started.");

  await checkAlerts();
  setInterval(checkAlerts, 3000);
}

start().catch(error => {
  console.error("Startup failed:", error.message);
  process.exit(1);
});
