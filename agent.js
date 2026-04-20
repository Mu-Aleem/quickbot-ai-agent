// Agent Loop — The brain of QuickBot
// Supports two providers: "ollama" (local, slow) or "groq" (cloud, fast & free)

import { tools } from "./tools.js";
import { executeTool } from "./executor.js";

// ============================================================
// PROVIDER CONFIG — switch between Ollama and Groq
// ============================================================
const PROVIDER = (process.env.PROVIDER || "ollama").toLowerCase();

// Ollama config
const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "qwen2.5:3b";

// Groq config
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

// Which model name to display in UI
export const MODEL = PROVIDER === "groq" ? GROQ_MODEL : OLLAMA_MODEL;

const MAX_STEPS = 10;

const SYSTEM_PROMPT = `You are QuickBot, a helpful AI assistant with tools.
Use tools for math, weather, web search, notes, and current date/time.
Be concise. For questions you can answer from knowledge, respond directly without tools.`;

// ============================================================
// OLLAMA API CALL
// ============================================================
async function callOllama(messages) {
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      messages,
      tools,
      stream: false,
      keep_alive: "10m",
      options: {
        num_predict: 512,
        temperature: 0.3,
        num_ctx: 4096,
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Ollama error (${res.status}): ${text}`);
  }

  const data = await res.json();
  return data.message; // { role, content, tool_calls }
}

// ============================================================
// GROQ API CALL (OpenAI-compatible)
// ============================================================
async function callGroq(messages, { allowTools = true } = {}) {
  if (!GROQ_API_KEY || GROQ_API_KEY === "your_groq_api_key_here") {
    throw new Error("GROQ_API_KEY not set. Get one free at console.groq.com and add it to .env");
  }

  const body = {
    model: GROQ_MODEL,
    messages,
    temperature: 0.3,
    max_tokens: 1024,
    stream: false,
  };

  if (allowTools) {
    body.tools = tools;
  }

  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    const err = errData.error || {};

    // Log full error to server console
    console.error("Groq API error:", JSON.stringify(errData, null, 2));

    // Graceful fallback: if tool call generation failed, retry WITHOUT tools
    // This lets the model just answer directly from its knowledge
    if (
      allowTools &&
      (err.code === "tool_use_failed" ||
        err.message?.includes("Failed to call a function"))
    ) {
      console.log("⚠️  Tool call failed — retrying without tools...");
      return callGroq(messages, { allowTools: false });
    }

    const details = err.failed_generation
      ? ` | Raw output: ${String(err.failed_generation).substring(0, 150)}`
      : "";

    throw new Error(`Groq error (${res.status}): ${err.message || "unknown"}${details}`);
  }

  const data = await res.json();
  return data.choices[0].message;
}

// ============================================================
// UNIFIED CALL — picks provider based on env
// ============================================================
async function callModel(messages) {
  if (PROVIDER === "groq") return callGroq(messages);
  return callOllama(messages);
}

// ============================================================
// CHECK PROVIDER STATUS
// ============================================================
export async function checkOllama() {
  // Groq check
  if (PROVIDER === "groq") {
    if (!GROQ_API_KEY || GROQ_API_KEY === "your_groq_api_key_here") {
      return {
        connected: false,
        hasModel: false,
        model: GROQ_MODEL,
        provider: "groq",
        error: "GROQ_API_KEY not set in .env",
      };
    }

    try {
      const res = await fetch("https://api.groq.com/openai/v1/models", {
        headers: { Authorization: `Bearer ${GROQ_API_KEY}` },
      });
      if (!res.ok) {
        return {
          connected: false,
          hasModel: false,
          model: GROQ_MODEL,
          provider: "groq",
          error: "Invalid GROQ_API_KEY or Groq API unreachable",
        };
      }
      return {
        connected: true,
        hasModel: true,
        model: GROQ_MODEL,
        provider: "groq",
      };
    } catch {
      return {
        connected: false,
        hasModel: false,
        model: GROQ_MODEL,
        provider: "groq",
        error: "Cannot reach Groq API (check internet)",
      };
    }
  }

  // Ollama check
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`);
    if (!res.ok) throw new Error();
    const data = await res.json();
    const modelNames = data.models.map((m) => m.name);
    const hasModel = modelNames.some((n) => n.startsWith(OLLAMA_MODEL.split(":")[0]));
    return {
      connected: true,
      hasModel,
      model: OLLAMA_MODEL,
      provider: "ollama",
      availableModels: modelNames,
    };
  } catch {
    return {
      connected: false,
      hasModel: false,
      model: OLLAMA_MODEL,
      provider: "ollama",
      availableModels: [],
    };
  }
}

// ============================================================
// THE AGENT LOOP
// ============================================================
export async function runAgent(conversationMessages) {
  const messages = [...conversationMessages];
  const toolCalls = [];
  let steps = 0;

  while (steps < MAX_STEPS) {
    steps++;

    const chatMessages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...messages,
    ];

    const assistantMsg = await callModel(chatMessages);

    // CASE 1: Model wants to call tool(s)
    if (assistantMsg.tool_calls && assistantMsg.tool_calls.length > 0) {
      messages.push(assistantMsg);

      for (const toolCall of assistantMsg.tool_calls) {
        const funcName = toolCall.function.name;
        let funcArgs = toolCall.function.arguments;

        if (typeof funcArgs === "string") {
          try {
            funcArgs = JSON.parse(funcArgs);
          } catch {
            funcArgs = {};
          }
        }

        // Defensive fallbacks for small models that mess up arg names
        if (funcName === "calculate" && !funcArgs.expression) {
          const val = funcArgs.value || funcArgs.query || funcArgs.input || Object.values(funcArgs).find(v => typeof v === "string");
          if (val) funcArgs = { expression: String(val) };
        }
        if (funcName === "get_weather" && !funcArgs.city) {
          const val = funcArgs.location || funcArgs.name || funcArgs.query || Object.values(funcArgs).find(v => typeof v === "string");
          if (val) funcArgs = { city: String(val) };
        }
        if (funcName === "save_note" && !funcArgs.title) {
          funcArgs = { title: funcArgs.name || "Untitled", content: funcArgs.content || funcArgs.text || JSON.stringify(funcArgs) };
        }

        // Execute tool
        const startTime = Date.now();
        const result = await executeTool(funcName, funcArgs);
        const duration = Date.now() - startTime;

        const parsed = JSON.parse(result);

        toolCalls.push({
          step: steps,
          tool: funcName,
          input: funcArgs,
          output: parsed,
          error: !!parsed.error,
          duration,
        });

        // Send tool result back to model
        // Groq (OpenAI format) requires tool_call_id
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: result,
        });
      }

      // CASE 2: Model is done
    } else {
      const finalText = assistantMsg.content || "Done.";
      return { response: finalText, steps, toolCalls };
    }
  }

  return {
    response: "I've reached my maximum steps. Please try a simpler request.",
    steps,
    toolCalls,
  };
}

export { PROVIDER };
