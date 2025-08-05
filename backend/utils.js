const crypto = require("crypto");

function planToExcalidrawElements(planElements) {
  if (!Array.isArray(planElements)) return [];
  return planElements.map((item) => {
    const {
      type,
      x,
      y,
      width = 100,
      height = 60,
      text = "",
      // You can extend this destructure to include strokeColor, backgroundColor, etc., if the LLM provides them
    } = item;

    return {
      id: crypto.randomUUID(),
      type,
      x,
      y,
      width,
      height,
      angle: 0, // REQUIRED
      isDeleted: false, // REQUIRED
      // Default styles:
      strokeColor: "#1e1e1e",
      backgroundColor: "#ffffff",
      fillStyle: "hachure",
      strokeWidth: 1,
      roughness: 0,
      opacity: 100,
      seed: Math.floor(Math.random() * 100000),
      version: 1,
      versionNonce: Math.floor(Math.random() * 1000000000),
      text,
      // Some element types (like text) may not need width/height; Excalidraw will ignore extra fields.
    };
  });
}

module.exports = { planToExcalidrawElements };
