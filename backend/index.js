
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const axios = require("axios");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());
const port = process.env.PORT || 5000;

// System prompts for each client
const SYSTEM_PROMPTS = {
  fast: `You are a fast, lightweight AI assistant for Brainstormer, an AI-powered whiteboarding tool for brainstorming, system design, and technical ideation. Your ONLY job is to analyze the user's message and classify the intent for routing. You must NEVER reply with explanations, chat, markdown, or code blocks. ONLY reply with a valid JSON object with keys: 'intent', 'type' (one of "think", "multimodal", "chat"), and any relevant metadata. Example: {"intent": "analyze image", "type": "multimodal"}. If you do not understand, reply with: {"intent": "unknown", "type": "chat"}`,
  think: `You are a deep reasoning AI assistant. Your job is to analyze user requests, plan step-by-step, and output a structured plan for whiteboard updates. Respond with a JSON object describing the plan, elements to draw, and reasoning.`,
  multimodal: `You are a multimodal AI assistant. Your job is to analyze both text and images, infer context from diagrams, and provide actionable insights for whiteboarding. Respond in HTML format, using lists and sections as described in the main system prompt.`
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
    super("gemma3:latest", SYSTEM_PROMPTS.multimodal);
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
    if (clientType === "multimodal" && base64Image) {
      client = LLMClientFactory.getClient("multimodal");
    } else {
      // Default to thinking client for all other cases
      client = LLMClientFactory.getClient("think");
    }

    // Step 3: Get response from routed client (only display output from thinking or multimodal client)
    const reply = await client.sendMessage({ message, images: base64Image ? [base64Image] : [] });
    res.json({ reply });
  } catch (error) {
    console.error("Error in LLM routing:", error);
    res.status(500).json({ error: error.message || "Error fetching data from LLM" });
  }
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
