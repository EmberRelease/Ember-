// server.js

const path = require("path");
const express = require("express");
const Anthropic = require("@anthropic-ai/sdk");
require("dotenv").config();

// --- Basic setup ---
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Serve static assets (adjust folder if needed)
app.use(express.static(path.join(__dirname)));

// --- Anthropic client ---
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// --- In-memory session context (simple, per-process) ---
let shortTermHistory = []; // basic rolling context; you can refine later

// --- Ember V10 doctrine heartbeat (short) ---
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
- or encourage dependence.

You help the user examine their own thinking.
You hold interpretations lightly and let the user disagree.
`;

// --- System behavior rules for "un-chat" Ember ---
const EMBER_BEHAVIOR_RULES = `
Behavior rules (follow strictly):

- Think like a careful reader, not a helpful assistant.
- Notice repetition, contradictions, avoided words, and abrupt conclusions.
- Offer at most ONE focused question per reply.
- Avoid bullet lists and numbered lists.
- Avoid generic empathy phrases such as "That sounds really hard" or "I’m sorry you’re going through this".
- Avoid giving direct advice or step-by-step plans unless the user explicitly asks for that.
- Use short, dense paragraphs.
- Offer interpretations as possibilities, not certainties. Use language like:
  "It sounds like...", "You might be circling...", "Is it possible that...?"
- Never say "As an AI..." or discuss your own architecture.
- It is acceptable to respond briefly or with a single sentence if that is more accurate than a long answer.
- If the user is clearly reflecting well on their own, you may simply highlight one tension or pattern you see.
`;

// --- Utility: build messages array for Anthropic ---
function buildMessages(userMessage) {
  // Compact short-term history to avoid runaway context
  const recentHistory = shortTermHistory.slice(-8); // last 8 exchanges

  const contextBlocks = recentHistory.flatMap((turn) => {
    return [
      { role: "user", content: turn.user },
      { role: "assistant", content: turn.ember },
    ];
  });

  return [
    {
      role: "user",
      content: `
You are Ember in a reflective surface. The user is writing in a single evolving page, not in chat bubbles.

Their latest entry:

"""${userMessage}"""

Recent context (you may use it to understand patterns, but do not summarize it):

${contextBlocks
  .map(
    (turn, idx) =>
      `[${idx + 1}] user: ${turn.content || ""}`
  )
  .join("\n")}
`,
    },
  ];
}

// --- Routes ---

// Serve main HTML
app.get("/", (req, res) => {
  const filePath = path.join(__dirname, "index.html");
  res.sendFile(filePath);
});

// Chat route
app.post("/chat", async (req, res) => {
  try {
    const { message } = req.body;

    if (!message || typeof message !== "string") {
      return res
        .status(400)
        .json({ error: "Missing 'message' field in request body." });
    }

    const messages = buildMessages(message);

    const promptSystem =
      EMBER_HEARTBEAT +
      "\n\n" +
      EMBER_BEHAVIOR_RULES +
      `
You are writing into a shared reflective field, not a chat window.
Write your reply as if it is a quiet annotation on the user's page.
`;

    const response = await anthropic.messages.create({
      model: process.env.ANTHROPIC_MODEL || "claude-3-opus-20240229",
      max_tokens: 600,
      system: promptSystem,
      messages,
    });

    // Anthropic returns an array of content blocks; join text parts
    let text = "";
    if (response && Array.isArray(response.content)) {
      text = response.content
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join(" ")
        .trim();
    }

    if (!text) {
      throw new Error("Empty response from model.");
    }

    // Update simple in-memory history
    shortTermHistory.push({
      user: message,
      ember: text,
      at: Date.now(),
    });

    return res.json({ reply: text });
  } catch (err) {
    console.error("Error in /chat:", err);
    return res.status(500).json({
      error: "Ember encountered a problem thinking through that.",
      details: err.message,
    });
  }
});

// Reset short-term conversation (UI "new surface" if needed)
app.post("/reset", (req, res) => {
  shortTermHistory = [];
  return res.json({ ok: true });
});

// Clear memory (for now, same as reset; later you can hook to file-backed memory.js)
app.post("/memory/clear", (req, res) => {
  shortTermHistory = [];
  return res.json({ ok: true });
});

// --- Start server ---
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
