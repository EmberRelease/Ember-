const path = require("path");
const express = require("express");
const Anthropic = require("@anthropic-ai/sdk");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname)));

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

let shortTermHistory = [];

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

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.post("/chat", async (req, res) => {
  try {
    const { message } = req.body;

    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "Missing message." });
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({
        error: "Missing ANTHROPIC_API_KEY environment variable.",
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
      return res.status(500).json({ error: "Model returned no text." });
    }

    shortTermHistory.push({
      user: message,
      ember: reply,
      at: Date.now(),
    });

    shortTermHistory = shortTermHistory.slice(-20);

    return res.json({ reply });
  } catch (error) {
    console.error("CHAT ERROR:", error);
    return res.status(500).json({
      error: "Ember encountered a problem.",
      details: error.message || "Unknown server error.",
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

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
