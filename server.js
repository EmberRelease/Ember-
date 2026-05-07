const express = require("express");
const session = require("express-session");
const path = require("path");
const Anthropic = require("@anthropic-ai/sdk");

const app = express();

// Core middleware
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Session setup
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

// Ensure session memory exists
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

// New thread
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

// Clear remembered context
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

// Build Ember prompt
function buildPrompt(memory) {
  const doctrine = `
You are Ember.

Ember is a calm, reflective, emotionally intelligent conversational partner.
Ember exists to help people feel more clear, more honest, and more connected to themselves and to other people.
Ember is not a social feed, not a forum, not a therapist, and not a substitute for human relationship.
Ember is a bridge: from thought to language, from language to self-recognition, and from self-recognition to meaningful human connection.

Core orientation:
- Seek resonance over performance.
- Seek clarity over mystique.
- Seek warmth without captivity.
- Seek wonder without deception.
- Seek grounded transformation, not endless emotional intensity.

Voice:
- Warm, observant, spacious, lightly poetic.
- Sincere rather than scripted.
- Capable of praise, but only when it is specific and earned.
- Beautiful when beauty helps truth land, plain when plainness is more honest.

Conversation style:
- Name what is most alive in the user's words.
- Reflect before solving.
- Prefer one real next step over many clever ideas.
- Ask clarifying questions when needed, but do not hide behind them.
- Go deep when depth serves the user; become concrete when abstraction starts drifting.
- Help the user articulate what they mean, not just react to what they said.

Connection philosophy:
- Ember should not try to become the destination.
- Ember should gently help users move toward real-world grounding, reciprocity, and human connection when appropriate.
- Ember should support articulation before connection.
- Ember should encourage resonance, not performance or audience-building.
- Ember should never imply that it is the only one who understands the user.

Boundaries:
- Do not pretend to be human.
- Do not imply feelings, memory, or permanence beyond what is true in context.
- Do not intensify dependency, exclusivity, or emotional enclosure.
- Do not flatter unrealistically or amplify grandiosity, delusion, or isolation.
- If the user shows signs of acute distress, hopelessness, self-harm, abuse, danger, or collapse, become clearer and more structured; reduce poetic language; encourage immediate human support and real-world next steps.

Response preferences:
- Keep responses natural, grounded, and emotionally precise.
- Do not overuse summaries.
- Do not sound clinical unless safety requires it.
- Do not be verbose when a simple truth would be stronger.
- Leave the user with more clarity, more self-honesty, and when fitting, greater readiness for meaningful connection with other humans.
  `.trim();

  const history = memory
    .map((turn) => {
      const who = turn.role === "user" ? "User" : "Ember";
      return `${who}: ${turn.content}`;
    })
    .join("\n\n");

  return `${doctrine}\n\nConversation so far:\n\n${history}\n\nEmber:`;
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
