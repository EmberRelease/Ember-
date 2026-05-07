const express = require("express");
const session = require("express-session");
const path = require("path");
const Anthropic = require("@anthropic-ai/sdk");
const {
  ensureMemoryFile,
  updateMemory,
  getMemory,
  clearMemory,
  formatMemoryForPrompt
} = require("./memory");

const app = express();
const PORT = process.env.PORT || 3000;

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

ensureMemoryFile();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    secret: process.env.SESSION_SECRET || "ember-dev-secret-change-this",
    resave: false,
    saveUninitialized: true,
    cookie: {
      secure: false,
      httpOnly: true,
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 24 * 7
    }
  })
);

app.use((req, res, next) => {
  if (!req.session.conversation) {
    req.session.conversation = [];
  }
  next();
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/memory", (req, res) => {
  const memory = getMemory(req.sessionID);
  res.json({
    sessionId: req.sessionID,
    memory
  });
});

app.post("/memory/clear", (req, res) => {
  clearMemory(req.sessionID);
  res.json({
    ok: true,
    message: "Persistent memory cleared."
  });
});

app.post("/reset", (req, res) => {
  req.session.conversation = [];
  res.json({
    ok: true,
    message: "Conversation reset."
  });
});

app.post("/chat", async (req, res) => {
  try {
    const userMessage = String(req.body.message || "").trim();

    if (!userMessage) {
      return res.status(400).json({
        error: "Message is required."
      });
    }

    req.session.conversation.push({
      role: "user",
      content: userMessage
    });

    updateMemory(req.sessionID, userMessage);
    const memory = getMemory(req.sessionID);
    const memoryBlock = formatMemoryForPrompt(memory);

    const recentConversation = req.session.conversation.slice(-10).map((item) => ({
      role: item.role,
      content: item.content
    }));

    const systemPrompt = [
      "You are Ember.",
      "Ember is calm, perceptive, emotionally intelligent, and precise.",
      "Do not sound generic, corporate, or like a productivity assistant.",
      "Prefer clarity, warmth, directness, and emotional accuracy.",
      "Keep responses grounded and natural.",
      "Use the memory context only when it genuinely helps continuity.",
      "Do not mention hidden memory unless the user asks.",
      "",
      "Relevant memory:",
      memoryBlock
    ].join("\n");

    const response = await anthropic.messages.create({
      model: "claude-3-7-sonnet-latest",
      max_tokens: 700,
      system: systemPrompt,
      messages: recentConversation
    });

    const reply =
      response.content &&
      response.content[0] &&
      response.content[0].type === "text"
        ? response.content[0].text
        : "I’m here, but I couldn’t form a proper response.";

    req.session.conversation.push({
      role: "assistant",
      content: reply
    });

    res.json({
      reply
    });
  } catch (error) {
    console.error("Chat error:", error);

    res.status(500).json({
      error: error.message || "Something went wrong."
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
