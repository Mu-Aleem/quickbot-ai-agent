// Agent Loop — The brain of QuickBot
// Extracted so both CLI (index.js) and Web (server.js) can use it

import { tools } from "./tools.js";
import { executeTool } from "./executor.js";

const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";
const MODEL = process.env.OLLAMA_MODEL || "llama3.2:1b";
const MAX_STEPS = 10;

const SYSTEM_PROMPT = `You are QuickBot, a helpful AI assistant.

You have access to these tools:
- calculate: For math calculations and unit conversions
- get_weather: To check weather in any city
- web_search: To search the internet for current information
- save_note: To save notes locally for the user
- read_notes: To read and search through saved notes
- get_current_datetime: To get the current date and time

## Rules:
- Use tools whenever the user's question needs real data (weather, calculations, current info)
- Think step by step for complex requests — you can call multiple tools in sequence
- If a tool fails, explain the error and suggest alternatives
- Be concise but helpful in your responses
- When saving notes, use a clear title that makes it easy to find later
- For questions you can answer from your own knowledge, respond directly without tools`;

// Call Ollama API
async function callOllama(messages) {
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages,
      tools,
      stream: false,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Ollama error (${res.status}): ${text}`);
  }

  return res.json();
}

// Check if Ollama is running and model is available
export async function checkOllama() {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`);
    if (!res.ok) throw new Error();
    const data = await res.json();
    const modelNames = data.models.map((m) => m.name);
    const hasModel = modelNames.some((n) => n.startsWith(MODEL.split(":")[0]));
    return {
      connected: true,
      hasModel,
      model: MODEL,
      availableModels: modelNames,
    };
  } catch {
    return { connected: false, hasModel: false, model: MODEL, availableModels: [] };
  }
}

// The Agent Loop
// Takes conversation messages, returns { response, steps, toolCalls }
export async function runAgent(conversationMessages) {
  const messages = [...conversationMessages];
  const toolCalls = []; // track all tool calls for the UI
  let steps = 0;

  while (steps < MAX_STEPS) {
    steps++;

    const chatMessages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...messages,
    ];

    const response = await callOllama(chatMessages);
    const assistantMsg = response.message;

    // CASE 1: Model wants to call tool(s)
    if (assistantMsg.tool_calls && assistantMsg.tool_calls.length > 0) {
      messages.push(assistantMsg);

      for (const toolCall of assistantMsg.tool_calls) {
        const funcName = toolCall.function.name;
        let funcArgs = toolCall.function.arguments;

        // Small models sometimes return args in weird formats
        if (typeof funcArgs === "string") {
          try {
            funcArgs = JSON.parse(funcArgs);
          } catch {
            funcArgs = {};
          }
        }

        // Small models sometimes put the value directly instead of {expression: "..."}
        // e.g. calculate gets {type: "number", value: "3"} instead of {expression: "15*2.5"}
        if (funcName === "calculate" && !funcArgs.expression) {
          // Try to extract anything usable
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

        // Track for UI
        toolCalls.push({
          step: steps,
          tool: funcName,
          input: funcArgs,
          output: parsed,
          error: !!parsed.error,
          duration,
        });

        // Send result back to model
        messages.push({ role: "tool", content: result });
      }

      // CASE 2: Model is done — final text response
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

export { MODEL };
