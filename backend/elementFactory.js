// Shared Excalidraw element factory helpers
// Ensures all generated elements conform to Excalidraw element skeleton
// so that text renders and arrows bind correctly.

const crypto = require('crypto');

function uuid() {
  return crypto.randomUUID ? crypto.randomUUID() : ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g,c=>(c ^ crypto.randomBytes(1)[0] & 15 >> c / 4).toString(16));
}

function baseDefaults(overrides = {}) {
  return {
    angle: 0,
    strokeColor: '#1e1e1e',
    backgroundColor: '#ffffff',
    fillStyle: 'hachure',
    strokeWidth: 1,
    strokeStyle: 'solid',
    roughness: 1,
    opacity: 100,
    groupIds: [],
    roundness: null,
    seed: Math.floor(Math.random() * 100000000),
    version: 1,
    versionNonce: Math.floor(Math.random() * 1000000000),
    isDeleted: false,
    boundElements: null,
    updated: Date.now(),
    link: null,
    locked: false,
    ...overrides,
  };
}

function approxTextWidth(text, fontSize) {
  const avg = fontSize * 0.6; // crude approximation
  return Math.max(20, Math.ceil(text.length * avg));
}

function buildShape({
  id = uuid(),
  type = 'rectangle',
  x = 0,
  y = 0,
  width = 120,
  height = 60,
  text = '',
  fontSize = 20,
  fontFamily = 1,
  textAlign = 'center',
  verticalAlign = 'middle',
  backgroundColor,
  customLabel,
}) {
  const lineHeight = 1.25;
  const baseline = Math.round(fontSize * 0.8); // approximate
  return {
    id,
    type,
    x,
    y,
    width,
    height,
    ...baseDefaults({ backgroundColor: backgroundColor || (type === 'diamond' ? '#eef2f5' : '#ffffff') }),
    text: '',
    originalText: '',
    fontSize,
    fontFamily,
    textAlign,
    verticalAlign,
    baseline,
    lineHeight,
    boundElements: [],
    customLabel: customLabel || text || '',
  };
}

function buildText({
  id = uuid(),
  text = '',
  x = 0,
  y = 0,
  width,
  height,
  fontSize = 20,
  fontFamily = 1,
  textAlign = 'center',
  verticalAlign = 'middle',
  containerId = null,
}) {
  const lineHeight = 1.25;
  const baseline = Math.round(fontSize * 0.8);
  const autoWidth = width || approxTextWidth(text, fontSize) + 16; // padding
  const autoHeight = height || Math.round(fontSize * lineHeight);
  return {
    id,
    type: 'text',
    x,
    y,
    width: autoWidth,
    height: autoHeight,
    ...baseDefaults({ backgroundColor: 'transparent' }),
    text,
    originalText: text,
    fontSize,
    fontFamily,
    textAlign,
    verticalAlign,
    baseline,
    lineHeight,
    containerId,
  };
}

function buildArrow({
  id = uuid(),
  startElement,
  endElement,
  x,
  y,
  points,
  startArrowhead = null,
  endArrowhead = 'arrow',
}) {
  if (!startElement || !endElement) throw new Error('buildArrow requires startElement and endElement');
  const startCenter = {
    x: startElement.x + (startElement.width || 0) / 2,
    y: startElement.y + (startElement.height || 0) / 2,
  };
  const endCenter = {
    x: endElement.x + (endElement.width || 0) / 2,
    y: endElement.y + (endElement.height || 0) / 2,
  };
  let dx = endCenter.x - startCenter.x;
  let dy = endCenter.y - startCenter.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;

  function boundaryPoint(shape, dirX, dirY) {
    const w = shape.width || 0;
    const h = shape.height || 0;
    if (shape.type === 'diamond') {
      // diamond equation |x/(w/2)| + |y/(h/2)| = 1
      const denom = (Math.abs(dirX) / (w / 2)) + (Math.abs(dirY) / (h / 2)) || 1;
      const t = 1 / denom; // distance along unit direction from center
      return {
        x: (shape.x + w / 2) + dirX * t,
        y: (shape.y + h / 2) + dirY * t,
      };
    }
    // rectangle
    const halfW = w / 2;
    const halfH = h / 2;
    const tx = dirX === 0 ? Infinity : halfW / Math.abs(dirX);
    const ty = dirY === 0 ? Infinity : halfH / Math.abs(dirY);
    const t = Math.min(tx, ty);
    return {
      x: (shape.x + halfW) + dirX * t,
      y: (shape.y + halfH) + dirY * t,
    };
  }

  // Start boundary uses +direction, end boundary uses -direction from end center
  const startBoundary = boundaryPoint(startElement, ux, uy);
  const endBoundary = boundaryPoint(endElement, -ux, -uy);

  dx = endBoundary.x - startBoundary.x;
  dy = endBoundary.y - startBoundary.y;

  const baseX = x !== undefined ? x : startBoundary.x;
  const baseY = y !== undefined ? y : startBoundary.y;
  const arrowPoints = points || [[0, 0], [dx, dy]];

  return {
    id,
    type: 'arrow',
    x: baseX,
    y: baseY,
    width: Math.abs(dx),
    height: Math.abs(dy),
    ...baseDefaults(),
    points: arrowPoints,
    startBinding: { elementId: startElement.id, focus: 0, gap: 0 },
    endBinding: { elementId: endElement.id, focus: 0, gap: 0 },
    startArrowhead,
    endArrowhead,
  };
}

module.exports = {
  buildShape,
  buildText,
  buildArrow,
  approxTextWidth,
};
