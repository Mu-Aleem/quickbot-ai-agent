// Tool definitions — Ollama format (OpenAI compatible)
// Ollama wraps each tool in { type: "function", function: { ... } }
// The model reads name + description to decide which tool to call

export const tools = [
  {
    type: "function",
    function: {
      name: "calculate",
      description:
        "Perform math calculations. Use this for any math question like addition, multiplication, percentages, unit conversions, etc.",
      parameters: {
        type: "object",
        properties: {
          expression: {
            type: "string",
            description:
              'A valid JavaScript math expression. Examples: "15 * 24", "100 / 3", "(38 * 9/5) + 32"',
          },
        },
        required: ["expression"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_weather",
      description:
        "Get current weather for any city. Returns temperature (celsius), feels like, humidity, wind speed, and weather description.",
      parameters: {
        type: "object",
        properties: {
          city: {
            type: "string",
            description: 'City name, e.g. "Lahore", "London", "New York"',
          },
        },
        required: ["city"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "web_search",
      description:
        "Search the web for current information. Use when the user asks about recent events, facts you are unsure about, or anything that needs up-to-date data. Do NOT use for personal questions about the user.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The search query",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "save_note",
      description:
        "Save a note with a title and content. Use when the user wants to remember something, save information, or take notes.",
      parameters: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "A short title for the note",
          },
          content: {
            type: "string",
            description: "The note content",
          },
        },
        required: ["title", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_notes",
      description:
        "Read saved notes. Can return all notes or search by keyword. Use when the user wants to see their notes or find something they saved earlier.",
      parameters: {
        type: "object",
        properties: {
          search: {
            type: "string",
            description:
              "Optional keyword to filter notes by title or content",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_current_datetime",
      description:
        "Get the current date and time. Use when you need to know today's date or current time.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
];
