const express = require("express");
const session = require("express-session");
const path = require("path");
const Anthropic = require("@anthropic-ai/sdk");

const app = express();

// Core middleware
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Session setup (MemoryStore is OK for early development)
app.use(
  session({
    secret: process.env.SESSION_SECRET || "ember-dev-secret",
    resave: false,
    saveUninitialized: true,
  })
);

// Serve static frontend from ./public
app.use(express.static(path.join(__dirname, "public")));

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Ensure a memory array exists on the session
function getSessionMemory(req) {
  if (!req.session.memory) {
    req.session.memory = [];
  }
  return req.session.memory;
}

// Root route -> public/index.html
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Main chat route
app.post("/chat", async (req, res) => {
  try {
    const { message } = req.body;

    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "Message is required." });
    }

    const memory = getSessionMemory(req);
    memory.push({ role: "user", content: message });

    const prompt = buildPrompt(memory);

    const response = await anthropic.messages.create({
      // IMPORTANT: replace this with the exact current Sonnet/Claude model
      // name shown in your Anthropic dashboard if needed.
      model: "claude-sonnet-4-6",
      max_tokens: 800,
      temperature: 0.4,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    const replyText = extractText(response);
    memory.push({ role: "assistant", content: replyText });

    res.json({ reply: replyText });
  } catch (error) {
    console.error("Chat error:", error);
    res.status(500).json({
      error:
        "Ember ran into an issue reaching the model just now. Please try again.",
    });
  }
});

// New thread (UI reset) — clears visible thread, not whole session identity
app.post("/reset", (req, res) => {
  try {
    if (req.session) {
      req.session.thread = [];
    }

    res.json({ ok: true });
  } catch (error) {
    console.error("Reset error:", error);
    res.status(500).json({ error: "Could not reset conversation." });
  }
});

// Clear remembered context — stronger operation than /reset
app.post("/memory/clear", (req, res) => {
  try {
    if (req.session) {
      req.session.memory = [];
      req.session.thread = [];
    }

    res.json({ ok: true, message: "Memory cleared." });
  } catch (error) {
    console.error("Memory clear error:", error);
    res.status(500).json({ error: "Could not clear memory." });
  }
});

// Build the conversational prompt from memory
function buildPrompt(memory) {
  const intro = `
You are Ember, a calm, reflective conversational partner.
You speak in clear, grounded language.
You help the user think through decisions, fears, ideas, and half-formed questions.

Guidelines:
- Stay warm but not cheesy.
- Prefer depth over breadth.
- Ask gentle clarifying questions when needed.
- Summarize what you heard before suggesting next steps.
  `.trim();

  const history = memory
    .map((turn) => {
      const who = turn.role === "user" ? "User" : "Ember";
      return `${who}: ${turn.content}`;
    })
    .join("\n\n");

  return `${intro}\n\nConversation so far:\n\n${history}\n\nEmber:`;
}

// Extract plain text from Anthropic response
function extractText(response) {
  try {
    if (!response || !response.content) {
      return "I’m here, but I didn’t receive a full reply.";
    }

    const textParts = response.content
      .filter((part) => part.type === "text" && typeof part.text === "string")
      .map((part) => part.text.trim());

    if (textParts.length === 0) {
      return "I’m here, but the model returned an unexpected format.";
    }

    return textParts.join("\n\n");
  } catch (error) {
    console.error("Error extracting text:", error);
    return "I’m here, but I had trouble reading the model’s response.";
  }
}

// Start server
const port = process.env.PORT || 8080;

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
