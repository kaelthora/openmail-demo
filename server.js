const express = require("express");
const cors = require("cors");

const app = express();

app.use(
  cors({
    origin: "*",
  })
);
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true, status: "alive" });
});

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildGmailImapConfig(email, password) {
  return {
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth: {
      user: email,
      pass: password,
    },
    tls: true,
    tlsOptions: {
      rejectUnauthorized: false,
    },
    connTimeout: 10000,
    authTimeout: 10000,
  };
}

async function verifyImapWithRetry(email, password, maxAttempts = 2) {
  const { ImapFlow } = await import("imapflow");
  const baseConfig = buildGmailImapConfig(email, password);

  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let client = null;
    try {
      console.log("IMAP: starting connection", email);
      client = new ImapFlow({
        host: baseConfig.host,
        port: baseConfig.port,
        secure: baseConfig.secure,
        auth: baseConfig.auth,
        connectionTimeout: baseConfig.connTimeout,
        greetingTimeout: baseConfig.authTimeout,
        socketTimeout: baseConfig.authTimeout,
        tls: {
          rejectUnauthorized: baseConfig.tlsOptions.rejectUnauthorized,
          servername: baseConfig.host,
        },
        logger: false,
      });
      await client.connect();
      await client.mailboxOpen("INBOX");
      await client.logout();
      client = null;
      console.log("IMAP: SUCCESS");
      return;
    } catch (err) {
      console.error("IMAP: ERROR", err);
      lastError =
        err instanceof Error
          ? err
          : new Error("Unknown IMAP connection error");
      if (attempt < maxAttempts) {
        await sleep(1000);
      }
    } finally {
      if (client) {
        try {
          await client.logout();
        } catch {
          // ignore cleanup failures
        }
      }
    }
  }

  throw new Error(
    `IMAP connection failed: ${lastError?.message || "Unknown error"}`
  );
}

async function handleConnect(req, res) {
  const { email, password } = req.body || {};
  if (!email || !password) {
    res.status(400).json({ ok: false, error: "Missing credentials" });
    return;
  }
  const cleanPassword = String(password).replace(/\s/g, "");
  const cleanEmail = String(email).trim();
  console.log("CONNECT:", cleanEmail);

  try {
    await verifyImapWithRetry(cleanEmail, cleanPassword, 1);
    res.json({ ok: true });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "IMAP connection failed: unknown error";
    res.status(500).json({ ok: false, error: message });
  }
}

app.post("/connect", handleConnect);
app.post("/api/connect", handleConnect);

app.get("/api/debug-imap", async (req, res) => {
  const email = String(process.env.EMAIL_USER ?? "").trim();
  const password = String(process.env.EMAIL_PASS ?? "").trim();

  if (!email || !password) {
    res
      .status(400)
      .json({ ok: false, error: "Missing email/password env vars" });
    return;
  }

  try {
    await verifyImapWithRetry(email, password, 2);
    res.json({ ok: true });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "IMAP connection failed: unknown error";
    res.status(500).json({ ok: false, error: message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
