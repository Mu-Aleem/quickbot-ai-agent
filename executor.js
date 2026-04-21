// Tool implementations — each function does the REAL work
// When Claude calls a tool, this file executes it and returns the result

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const NOTES_FILE = path.join(__dirname, "notes.json");

// Make sure notes.json exists
if (!fs.existsSync(NOTES_FILE)) {
  fs.writeFileSync(NOTES_FILE, "[]");
}

// All tool functions mapped by name
const toolFunctions = {
  // --- CALCULATOR ---
  calculate: async ({ expression }) => {
    try {
      let cleaned = String(expression)
        .replace(/[{}]/g, "")
        .replace(/^["']+|["']+$/g, "")
        .replace(/×/g, "*")
        .replace(/÷/g, "/")
        .replace(/%\s*of\s*/gi, "/100*")
        .replace(/(\d)%/g, "($1/100)")
        .trim();

      // Whitelist: only digits, math operators, parens, dot, space.
      // Blocks identifiers, strings, and any JS syntax outside arithmetic.
      if (!/^[\d+\-*/().\s]+$/.test(cleaned)) {
        return { error: `Invalid expression: "${expression}"` };
      }

      const result = Function('"use strict"; return (' + cleaned + ")")();

      if (typeof result !== "number" || !isFinite(result)) {
        return { error: `Could not calculate: "${expression}"` };
      }

      return { expression: cleaned, result: Number(result) };
    } catch {
      return { error: `Invalid expression: "${expression}"` };
    }
  },

  // --- WEATHER (OpenWeather API) ---
  get_weather: async ({ city }) => {
    const apiKey = process.env.WEATHER_API_KEY;

    if (!apiKey || apiKey === "your_openweather_api_key_here") {
      // Fallback: simulated data for testing without API key
      const mockData = {
        lahore: { temp: 38, feels_like: 42, humidity: 25, wind: 12, description: "clear sky" },
        karachi: { temp: 32, feels_like: 35, humidity: 65, wind: 18, description: "partly cloudy" },
        islamabad: { temp: 28, feels_like: 30, humidity: 45, wind: 8, description: "sunny" },
        london: { temp: 14, feels_like: 11, humidity: 72, wind: 20, description: "overcast clouds" },
        dubai: { temp: 42, feels_like: 46, humidity: 15, wind: 14, description: "clear sky" },
        "new york": { temp: 18, feels_like: 16, humidity: 55, wind: 22, description: "partly cloudy" },
      };
      const data = mockData[city.toLowerCase()];
      if (data) {
        return { city, ...data, unit: "celsius", note: "simulated data — add WEATHER_API_KEY for real data" };
      }
      return { error: `No mock data for "${city}". Add WEATHER_API_KEY in .env for real weather data.` };
    }

    try {
      const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${apiKey}&units=metric`;
      const res = await fetch(url);
      const data = await res.json();

      if (data.cod !== 200) {
        return { error: data.message || `Could not find weather for "${city}"` };
      }

      return {
        city: data.name,
        country: data.sys.country,
        temp: data.main.temp,
        feels_like: data.main.feels_like,
        humidity: data.main.humidity,
        wind_speed: data.wind.speed,
        description: data.weather[0].description,
        unit: "celsius",
      };
    } catch (err) {
      return { error: `Weather API failed: ${err.message}` };
    }
  },

  // --- WEB SEARCH (Tavily API) ---
  web_search: async ({ query, max_results = 5 }) => {
    const apiKey = process.env.TAVILY_API_KEY;

    if (!apiKey || apiKey === "your_tavily_api_key_here") {
      return {
        error: "No TAVILY_API_KEY set. Sign up at tavily.com (free tier: 1000 searches/month) and add the key to .env",
      };
    }

    try {
      const res = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: apiKey,
          query,
          max_results,
          search_depth: "basic",
        }),
      });

      const data = await res.json();

      if (!data.results) {
        return { error: data.message || "Search failed" };
      }

      return {
        query,
        results: data.results.map((r) => ({
          title: r.title,
          url: r.url,
          snippet: r.content?.substring(0, 250),
        })),
      };
    } catch (err) {
      return { error: `Search failed: ${err.message}` };
    }
  },

  // --- SAVE NOTE (Local JSON file) ---
  save_note: async ({ title, content }) => {
    try {
      const notes = JSON.parse(fs.readFileSync(NOTES_FILE, "utf8"));
      const note = {
        id: crypto.randomUUID(),
        title,
        content,
        created_at: new Date().toISOString(),
      };
      notes.push(note);
      fs.writeFileSync(NOTES_FILE, JSON.stringify(notes, null, 2));
      return { success: true, message: `Note "${title}" saved!`, note };
    } catch (err) {
      return { error: `Failed to save note: ${err.message}` };
    }
  },

  // --- READ NOTES (Local JSON file) ---
  read_notes: async ({ search } = {}) => {
    try {
      const notes = JSON.parse(fs.readFileSync(NOTES_FILE, "utf8"));

      if (notes.length === 0) {
        return { message: "No notes saved yet.", notes: [] };
      }

      if (search) {
        const keyword = search.toLowerCase();
        const filtered = notes.filter(
          (n) =>
            n.title.toLowerCase().includes(keyword) ||
            n.content.toLowerCase().includes(keyword)
        );
        return {
          message: `Found ${filtered.length} note(s) matching "${search}"`,
          notes: filtered,
        };
      }

      return { message: `You have ${notes.length} note(s)`, notes };
    } catch (err) {
      return { error: `Failed to read notes: ${err.message}` };
    }
  },

  // --- GET CURRENT DATE/TIME ---
  get_current_datetime: async () => {
    const now = new Date();
    return {
      date: now.toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      }),
      time: now.toLocaleTimeString("en-US"),
      iso: now.toISOString(),
    };
  },
};

// Main executor — called by the agent
export async function executeTool(name, input) {
  const fn = toolFunctions[name];

  if (!fn) {
    return JSON.stringify({ error: `Unknown tool: ${name}` });
  }

  try {
    const result = await fn(input);
    return JSON.stringify(result);
  } catch (err) {
    return JSON.stringify({ error: `Tool "${name}" failed: ${err.message}` });
  }
}
