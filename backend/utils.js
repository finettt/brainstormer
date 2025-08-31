const crypto = require("crypto");
const { buildShape, buildArrow, buildText, approxTextWidth } = require('./elementFactory');

function planToExcalidrawElements(planElements, existingElements = []) {
  if (!Array.isArray(planElements)) return [];

  // Index existing shapes by id for arrow binding & position inference
  const shapeMap = {};
  for (const el of existingElements) if (el.type !== 'arrow' && el.type !== 'text') shapeMap[el.id] = el;

  const created = [];
  for (const item of planElements) {
    if (!item || typeof item !== 'object') continue;
    const { id, type, x = 0, y = 0, width, height, text = '', start, end } = item;

    if ((type === 'arrow' || (!type && (start || end))) && start && end) {
      const startEl = shapeMap[start.id] || created.find(e => e.id === start.id);
      const endEl = shapeMap[end.id] || created.find(e => e.id === end.id);
      if (startEl && endEl) created.push(buildArrow({ id, startElement: startEl, endElement: endEl }));
      continue;
    }

    const shapeType = type && type !== 'text' ? type : 'rectangle';
    const shape = buildShape({ id, type: shapeType, x, y, width: width || 120, height: height || 60, customLabel: text });
    const textWidth = Math.min(shape.width - 16, approxTextWidth(text, 20));
    const textEl = buildText({ text, x: x + (shape.width - textWidth)/2, y: y + (shape.height - 24)/2, width: textWidth, containerId: shape.id });
    shape.boundElements.push({ id: textEl.id, type: 'text' });
    created.push(shape, textEl);
    shapeMap[shape.id] = shape;
  }
  return created;
}

module.exports = { planToExcalidrawElements };
