
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const axios = require("axios");
const http = require("http");
const { Server } = require("socket.io");
const crypto = require("crypto");
const { planToExcalidrawElements } = require("./utils");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());
const port = process.env.PORT || 5000;
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// In-memory session store
const sessions = {};

// System prompts for each client
const SYSTEM_PROMPTS = {
  fast: `You are a fast, lightweight AI assistant for the Brainstormer whiteboarding app. Your sole job is to classify the user's request so we can route it to the right model. Read the user's message and return a JSON object with two keys: "intent" (a short verb phrase describing what the user wants, such as "draw diagram", "modify diagram", "analyze diagram", or "chat") and "type" (one of "think", "multimodal", or "chat"). Do not include any other fields, explanations, or formatting. If the intent is unclear, set "intent" to "unknown" and "type" to "chat". Example: {"intent": "add database", "type": "think"}. Use multimodal only if the user explicitly mentions modifying the diagram based on an image or diagram analysis.`,
  think: `You are a deep reasoning AI assistant helping users design systems on a whiteboard. Given the chat history, the current board summary, and the latest user request, think step-by-step to determine whether any new shapes should be drawn. Respond ONLY with a JSON object with two keys: "reply" (a concise natural-language message explaining what you did or why no action is needed, as a string) and "elements" (an array of shape objects to add). Each shape object must include: "type" (rectangle, ellipse, circle, diamond, arrow, line, or text), "x" and "y" coordinates, "width" and "height" (for shapes with size), and an optional "text" label. For example:

{
  "reply": "Created architecture diagram for Dropbox with storage, access, content, and security layers.",
  "elements": [
    { "type": "rectangle", "x": 100, "y": 100, "width": 200, "height": 80, "text": "Dropbox Storage" },
    { "type": "rectangle", "x": 350, "y": 100, "width": 200, "height": 80, "text": "Access Layer" },
    { "type": "rectangle", "x": 100, "y": 220, "width": 200, "height": 80, "text": "Content Layer" },
    { "type": "rectangle", "x": 350, "y": 220, "width": 200, "height": 80, "text": "Security Layer" }
  ]
}

If no new shapes are required, return an empty array for "elements". Do not respond with Markdown, HTML, or any other format.`,
  multimodal: `You are a multimodal AI assistant that can interpret both text and a diagram from the Brainstormer whiteboard. You will receive the chat history, a textual summary of the board, and a base64-encoded image. Analyze both modalities to understand the current diagram. If the user asks you to modify or extend the diagram, think step-by-step and respond with a JSON object containing "reply" (an explanation) and "elements" (new shapes to add). Use the same schema for each shape as described in the thinking prompt. If the user only wants analysis or feedback, return an empty "elements" array. Do not use HTML or Markdown; always respond with a JSON object.`
};

// LLM Client base class

class LLMClient {
  constructor(model, systemPrompt) {
    this.model = model;
    this.systemPrompt = systemPrompt;
  }
  buildPayload({ message, images = [] }) {
    // Default payload, can be overridden by subclasses
    return {
      model: this.model,
      messages: [
        { role: "system", content: this.systemPrompt },
        { role: "user", content: message, images },
      ],
      stream: false,
      options: { top_p: 0.4, temperature: 0.2 }
    };
  }
  async sendMessage({ message, images = [] }) {
    const payload = this.buildPayload({ message, images });
    const response = await axios.post("http://localhost:11434/api/chat", payload);
    return response.data.message.content;
  }
}

class FastLLMClient extends LLMClient {
  constructor() {
    super("deepseek-r1:1.5b", SYSTEM_PROMPTS.fast);
  }
  buildPayload({ message }) {
    return {
      model: this.model,
      messages: [
        { role: "system", content: this.systemPrompt },
        { role: "user", content: message },
      ],
      stream: false,
      think: false,
      format: "json",
      options: { temperature: 0.2, top_p: 0.4 }
    };
  }
}

class ThinkingLLMClient extends LLMClient {
  constructor() {
    super("deepseek-r1:1.5b", SYSTEM_PROMPTS.think);
  }
  buildPayload({ message }) {
    return {
      model: this.model,
      messages: [
        { role: "system", content: this.systemPrompt },
        { role: "user", content: message },
      ],
      stream: false,
      think: true,
      format: "json",
      options: { temperature: 0.4, top_p: 0.4 }
    };
  }
}

class MultiModalLLMClient extends LLMClient {
  constructor() {
    super("deepseek-r1:1.5b", SYSTEM_PROMPTS.multimodal);
  }
  buildPayload({ message, images = [] }) {
    return {
      model: this.model,
      messages: [
        { role: "system", content: this.systemPrompt },
        { role: "user", content: message, images },
      ],
      stream: false,
      options: { temperature: 0.2, top_p: 0.4 }
    };
  }
}

// Factory for LLM clients
class LLMClientFactory {
  static getClient(type) {
    switch (type) {
      case "fast": return new FastLLMClient();
      case "think": return new ThinkingLLMClient();
      case "multimodal": return new MultiModalLLMClient();
      default: throw new Error("Unknown LLM client type");
    }
  }
}

function safeParseJSON(input) {
  try {
    let parsed = input;
    while (typeof parsed === "string" && parsed.trim().startsWith("{")) {
      parsed = JSON.parse(parsed);
    }
    return parsed;
  } catch (e) {
    console.warn("Failed to fully parse JSON:", input);
    return { reply: input, elements: [] };
  }
}

function forceParseLLMJSON(input) {
  try {
    // If input is already an object
    if (typeof input === "object") return input;

    // Clean up leading bad brace (e.g., '{"{"reply"...}' → '{"reply"...}')
    if (typeof input === "string" && input.startsWith('{"{')) {
      const idx = input.indexOf('{"reply":');
      if (idx !== -1) input = input.substring(idx);
    }

    let parsed = input;
    // Unwrap multiple layers of JSON strings
    while (typeof parsed === "string" && parsed.trim().startsWith("{")) {
      parsed = JSON.parse(parsed);
    }
    return parsed;
  } catch (e) {
    console.warn("Failed to fully parse LLM JSON:", input);
    return { reply: input, elements: [] };
  }
}

// Setup multer for handling file uploads
const upload = multer({ storage: multer.memoryStorage() });

// Routing logic
app.post("/api/chat", upload.single("image"), async (req, res) => {
  const { message } = req.body;
  const imageBuffer = req.file ? req.file.buffer : null;
  const base64Image = imageBuffer ? imageBuffer.toString("base64") : null;

  try {
    // Step 1: Use fast model to analyze intent
    const fastClient = LLMClientFactory.getClient("fast");
    const intentResponse = await fastClient.sendMessage({ message });
    let intent;
    try {
      intent = JSON.parse(intentResponse);
    } catch (e) {
      console.error("Raw fast model response:", intentResponse);
      throw new Error("Failed to parse intent response from fast model");
    }

    // Step 2: Route to appropriate model (never display fast model output)
    let clientType = intent.type;
    let client;
    // if (clientType === "multimodal" && base64Image) {
    //   client = LLMClientFactory.getClient("multimodal");
    // } else {
      // Default to thinking client for all other cases
    client = LLMClientFactory.getClient("think");
    //}

    // Step 3: Get response from routed client (only display output from thinking or multimodal client)
    const reply = await client.sendMessage({ message, images: base64Image ? [base64Image] : [] });
    res.json({ reply });
  } catch (error) {
    console.error("Error in LLM routing:", error);
    res.status(500).json({ error: error.message || "Error fetching data from LLM" });
  }
});


// Socket.io connection handler
io.on("connection", (socket) => {
  const sessionId = socket.id;
  sessions[sessionId] = {
    chatHistory: [],
    elements: [],
    appState: {},
    summary: ""
  };

  socket.on("user_message", async (payload) => {
    try {
      const { message, elements, appState, chatHistory, systemPrompt } = payload;
      // Update session state
      sessions[sessionId].chatHistory = chatHistory || [];
      sessions[sessionId].elements = elements || [];
      sessions[sessionId].appState = appState || {};
      // For now, summary is just JSON.stringify of elements
      sessions[sessionId].summary = JSON.stringify(elements || []);

      // Use fast client to classify intent
      const fastClient = LLMClientFactory.getClient("fast");
      console.log(`[LLM] Sending to fast model:`, message);
      const intentResponse = await fastClient.sendMessage({ message });
      console.log(`[LLM] Fast model response:`, intentResponse);
      let intent;
      try {
        intent = JSON.parse(intentResponse);
      } catch (e) {
        console.error("Raw fast model response:", intentResponse);
        socket.emit("plan", { error: "Failed to parse intent response from fast model" });
        return;
      }

      // Choose LLM client
      let clientType = intent.type;
      let client;
      if (clientType === "multimodal") {
        client = LLMClientFactory.getClient("multimodal");
      } else {
        client = LLMClientFactory.getClient("think");
      }

      // Build LLM payload
      const llmPayload = {
        message: message,
        images: [], // We'll add PNG support later
        // Optionally, you could pass more context here
      };

      // Call LLM client
      let llmReplyRaw;
      try {
        console.log(`[LLM] Sending to ${clientType} model:`, llmPayload);
        llmReplyRaw = await client.sendMessage(llmPayload);
        console.log(`[LLM] ${clientType} model response:`, llmReplyRaw);
      } catch (err) {
        console.error(`[LLM] Error from ${clientType} model:`, err);
        socket.emit("plan", { error: "LLM error: " + (err.message || "Unknown error") });
        return;
      }

      // Parse LLM response (expect JSON string with at least reply, optionally elements)
      let llmReply = forceParseLLMJSON(llmReplyRaw);


      // Debug logging for LLM reply and elements
      console.log('[LLM] Parsed reply:', llmReply);
      console.log('[LLM] Elements before conversion:', llmReply.elements);

      // Convert LLM elements to Excalidraw format
      const aiElements = planToExcalidrawElements(llmReply.elements);

      // Update session's elements array
      sessions[sessionId].elements = [
        ...(sessions[sessionId].elements || []),
        ...aiElements
      ];

      // Append assistant reply to chat history
      sessions[sessionId].chatHistory.push({ role: "assistant", content: llmReply.reply });

      // Emit plan event to originating socket
      socket.emit("plan", {
        reply: llmReply.reply,
        newElements: aiElements
      });
    } catch (err) {
      socket.emit("plan", { error: err.message || "Unknown error" });
    }
  });

  socket.on("disconnect", () => {
    delete sessions[sessionId];
  });
});

server.listen(port, () => {
  console.log(`Server running (WebSocket + HTTP) on http://localhost:${port}`);
});
