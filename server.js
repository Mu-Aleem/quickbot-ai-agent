// QuickBot Web Server
// Serves the UI and handles chat API requests

import "dotenv/config";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { runAgent, checkOllama, MODEL, PROVIDER } from "./agent.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Store conversations in memory (per session, resets on restart)
const conversations = new Map();

// ---- Health check / status ----
app.get("/api/status", async (req, res) => {
  const status = await checkOllama();
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
  if (!conversations.has(convoId)) {
    conversations.set(convoId, []);
  }

  const messages = conversations.get(convoId);
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
    res.status(500).json({
      error: err.message.includes("Ollama")
        ? "Cannot connect to Ollama. Make sure it's running: ollama serve"
        : `Agent error: ${err.message}`,
    });
  }
});

// ---- Clear conversation ----
app.delete("/api/conversation/:id", (req, res) => {
  conversations.delete(req.params.id);
  res.json({ success: true });
});

// ---- Start server ----
async function start() {
  const status = await checkOllama();

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
