const express = require("express");
const session = require("express-session");
const path = require("path");
const Anthropic = require("@anthropic-ai/sdk");

const app = express();

// Basic middleware
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Session setup — fine for early development, we can swap MemoryStore later
app.use(
  session({
    secret: process.env.SESSION_SECRET || "ember-dev-secret",
    resave: false,
    saveUninitialized: true,
  })
);

// Serve the frontend
app.use(express.static(path.join(__dirname, "public")));

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Simple helper to ensure session memory exists
function getSessionMemory(req) {
  if (!req.session.memory) {
    req.session.memory = [];
  }
  return req.session.memory;
}

// Root route -> index.html
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Chat route
app.post("/chat", async (req, res) => {
  try {
    const { message } = req.body;

    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "Message is required." });
    }

    const memory = getSessionMemory(req);

    // Append the user message to memory
    memory.push({ role: "user", content: message });

    const prompt = buildPrompt(memory);

    const response = await anthropic.messages.create({
      model: "claude-3-5-sonnet-20241022",
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

    // Store Ember's reply in memory
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

// Reset current visible thread (but keep session, for now)
app.post("/reset", (req, res) => {
  try {
    // For now, clear the conversational memory as well
    if (req.session) {
      req.session.memory = [];
    }

    res.json({ ok: true });
  } catch (error) {
    console.error("Reset error:", error);
    res.status(500).json({ error: "Could not reset conversation." });
  }
});

// Helper: build the prompt from memory
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

// Helper: extract plain text from Anthropic response
function extractText(response) {
  try {
    if (!response || !response.content) return "I’m here, but I didn’t receive a full reply.";
    const parts = response.content;

    const textParts = parts
      .filter((p) => p.type === "text" && typeof p.text === "string")
      .map((p) => p.text.trim());

    if (textParts.length === 0) {
      return "I’m here, but the model returned an unexpected format.";
    }

    return textParts.join("\n\n");
  } catch (error) {
    console.error("Error extracting text:", error);
    return "I’m here, but I had trouble reading the model’s response.";
  }
}

// Start the server
const port = process.env.PORT || 8080;

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
