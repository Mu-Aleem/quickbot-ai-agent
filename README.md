# QuickBot — AI Agent

A tool-using AI agent with two entry points:
- **CLI** ([index.js](index.js)) — chat in the terminal
- **Web** ([server.js](server.js) + [public/index.html](public/index.html)) — chat in the browser

Both share the same agent loop ([agent.js](agent.js)), tool schemas ([tools.js](tools.js)), and tool implementations ([executor.js](executor.js)).

## Features

Six tools the agent can call:
- `calculate` — safe arithmetic (whitelist-validated, no code execution)
- `get_weather` — OpenWeather API (falls back to mock data if no key)
- `web_search` — Tavily search API
- `save_note` / `read_notes` — local JSON notebook in [notes.json](notes.json)
- `get_current_datetime`

Two LLM providers:
- **Groq** (cloud, fast, free tier) — default
- **Ollama** (local, runs on your machine)

## Setup

1. Install dependencies:
   ```
   npm install
   ```

2. Copy the env template and fill in your keys:
   ```
   cp .env.example .env
   ```
   At minimum you need either `GROQ_API_KEY` (if `PROVIDER=groq`) or a running Ollama instance (if `PROVIDER=ollama`). Weather and search keys are optional.

3. (Ollama only) Pull the model:
   ```
   ollama pull qwen2.5:3b
   ollama serve
   ```

## Run

CLI mode:
```
npm start
```

Web mode:
```
npm run dev
```
Then open http://localhost:3000.

## Environment variables

See [.env.example](.env.example). Summary:

| Variable | Required | Purpose |
|---|---|---|
| `PROVIDER` | yes | `groq` or `ollama` |
| `GROQ_API_KEY` | if `PROVIDER=groq` | Groq API key |
| `GROQ_MODEL` | no | Defaults to `llama-3.3-70b-versatile` |
| `OLLAMA_URL` | no | Defaults to `http://localhost:11434` |
| `OLLAMA_MODEL` | no | Defaults to `qwen2.5:3b` |
| `WEATHER_API_KEY` | no | Real weather data — omits → mock data |
| `TAVILY_API_KEY` | no | Required for `web_search` |
| `PORT` | no | Web server port, defaults to `3000` |

## Requirements

Node.js ≥ 19 (uses the global `crypto.randomUUID`).

## Project layout

```
agent.js       agent loop + provider switching
tools.js       tool schemas (OpenAI/Ollama format)
executor.js    tool implementations
index.js       CLI entry
server.js      Express web server
public/        static frontend
notes.json     persistent notes store
```
