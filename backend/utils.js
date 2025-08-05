const crypto = require("crypto");

function planToExcalidrawElements(planElements) {
  if (!Array.isArray(planElements)) return [];

  return planElements.map((item) => {
    const {
      id,
      type,
      x,
      y,
      width,
      height,
      text,
      start,
      end,
      label,
      points,
    } = item;

    // infer type if missing
    let finalType = type;
    if (!finalType) {
      if (start || end) finalType = "arrow";
      else if (text && !width && !height) finalType = "text";
      else finalType = "rectangle";
    }

    // default width/height (text elements omit size)
    let finalWidth = width;
    let finalHeight = height;
    if (finalType === "text") {
      finalWidth = width ?? undefined;
      finalHeight = height ?? undefined;
    } else {
      finalWidth = width ?? 100;
      finalHeight = height ?? 60;
    }

    // base element
    const element = {
      id: id || crypto.randomUUID(),
      type: finalType,
      x,
      y,
      ...(finalType !== "text" && { width: finalWidth, height: finalHeight }),
      angle: 0,
      isDeleted: false,
      strokeColor: "#1e1e1e",
      backgroundColor: "#ffffff",
      fillStyle: "hachure",
      strokeWidth: 1,
      roughness: 0,
      opacity: 100,
      seed: Math.floor(Math.random() * 100000),
      version: 1,
      versionNonce: Math.floor(Math.random() * 1_000_000_000),
      text: text || "",
    };

    // handle linear elements (arrows/lines)
    if (finalType === "arrow" || finalType === "line") {
      // copy provided points, else fallback to a simple 2-point polyline
      if (points && Array.isArray(points)) {
        element.points = points;
      } else {
        const p0 = [0, 0];
        const p1 = [finalWidth || 100, finalHeight || 0];
        element.points = [p0, p1];
      }

      if (start) element.start = start;
      if (end) element.end = end;
      if (label) element.label = label;
    }

    return element;
  });
}

module.exports = { planToExcalidrawElements };
