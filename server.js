// QuickBot Web Server
// Serves the UI and handles chat API requests

import "dotenv/config";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { runAgent, checkProvider, MODEL, PROVIDER } from "./agent.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Store conversations in memory (per session, resets on restart)
// Each entry: { messages, lastAccessed }. Evicted after CONVERSATION_TTL_MS of inactivity.
const conversations = new Map();
const CONVERSATION_TTL_MS = 60 * 60 * 1000; // 1 hour
const CONVERSATION_MAX = 1000;

setInterval(() => {
  const cutoff = Date.now() - CONVERSATION_TTL_MS;
  for (const [id, convo] of conversations) {
    if (convo.lastAccessed < cutoff) conversations.delete(id);
  }
}, 10 * 60 * 1000).unref();

// ---- Health check / status ----
app.get("/api/status", async (req, res) => {
  const status = await checkProvider();
  res.json(status);
});

// ---- Chat endpoint ----
app.post("/api/chat", async (req, res) => {
  const { message, conversationId } = req.body;

  if (!message || !message.trim()) {
    return res.status(400).json({ error: "Message is required" });
  }

  // Get or create conversation
  const convoId = conversationId || crypto.randomUUID();
  let convo = conversations.get(convoId);
  if (!convo) {
    // Hard cap: evict oldest entry if at capacity
    if (conversations.size >= CONVERSATION_MAX) {
      const oldestId = conversations.keys().next().value;
      conversations.delete(oldestId);
    }
    convo = { messages: [], lastAccessed: Date.now() };
    conversations.set(convoId, convo);
  }
  convo.lastAccessed = Date.now();

  const messages = convo.messages;
  messages.push({ role: "user", content: message.trim() });

  try {
    const result = await runAgent(messages);

    // Save assistant response to conversation
    messages.push({ role: "assistant", content: result.response });

    res.json({
      conversationId: convoId,
      response: result.response,
      steps: result.steps,
      toolCalls: result.toolCalls,
    });
  } catch (err) {
    console.error("Agent error:", err.message);
    res.status(500).json({ error: `Agent error: ${err.message}` });
  }
});

// ---- Clear conversation ----
app.delete("/api/conversation/:id", (req, res) => {
  conversations.delete(req.params.id);
  res.json({ success: true });
});

// ---- Start server ----
async function start() {
  const status = await checkProvider();

  if (!status.connected) {
    if (PROVIDER === "groq") {
      console.log(`❌ Groq: ${status.error || "Cannot connect"}`);
      console.log("   Get a free API key at console.groq.com and add to .env\n");
    } else {
      console.log("❌ Cannot connect to Ollama. Make sure it's running:");
      console.log("   ollama serve\n");
    }
    process.exit(1);
  }

  if (!status.hasModel) {
    console.log(`⚠️  Model "${MODEL}" not found. Pull it first:`);
    console.log(`   ollama pull ${MODEL}\n`);
    console.log(`Available models: ${status.availableModels.join(", ")}\n`);
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log(`\n🤖 QuickBot Server running!`);
    console.log(`   Provider: ${PROVIDER.toUpperCase()}`);
    console.log(`   Model:    ${MODEL}`);
    console.log(`   URL:      http://localhost:${PORT}\n`);
  });
}

start();
