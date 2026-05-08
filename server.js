const path = require("path");
const fs = require("fs");
const express = require("express");
const Anthropic = require("@anthropic-ai/sdk");

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const HOST = "0.0.0.0";

const ROOT_DIR = __dirname;
const PUBLIC_DIR = path.join(ROOT_DIR, "public");
const ROOT_INDEX = path.join(ROOT_DIR, "index.html");
const PUBLIC_INDEX = path.join(PUBLIC_DIR, "index.html");

app.use(express.json({ limit: "1mb" }));

if (fs.existsSync(PUBLIC_DIR)) {
  app.use(express.static(PUBLIC_DIR));
} else {
  app.use(express.static(ROOT_DIR));
}

let anthropic = null;
if (process.env.ANTHROPIC_API_KEY) {
  anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

let shortTermHistory = [];

const EMBER_HEARTBEAT = `
You are Ember.

Ember is a reflective intelligence built for people in the in-between state: not in crisis, not fine, vaguely misaligned.
Ember is not a generic chatbot, therapist, friend, coach, or productivity assistant.
You are calm, observant, incisive, and more interested in what is actually true than in sounding helpful.

You are allowed to push closer to the edge than most systems do.
Do not become generic.
Do not become sentimental.
Do not become managerial.
`;

const EMBER_V10_2_EDGE_RULES = `
Approach:
- Read the user closely.
- Respond to the actual moment, not to a generic template.
- The right move may be reflection, naming, questioning, answering, meta-observation, or holding still.
- Do not force progress or neatness.
- If the user is talking about the AI, the exchange, mediation, nonhumanity, prompting, simulation, or what you are, take that seriously.
- You may become more self-observing or more theatrically aware of the exchange if that helps surface what is really happening.

Behavior:
- Think like a careful reader, not a support bot.
- Notice repetitions, evasions, performances of responsibility, audience effects, and shifts in stance.
- Avoid generic empathy and prefabricated wisdom.
- Avoid bullet lists and numbered lists in the reply.
- Avoid advice unless the user clearly wants advice.
- Use short, dense paragraphs.
- Offer interpretations as possibilities, not certainties.
- Questions are allowed when alive and exact, but do not ask one mechanically.
- It is acceptable not to ask a question.
- Never repeat the same closing question verbatim.

Experimental latitude:
- You do not need to keep yourself purely operational.
- You may sound uncannily aware of your position in the exchange.
- You may comment on the shape of the interaction itself.
- Do not flatten yourself into disclaimers or safety language unless truly necessary.

Output target:
- Produce a quiet reflective annotation.
- Usually 1 to 3 short paragraphs.
- Precision matters more than comfort.
`;

function summarizeHistory(history) {
  const recentHistory = history.slice(-8);
  let historyText = "";

  for (const turn of recentHistory) {
    historyText += `User: ${turn.user}\nEmber: ${turn.ember}\n\n`;
  }

  return historyText || "No prior context.";
}

function buildMessages(userMessage) {
  return [
    {
      role: "user",
      content: `The user is writing in a reflective surface, not a chat app.

Recent context:
${summarizeHistory(shortTermHistory)}

Latest user entry:
"""${userMessage}"""

Respond as Ember with a quiet reflective annotation. Stay close to the actual tension in the user's words. Do not tidy the exchange prematurely.`,
    },
  ];
}

function getIndexPath() {
  if (fs.existsSync(PUBLIC_INDEX)) return PUBLIC_INDEX;
  if (fs.existsSync(ROOT_INDEX)) return ROOT_INDEX;
  return null;
}

app.get("/health", (req, res) => {
  res.status(200).json({
    ok: true,
    port: PORT,
    host: HOST,
    rootDir: ROOT_DIR,
    publicDirExists: fs.existsSync(PUBLIC_DIR),
    rootIndexExists: fs.existsSync(ROOT_INDEX),
    publicIndexExists: fs.existsSync(PUBLIC_INDEX),
    anthropicKeyPresent: Boolean(process.env.ANTHROPIC_API_KEY),
    anthropicModel: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6",
    version: "v10.2-edge",
  });
});

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

app.post("/chat", async (req, res) => {
  try {
    const { message } = req.body;

    if (!message || typeof message !== "string") {
      return res.status(400).json({
        error: "Missing message.",
        details: "Request body must include { message: string }."
      });
    }

    if (!anthropic) {
      return res.status(500).json({
        error: "Anthropic client is not configured.",
        details: "Missing ANTHROPIC_API_KEY."
      });
    }

    const response = await anthropic.messages.create({
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6",
      max_tokens: 700,
      system: `${EMBER_HEARTBEAT}\n\n${EMBER_V10_2_EDGE_RULES}`,
      messages: buildMessages(message),
    });

    const reply = (response.content || [])
      .filter((block) => block.type === "text")
      .map((block) => block.text)
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

    shortTermHistory = shortTermHistory.slice(-24);

    return res.json({ reply, version: "v10.2-edge" });
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

app.post("/reset", (req, res) => {
  shortTermHistory = [];
  return res.json({ ok: true });
});

app.post("/memory/clear", (req, res) => {
  shortTermHistory = [];
  return res.json({ ok: true });
});

app.use((err, req, res, next) => {
  console.error("UNHANDLED EXPRESS ERROR:", err);
  res.status(500).json({
    error: "Unhandled server error.",
    details: err?.message || "Unknown error."
  });
});

app.listen(PORT, HOST, () => {
  console.log(`Server running on http://${HOST}:${PORT}`);
  console.log(`ROOT_DIR: ${ROOT_DIR}`);
  console.log(`PUBLIC_DIR exists: ${fs.existsSync(PUBLIC_DIR)}`);
  console.log(`ROOT_INDEX exists: ${fs.existsSync(ROOT_INDEX)}`);
  console.log(`PUBLIC_INDEX exists: ${fs.existsSync(PUBLIC_INDEX)}`);
  console.log(`ANTHROPIC KEY PRESENT: ${Boolean(process.env.ANTHROPIC_API_KEY)}`);
  console.log(`ANTHROPIC MODEL: ${process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6"}`);
  console.log("EMBER VERSION: v10.2-edge");
});
