const express = require("express");
const cors = require("cors");
const Anthropic = require("@anthropic-ai/sdk");

const app = express();
app.use(cors());
app.use(express.json());

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

app.get("/", (req, res) => {
  res.json({ ok: true, message: "Ember backend is alive." });
});

app.post("/chat", async (req, res) => {
  try {
    const userMessage = req.body.message;

    if (!userMessage) {
      return res.status(400).json({ error: "Missing message" });
    }

    const response = await anthropic.messages.create({
      model: "model: "claude-sonnet-4-5",",
      max_tokens: 400,
      system: "You are Ember, a calm reflective AI. Be clear, warm, honest, and concise. Do not pretend to be human.",
      messages: [
        { role: "user", content: userMessage }
      ]
    });

    const text = response.content
      .filter(block => block.type === "text")
      .map(block => block.text)
      .join("\\n");

    res.json({ reply: text });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server error talking to Claude." });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
