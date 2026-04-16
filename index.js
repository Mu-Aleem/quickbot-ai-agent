// QuickBot CLI — Terminal version of the agent
// Uses the same agent.js as the web version

import "dotenv/config";
import readline from "readline";
import { runAgent, checkOllama, MODEL } from "./agent.js";

const messages = [];

async function chat(userInput) {
  messages.push({ role: "user", content: userInput });

  const result = await runAgent(messages);

  // Show tool calls
  for (const tc of result.toolCalls) {
    if (tc.error) {
      console.log(`  ❌ ${tc.tool}() failed: ${tc.output.error}`);
    } else {
      console.log(`  🔧 ${tc.tool}(${JSON.stringify(tc.input)}) ✅`);
    }
  }

  messages.push({ role: "assistant", content: result.response });
  return result.response;
}

// CLI setup
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

console.log("╔══════════════════════════════════════════╗");
console.log("║       🤖 QuickBot — CLI Mode            ║");
console.log(`║  Model: ${MODEL.padEnd(31)}║`);
console.log("║  Type 'exit' to quit                     ║");
console.log("╚══════════════════════════════════════════╝\n");

const status = await checkOllama();
if (!status.connected) { console.log("❌ Ollama not running. Run: ollama serve"); process.exit(1); }
if (!status.hasModel) { console.log(`⚠️ Model "${MODEL}" not found. Run: ollama pull ${MODEL}`); process.exit(1); }

function prompt() {
  rl.question("You: ", async (input) => {
    if (!input.trim()) { prompt(); return; }
    if (input.trim().toLowerCase() === "exit") { console.log("\n👋 Bye!\n"); rl.close(); return; }
    try {
      const reply = await chat(input.trim());
      console.log(`\nBot: ${reply}\n`);
    } catch (err) {
      console.error(`\n❌ ${err.message}\n`);
    }
    prompt();
  });
}

prompt();
