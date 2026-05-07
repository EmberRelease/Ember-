const fs = require("fs");
const path = require("path");

const dataDir = path.join(__dirname, "data");
const memoryFile = path.join(dataDir, "memories.json");

function ensureMemoryFile() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  if (!fs.existsSync(memoryFile)) {
    fs.writeFileSync(memoryFile, JSON.stringify({}, null, 2), "utf8");
  }
}

function readMemoryStore() {
  ensureMemoryFile();

  try {
    const raw = fs.readFileSync(memoryFile, "utf8");
    return JSON.parse(raw || "{}");
  } catch (error) {
    console.error("Failed to read memory store:", error);
    return {};
  }
}

function writeMemoryStore(store) {
  ensureMemoryFile();

  try {
    fs.writeFileSync(memoryFile, JSON.stringify(store, null, 2), "utf8");
  } catch (error) {
    console.error("Failed to write memory store:", error);
  }
}

function ensureSessionMemory(store, sessionId) {
  if (!store[sessionId]) {
    store[sessionId] = {
      facts: [],
      themes: [],
      tensions: [],
      preferences: [],
      updatedAt: new Date().toISOString()
    };
  }

  return store[sessionId];
}

function normalizeText(value) {
  return String(value || "").trim();
}

function pushUnique(list, value, maxItems = 8) {
  const clean = normalizeText(value);
  if (!clean) return list;

  const exists = list.some(
    (item) => item.toLowerCase() === clean.toLowerCase()
  );

  if (!exists) {
    list.push(clean);
  }

  return list.slice(-maxItems);
}

function inferMemoriesFromMessage(message) {
  const text = normalizeText(message);
  const lowered = text.toLowerCase();

  const result = {
    facts: [],
    themes: [],
    tensions: [],
    preferences: []
  };

  if (!text) {
    return result;
  }

  if (lowered.includes("ember")) {
    result.facts.push("User is building Ember.");
  }

  if (
    lowered.includes("lonely") ||
    lowered.includes("alone") ||
    lowered.includes("connection") ||
    lowered.includes("connected")
  ) {
    result.themes.push("Connection and loneliness");
  }

  if (
    lowered.includes("create") ||
    lowered.includes("building") ||
    lowered.includes("vision") ||
    lowered.includes("product")
  ) {
    result.themes.push("Creation and product vision");
  }

  if (
    lowered.includes("private") ||
    lowered.includes("privacy") ||
    lowered.includes("no profile") ||
    lowered.includes("no profiles") ||
    lowered.includes("followers")
  ) {
    result.preferences.push("Values privacy and non-performative interaction.");
  }

  if (
    lowered.includes("not a chatbot") ||
    lowered.includes("not another ai") ||
    lowered.includes("unique")
  ) {
    result.tensions.push("Wants Ember to be distinct from generic AI chat products.");
  }

  if (
    lowered.includes("human connection") ||
    lowered.includes("non human connection") ||
    lowered.includes("without people")
  ) {
    result.tensions.push("Exploring connection outside traditional social interaction.");
  }

  return result;
}

function updateMemory(sessionId, userMessage) {
  const store = readMemoryStore();
  const memory = ensureSessionMemory(store, sessionId);
  const inferred = inferMemoriesFromMessage(userMessage);

  inferred.facts.forEach((item) => {
    memory.facts = pushUnique(memory.facts, item);
  });

  inferred.themes.forEach((item) => {
    memory.themes = pushUnique(memory.themes, item);
  });

  inferred.tensions.forEach((item) => {
    memory.tensions = pushUnique(memory.tensions, item);
  });

  inferred.preferences.forEach((item) => {
    memory.preferences = pushUnique(memory.preferences, item);
  });

  memory.updatedAt = new Date().toISOString();

  store[sessionId] = memory;
  writeMemoryStore(store);

  return memory;
}

function getMemory(sessionId) {
  const store = readMemoryStore();
  return (
    store[sessionId] || {
      facts: [],
      themes: [],
      tensions: [],
      preferences: [],
      updatedAt: null
    }
  );
}

function clearMemory(sessionId) {
  const store = readMemoryStore();

  if (store[sessionId]) {
    delete store[sessionId];
    writeMemoryStore(store);
  }

  return {
    ok: true
  };
}

function formatMemoryForPrompt(memory) {
  const lines = [];

  if (memory.facts?.length) {
    lines.push(`Facts: ${memory.facts.join("; ")}`);
  }

  if (memory.themes?.length) {
    lines.push(`Themes: ${memory.themes.join("; ")}`);
  }

  if (memory.tensions?.length) {
    lines.push(`Tensions: ${memory.tensions.join("; ")}`);
  }

  if (memory.preferences?.length) {
    lines.push(`Preferences: ${memory.preferences.join("; ")}`);
  }

  if (!lines.length) {
    return "No saved memory yet.";
  }

  return lines.join("\n");
}

module.exports = {
  ensureMemoryFile,
  updateMemory,
  getMemory,
  clearMemory,
  formatMemoryForPrompt
};
