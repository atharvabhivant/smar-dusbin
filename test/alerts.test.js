const assert = require("node:assert/strict");
const { after, before, test } = require("node:test");
const nodemailer = require("nodemailer");

process.env.CRON_SECRET = "test-cron-secret";
process.env.FIREBASE_DATABASE_URL = "https://example.firebaseio.com";
process.env.GMAIL_SENDER = "sender@example.com";
process.env.GMAIL_APP_PASSWORD = "test-password";
process.env.ALERT_RECIPIENT = "recipient@example.com";

const handler = require("../api/alerts");
const originalFetch = global.fetch;

function createResponse() {
  return {
    headers: {},
    statusCode: null,
    body: null,
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(statusCode) {
      this.statusCode = statusCode;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    }
  };
}

async function invoke({ method = "GET", authorization = "Bearer test-cron-secret" } = {}) {
  const res = createResponse();
  await handler({ method, headers: { authorization } }, res);
  return res;
}

before(() => {
  global.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ garbage: { level: 50 } })
  });
});

after(() => {
  global.fetch = originalFetch;
});

test("rejects requests without the cron authorization", async () => {
  const res = await invoke({ authorization: "" });
  assert.equal(res.statusCode, 401);
});

test("rejects methods other than GET", async () => {
  const res = await invoke({ method: "POST" });
  assert.equal(res.statusCode, 405);
  assert.equal(res.headers.Allow, "GET");
});

test("does not email when the bin is below the full threshold", async () => {
  const res = await invoke();
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.sent, false);
});

test("emails when the bin reaches the full threshold", async () => {
  let sentMessage;
  const originalCreateTransport = nodemailer.createTransport;
  nodemailer.createTransport = () => ({
    sendMail: async message => {
      sentMessage = message;
    }
  });
  global.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      garbage: { level: 95 },
      shutter: { status: "CLOSED" }
    })
  });

  try {
    const res = await invoke();
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.sent, true);
    assert.equal(sentMessage.subject, "Smart Dustbin Alert: FULL");
    assert.match(sentMessage.text, /95\.0%/);
  } finally {
    nodemailer.createTransport = originalCreateTransport;
  }
});

test("reports invalid Firebase readings instead of treating them as empty", async () => {
  global.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ garbage: { level: "unknown" } })
  });

  const res = await invoke();
  assert.equal(res.statusCode, 502);
  assert.match(res.body.error, /Failed to check Firebase/);
});
