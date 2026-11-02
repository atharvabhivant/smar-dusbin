const nodemailer = require("nodemailer");
const { timingSafeEqual } = require("node:crypto");

function isAuthorized(authorization, secret) {
  if (!authorization || !secret) return false;

  const expected = Buffer.from(`Bearer ${secret}`);
  const provided = Buffer.from(authorization);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

function respond(res, status, body) {
  res.setHeader("Cache-Control", "no-store");
  return res.status(status).json(body);
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return respond(res, 405, { error: "Method not allowed" });
  }

  const requiredVariables = [
    "CRON_SECRET",
    "FIREBASE_DATABASE_URL",
    "GMAIL_SENDER",
    "GMAIL_APP_PASSWORD",
    "ALERT_RECIPIENT"
  ];
  const missingVariables = requiredVariables.filter(name => !process.env[name]);

  if (missingVariables.length > 0) {
    console.error("Missing alert environment variables:", missingVariables.join(", "));
    return respond(res, 500, { error: "Alert service is not configured" });
  }

  if (!isAuthorized(req.headers.authorization, process.env.CRON_SECRET)) {
    return respond(res, 401, { error: "Unauthorized" });
  }

  try {
    const databaseUrl = process.env.FIREBASE_DATABASE_URL.replace(/\/+$/, "");
    const response = await fetch(`${databaseUrl}/smart_dustbin.json`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10000)
    });

    if (!response.ok) {
      throw new Error(`Firebase returned HTTP ${response.status}`);
    }

    const data = await response.json();
    const level = Number(data?.garbage?.level);

    if (!Number.isFinite(level) || level < 0 || level > 100) {
      throw new Error("Firebase returned a missing or invalid garbage level");
    }

    if (level < 90) {
      return respond(res, 200, { sent: false, reason: "Dustbin is below the full threshold" });
    }

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.GMAIL_SENDER,
        pass: process.env.GMAIL_APP_PASSWORD.replace(/\s/g, "")
      }
    });

    await transporter.sendMail({
      from: process.env.GMAIL_SENDER,
      to: process.env.ALERT_RECIPIENT,
      subject: "Smart Dustbin Alert: FULL",
      text:
        `Garbage Level: ${level.toFixed(1)}%\n` +
        "Status: FULL\n" +
        `Shutter: ${data.shutter?.status ?? "Unknown"}\n` +
        `Time: ${new Date().toLocaleString("en-IN", {
          timeZone: "Asia/Kolkata"
        })}`
    });

    console.log(`Full-bin email sent: ${level.toFixed(1)}%`);
    return respond(res, 200, { sent: true, level });
  } catch (error) {
    console.error("Scheduled alert failed:", error);
    return respond(res, 502, { error: "Failed to check Firebase or send the alert" });
  }
};
