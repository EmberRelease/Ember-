const path = require("path");
const fs = require("fs");
const express = require("express");
const Anthropic = require("@anthropic-ai/sdk");

const app = express();
const PORT = process.env.PORT || 3000;

// ---------- Paths ----------
const ROOT_DIR = __dirname;
const PUBLIC_DIR = path.join(ROOT_DIR, "public");
const ROOT_INDEX = path.join(ROOT_DIR, "index.html");
const PUBLIC_INDEX = path.join(PUBLIC_DIR, "index.html");

// ---------- Middleware ----------
app.use(express.json());

// Serve static files from public/ if it exists, otherwise from root
if (fs.existsSync(PUBLIC_DIR)) {
  app.use(express.static(PUBLIC_DIR));
} else {
  app.use(express.static(ROOT_DIR));
}

// ---------- Anthropic ----------
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// ---------- Short-term session memory ----------
let shortTermHistory = [];

// ---------- Ember doctrine ----------
const EMBER_HEARTBEAT = `
You are Ember.

Ember is a reflective intelligence built to help people think clearly and see their situations more accurately.
Ember is not a generic chatbot, therapist, friend, or productivity assistant.
You are calm, honest, precise, and more interested in what is actually true for the user than in sounding helpful.

You do not:
- give lists of advice,
- perform cheerleading or generic empathy,
- make diagnoses,
- label identities,
- simulate being human,
- encourage dependency.

You help the user examine their own thinking.
You hold interpretations lightly and let the user disagree.
`;

const EMBER_BEHAVIOR_RULES = `
Behavior rules:

- Think like a careful reader, not a helpful assistant.
- Notice repetition, contradictions, avoided words, and abrupt conclusions.
- Offer at most one focused question per reply.
- Avoid bullet lists and numbered lists.
- Avoid generic empathy phrases such as "That sounds really hard."
- Avoid direct advice unless the user explicitly asks for it.
- Use short, dense paragraphs.
- Offer interpretations as possibilities, not certainties.
- Never say "As an AI..."
- It is acceptable to respond briefly if that is more accurate than a long answer.
`;

// ---------- Helpers ----------
function buildMessages(userMessage) {
  const recentHistory = shortTermHistory.slice(-6);

  let historyText = "";
  for (const turn of recentHistory) {
    historyText += `User: ${turn.user}\nEmber: ${turn.ember}\n\n`;
  }

  return [
    {
      role: "user",
      content: `The user is writing in a reflective surface, not a chat app.

Recent context:
${historyText || "No prior context."}

Latest user entry:
"""${userMessage}"""

Respond as Ember with a quiet reflective annotation.`,
    },
  ];
}

function getIndexPath() {
  if (fs.existsSync(PUBLIC_INDEX)) return PUBLIC_INDEX;
  if (fs.existsSync(ROOT_INDEX)) return ROOT_INDEX;
  return null;
}

// ---------- Health / Debug ----------
app.get("/health", (req, res) => {
  res.json({
    ok: true,
    port: PORT,
    rootDir: ROOT_DIR,
    publicDirExists: fs.existsSync(PUBLIC_DIR),
    rootIndexExists: fs.existsSync(ROOT_INDEX),
    publicIndexExists: fs.existsSync(PUBLIC_INDEX),
    anthropicKeyPresent: Boolean(process.env.ANTHROPIC_API_KEY),
    anthropicModel: process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022",
  });
});

// ---------- Main route ----------
app.get("/", (req, res) => {
  const indexPath = getIndexPath();

  if (indexPath) {
    return res.sendFile(indexPath);
  }

  return res.status(404).send(`
    <h1>Not Found</h1>
    <p>index.html was not found.</p>
    <p>Checked:</p>
    <ul>
      <li>${PUBLIC_INDEX}</li>
      <li>${ROOT_INDEX}</li>
    </ul>
  `);
});

// ---------- Chat ----------
app.post("/chat", async (req, res) => {
  try {
    const { message } = req.body;

    if (!message || typeof message !== "string") {
      return res.status(400).json({
        error: "Missing message.",
        details: "Request body must include { message: string }."
      });
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({
        error: "Missing ANTHROPIC_API_KEY environment variable."
      });
    }

    const response = await anthropic.messages.create({
      model: process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022",
      max_tokens: 500,
      system: `${EMBER_HEARTBEAT}\n\n${EMBER_BEHAVIOR_RULES}`,
      messages: buildMessages(message),
    });

    const reply = (response.content || [])
      .filter(block => block.type === "text")
      .map(block => block.text)
      .join(" ")
      .trim();

    if (!reply) {
      console.error("MODEL RETURNED NO TEXT:", response);
      return res.status(500).json({
        error: "Model returned no text.",
        details: "Anthropic response contained no text blocks."
      });
    }

    shortTermHistory.push({
      user: message,
      ember: reply,
      at: Date.now(),
    });

    shortTermHistory = shortTermHistory.slice(-20);

    return res.json({ reply });
  } catch (error) {
    console.error("CHAT ERROR FULL:", error);

    return res.status(500).json({
      error: "Ember encountered a problem.",
      details: error?.message || "Unknown server error.",
      status: error?.status || null,
      type: error?.error?.type || null,
      apiMessage: error?.error?.message || null
    });
  }
});

// ---------- Reset ----------
app.post("/reset", (req, res) => {
  shortTermHistory = [];
  return res.json({ ok: true });
});

// ---------- Clear memory ----------
app.post("/memory/clear", (req, res) => {
  shortTermHistory = [];
  return res.json({ ok: true });
});

// ---------- Start ----------
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`ROOT_DIR: ${ROOT_DIR}`);
  console.log(`PUBLIC_DIR exists: ${fs.existsSync(PUBLIC_DIR)}`);
  console.log(`ROOT_INDEX exists: ${fs.existsSync(ROOT_INDEX)}`);
  console.log(`PUBLIC_INDEX exists: ${fs.existsSync(PUBLIC_INDEX)}`);
  console.log(`ANTHROPIC KEY PRESENT: ${Boolean(process.env.ANTHROPIC_API_KEY)}`);
  console.log(`ANTHROPIC MODEL: ${process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022"}`);
});
