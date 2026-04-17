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

app.post("/connect", async (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    res.status(400).json({ ok: false, error: "Email and password are required" });
    return;
  }

  let client = null;
  try {
    const { ImapFlow } = await import("imapflow");

    client = new ImapFlow({
      host: "imap.gmail.com",
      port: 993,
      secure: true,
      auth: {
        user: email,
        pass: password,
      },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 10000,
      logger: false,
    });

    await client.connect();
    await client.mailboxOpen("INBOX");
    await client.logout();
    client = null;

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : "Connection failed";
    res.status(500).json({ ok: false, error: message });
  } finally {
    if (client) {
      try {
        await client.logout();
      } catch {
        // ignore cleanup failures
      }
    }
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
