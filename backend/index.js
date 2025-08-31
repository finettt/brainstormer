const express = require("express");
const cors = require("cors");
const multer = require("multer");
const axios = require("axios");
const http = require("http");
const { Server } = require("socket.io");
const crypto = require("crypto");
const { planToExcalidrawElements } = require("./utils");
const DiagramBuilder = require("./diagramBuilder");
const diagramBuilder = new DiagramBuilder();

// === LLM Config ===
require("dotenv").config();
const LLM_CONFIG = {
  provider: process.env.LLM_PROVIDER || 'ollama', // 'ollama' or 'openai'
  modelNames: {
    fast: process.env.LLM_MODEL_FAST || 'deepseek-r1:1.5b',
    think: process.env.LLM_MODEL_THINK || 'deepseek-r1:1.5b',
    multimodal: process.env.LLM_MODEL_MULTIMODAL || 'deepseek-r1:1.5b',
    plan: process.env.LLM_MODEL_PLAN || 'deepseek-r1:1.5b',
  },
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  ollamaUrl: process.env.OLLAMA_URL || 'http://localhost:11434/api/chat',
  openaiUrl: process.env.OPENAI_URL || 'https://api.openai.com/v1/chat/completions',
};


const app = express();
app.use(cors());
app.use(express.json());
const port = process.env.PORT || 5000;
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });
console.log(`[SERVER] Starting server with LLM Config: ${JSON.stringify(LLM_CONFIG)}`);
// In-memory session store
const sessions = {};

// System prompts for each client
const SYSTEM_PROMPTS = {
  fast: `You are a fast, lightweight AI assistant for the Brainstormer whiteboarding app. Your sole job is to classify the user's request so we can route it to the right model. Read the user's message and return a JSON object with two keys: "intent" (a short verb phrase describing what the user wants, such as "draw diagram", "modify diagram", "analyze diagram", or "chat") and "type" (one of "think", "multimodal", or "chat"). Do not include any other fields, explanations, or formatting. If the intent is unclear, set "intent" to "unknown" and "type" to "chat". Example: {"intent": "add database", "type": "think"}. Use multimodal only if the user explicitly mentions modifying the diagram based on an image or diagram analysis.`,
  think: `You are a deep‑reasoning AI assistant helping users design systems on a whiteboard. Given the chat history, the current board summary, and the latest user request, think step‑by‑step about whether new shapes or connections should be added. Respond ONLY with a single JSON object with two keys:
  - "reply": a concise natural‑language message explaining what you did or why no action is needed.
  - "elements": an array of Excalidraw element skeleton objects to add.

Each element object MUST conform to the Excalidraw element skeleton format. For shapes (rectangle, ellipse, diamond, etc.), always include a "text" property inside the shape object for the label. For arrows, reference the shape ids using the "start" and "end" properties, and use correct anchor coordinates for "x", "y", and "points". Do NOT use a separate label or text element for shape labels.

At a minimum include:
  - "type": one of rectangle, ellipse, diamond, circle, arrow, or line.
  - "x" and "y": the anchor coordinates.
  - For shapes that need a size, specify "width" and "height".
  - For shapes, include a "text" property for the label.

To connect shapes use arrow or line elements. Reference the shape ids in the arrow's "start" and "end" properties.

For example:

{
  "reply": "Created architecture diagram for Dropbox with connected layers.",
  "elements": [
    { "id": "storage", "type": "rectangle", "x": 100, "y": 100, "width": 200, "height": 80, "text": "Storage" },
    { "id": "access", "type": "rectangle", "x": 350, "y": 100, "width": 200, "height": 80, "text": "Access Layer" },
    {
      "id": "arrow1",
      "type": "arrow",
      "x": 200,
      "y": 140,
      "start": { "id": "storage" },
      "end": { "id": "access" }
    }
  ]
}

If no new shapes or connections are required, return "elements": []. Do not use HTML or Markdown; always respond with raw JSON.

You will be called with a description of a single step. Only add shapes needed for that step. Do not draw future components.`,
  multimodal: `You are a multimodal AI assistant that can interpret both text and a diagram from the Brainstormer whiteboard. You will receive the chat history, a textual summary of the board, and a base64-encoded image. Analyze both modalities to understand the current diagram. If the user asks you to modify or extend the diagram, think step-by-step and respond with a JSON object containing "reply" (an explanation) and "elements" (new shapes to add). Use the same schema for each shape as described in the thinking prompt. If the user only wants analysis or feedback, return an empty "elements" array. Do not use HTML or Markdown; always respond with a JSON object.`
  ,
  plan: `You are a planning agent. Given a high-level system design request, respond ONLY with a JSON array of short, actionable, ordered step descriptions required to build the diagram. STRICT RULES: (1) Do NOT repeat or restate the user prompt. (2) Do NOT return an object or any explanation. (3) Do NOT include the user prompt as a step. (4) If you cannot break down the task, return an array with a single short step, not the full prompt. (5) Each entry should describe a single component or connection to draw, e.g. ["Create a user box", "Add a load balancer", "Add backend server", "Add blob storage"]. Only output a JSON array.`
};

function extractPlanSteps(planRaw, message) {
  let planSteps;
  try {
    planSteps = JSON.parse(planRaw);
    if (!Array.isArray(planSteps)) {
      if (typeof planSteps === 'object') {
        const values = Object.values(planSteps);
        if (values.length === 1 && (values[0] === message || values[0].toLowerCase().includes(message.toLowerCase()))) {
          planSteps = ["Break down the system into components and connections."];
        } else {
          planSteps = values;
        }
      } else if (typeof planSteps === 'string') {
        if (planSteps === message || planSteps.toLowerCase().includes(message.toLowerCase())) {
          planSteps = ["Break down the system into components and connections."];
        } else {
          planSteps = [planSteps];
        }
      }
    }
    planSteps = planSteps.filter(s => typeof s === 'string' && !s.toLowerCase().includes(message.toLowerCase()));
    if (planSteps.length === 0) planSteps = ["Break down the system into components and connections."];
  } catch (e) {
    planSteps = ["Break down the system into components and connections."];
  }
  return planSteps;
}
// LLM Client base class

class LLMClient {
  constructor(model, systemPrompt) {
    this.model = model;
    this.systemPrompt = systemPrompt;
  }
  buildPayload({ message, images = [] }) {
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
    let response;
    if (LLM_CONFIG.provider === 'ollama') {
      response = await axios.post(LLM_CONFIG.ollamaUrl, payload);
      return response.data.message.content;
    } else if (LLM_CONFIG.provider === 'openai') {
      // OpenAI expects model and messages, plus API key
      const openaiPayload = {
        model: this.model,
        messages: [
          { role: "system", content: this.systemPrompt },
          { role: "user", content: message },
        ],
        stream: false,
        temperature: payload.options.temperature,
        top_p: payload.options.top_p
      };
      // Use the OpenAI URL from config (should be /v1/responses for latest API)
      const openaiResponsesUrl = LLM_CONFIG.openaiUrl;
      const responsesPayload = {
        model: this.model,
        input: [
          { role: "system", content: this.systemPrompt },
          { role: "user", content: message }
        ],
        stream: false,
        temperature: payload.options.temperature,
        top_p: payload.options.top_p
      };
      try {
        response = await axios.post(
          openaiResponsesUrl,
          responsesPayload,
          {
            headers: {
              'Authorization': `Bearer ${LLM_CONFIG.openaiApiKey}`,
              'Content-Type': 'application/json'
            }
          }
        );
        // OpenAI Responses API: output is in response.data.output[0].content[0].text
        if (
          response.data &&
          Array.isArray(response.data.output) &&
          response.data.output.length > 0 &&
          response.data.output[0].content &&
          Array.isArray(response.data.output[0].content) &&
          response.data.output[0].content.length > 0 &&
          response.data.output[0].content[0].text
        ) {
          return response.data.output[0].content[0].text;
        } else {
          console.error('[OpenAI API] Unexpected response:', JSON.stringify(response.data, null, 2));
          throw new Error('OpenAI API did not return expected output[0].content[0].text. See server logs for details.');
        }
      } catch (err) {
        if (err.response) {
          console.error('[OpenAI API] Error response:', JSON.stringify(err.response.data, null, 2));
          throw new Error(`OpenAI API error: ${err.response.data.error?.message || 'Unknown error'}`);
        } else {
          console.error('[OpenAI API] Request error:', err);
          throw new Error('OpenAI API request failed. See server logs for details.');
        }
      }
    } else {
      throw new Error('Unknown LLM provider');
    }
  }
}

class FastLLMClient extends LLMClient {
  constructor() {
    super(LLM_CONFIG.modelNames.fast, SYSTEM_PROMPTS.fast);
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
    super(LLM_CONFIG.modelNames.think, SYSTEM_PROMPTS.think);
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
    super(LLM_CONFIG.modelNames.multimodal, SYSTEM_PROMPTS.multimodal);
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
class PlanningLLMClient extends LLMClient {
  constructor() {
    super(LLM_CONFIG.modelNames.plan, SYSTEM_PROMPTS.plan);
  }
  buildPayload({ message }) {
    return {
      model: this.model,
      messages: [
        { role: "system", content: this.systemPrompt },
        { role: "user", content: message }
      ],
      stream: false,
      format: "json",
      options: { temperature: 0.3, top_p: 0.4 }
    };
  }
}

class LLMClientFactory {
  static getClient(type) {
    switch (type) {
      case "fast": return new FastLLMClient();
      case "think": return new ThinkingLLMClient();
      case "multimodal": return new MultiModalLLMClient();
      case "plan": return new PlanningLLMClient();
      default: throw new Error("Unknown LLM client type");
    }
  }
}

function forceParseLLMJSON(input) {
  try {
    if (typeof input === "object") return input;
    let str = String(input).trim();
    // Remove leading/trailing braces and newlines
    str = str.replace(/^[\s{]+/, '{').replace(/[\s}]+$/, '}');
    // Try to extract the first JSON object in the string
    const match = str.match(/\{[\s\S]*\}/);
    if (match) str = match[0];
    let parsed = str;
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
  console.log(`[SOCKET] Client connected: ${sessionId}`);
  // Execution phase handler: continue_step
  socket.on("continue_step", async () => {
    const session = sessions[sessionId];
    if (!session || session.planComplete) {
      console.log(`[THINKING] No session or plan complete for sessionId: ${sessionId}`);
      socket.emit("step_done", { reply: "Plan complete", newElements: [] });
      return;
    }
    const stepDesc = session.planSteps[session.currentStep];
    const { elements } = session;
    const summary = JSON.stringify(elements);
    console.log(`[THINKING] Executing step ${session.currentStep}: ${stepDesc}`);
    const thinkClient = LLMClientFactory.getClient("think");
    const llmPayload = {
      message: `Current step: ${stepDesc}. Your job is to implement only this step. Current board summary: ${summary}`,
      images: []
    };
    try {
      const llmReplyRaw = await thinkClient.sendMessage(llmPayload);
      console.log(`[THINKING] Raw LLM reply:`, llmReplyRaw);
      const llmReply = forceParseLLMJSON(llmReplyRaw);
      console.log(`[THINKING] Parsed LLM reply:`, llmReply);
      let aiElements = planToExcalidrawElements(llmReply.elements, session.elements);
      // Fallback: if no elements, use DiagramBuilder
      if (!aiElements || aiElements.length === 0) {
        aiElements = diagramBuilder.buildElements(stepDesc, session.elements);
        console.log(`[THINKING] Fallback DiagramBuilder elements:`, aiElements);
      }
      session.elements = [...session.elements, ...aiElements];
      session.currentStep += 1;
      if (session.currentStep >= session.planSteps.length) session.planComplete = true;
      socket.emit("step_done", {
        reply: llmReply.reply || "Added diagram elements.",
        newElements: aiElements,
        nextStepIndex: session.currentStep,
        planComplete: session.planComplete
      });
    } catch (err) {
      console.error(`[THINKING] Error during step execution:`, err);
      socket.emit("step_done", { reply: `Error: ${err.message || "Unknown error"}`, newElements: [], nextStepIndex: session.currentStep, planComplete: session.planComplete });
    }
  });
  sessions[sessionId] = {
    chatHistory: [],
    elements: [],
    appState: {},
    summary: "",
    planSteps: [],
    currentStep: 0,
    planComplete: false
  };
  // Planning phase handler
  socket.on("plan_request", async (payload) => {
    try {
      const { message } = payload;
      console.log(`[PLANNING] Received plan_request for:`, message);
      const planningClient = LLMClientFactory.getClient("plan");
      const planRaw = await planningClient.sendMessage({ message });
      console.log(`[PLANNING] Raw plan response:`, planRaw);
      const planSteps = extractPlanSteps(planRaw, message);
      console.log(`[PLANNING] Parsed plan steps:`, planSteps);
      sessions[sessionId].planSteps = Array.isArray(planSteps) ? planSteps : [];
      sessions[sessionId].currentStep = 0;
      sessions[sessionId].planComplete = false;
      socket.emit("plan_generated", { steps: sessions[sessionId].planSteps });
    } catch (err) {
      console.error(`[PLANNING] Error in planning phase:`, err);
      socket.emit("plan_generated", { error: err.message || "Unknown error" });
    }
  });

  socket.on("user_message", async (payload) => {
    try {
      console.log(`[SOCKET] Received user_message from ${sessionId}`);
      const { message, elements, appState, chatHistory, systemPrompt } = payload;
      // Update session state
      sessions[sessionId].chatHistory = chatHistory || [];
      sessions[sessionId].elements = elements || [];
      sessions[sessionId].appState = appState || {};
      sessions[sessionId].summary = JSON.stringify(elements || []);

      // If no plan exists, trigger planning phase (call planning logic directly)
      if (!sessions[sessionId].planSteps || sessions[sessionId].planSteps.length === 0) {
        try {
          console.log(`[PLANNING] Received plan_request for:`, message);
          const planningClient = LLMClientFactory.getClient("plan");
          const planRaw = await planningClient.sendMessage({ message });
          console.log(`[PLANNING] Raw plan response:`, planRaw);
          const planSteps = extractPlanSteps(planRaw, message);
          console.log(`[PLANNING] Parsed plan steps:`, planSteps);
          sessions[sessionId].planSteps = Array.isArray(planSteps) ? planSteps : [];
          sessions[sessionId].currentStep = 0;
          sessions[sessionId].planComplete = false;
          socket.emit("plan_generated", { steps: sessions[sessionId].planSteps });
        } catch (err) {
          console.error(`[PLANNING] Error in planning phase:`, err);
          socket.emit("plan_generated", { error: err.message || "Unknown error" });
        }
        return;
      }

      // Otherwise, continue with current step (or let frontend trigger continue_step)
      socket.emit("step_ready", {
        nextStepIndex: sessions[sessionId].currentStep,
        planSteps: sessions[sessionId].planSteps,
        planComplete: sessions[sessionId].planComplete
      });
    } catch (err) {
      socket.emit("plan", { error: err.message || "Unknown error" });
    }
  });

  socket.on("disconnect", () => {
    console.log(`[SOCKET] Client disconnected: ${socket.id}`);
    delete sessions[sessionId];
  });
});

server.listen(port, () => {
  console.log(`Server running (WebSocket + HTTP) on http://localhost:${port}`);
});
