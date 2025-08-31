// DiagramBuilder: deterministic Excalidraw element generator for system diagrams
const { buildShape, buildArrow, buildText, approxTextWidth } = require('./elementFactory');

class DiagramBuilder {
  constructor() {
    this.xStart = 100;
    this.yStart = 100;
    this.xStep = 250;
    this.yStep = 120;
  }

  // Helper: build map of label(lower)->shape
  _buildLabelIndex(existingElements) {
    const textByContainer = {};
    for (const el of existingElements) {
      if (el.type === 'text' && el.containerId && el.originalText) {
        textByContainer[el.containerId] = el.originalText;
      }
    }
    const labelMap = {}; // labelLower -> shape
    for (const el of existingElements) {
      if (el.type !== 'arrow' && el.type !== 'text') {
        const label = textByContainer[el.id] || el.customLabel;
        if (label) labelMap[label.toLowerCase()] = el;
      }
    }
    return labelMap;
  }

  _extractLabels(stepLower) {
    const known = [
      'user',
      'load balancer',
      'application server', 'backend server', 'server',
      'dropbox service', 'dropbox',
      'blob storage', 'storage',
      'upload interface', 'upload component', 'upload'
    ];
    const found = [];
    for (const k of known) if (stepLower.includes(k) && !found.includes(k)) found.push(k);
    return found;
  }

  _normalizePrimaryLabel(raw) {
    if (!raw) return raw;
    if (raw.includes('load balancer')) return 'Load Balancer';
    if (raw.includes('application server') || raw.includes('backend server') || raw === 'server') return 'Application Server';
    if (raw.includes('blob storage') || raw === 'storage') return 'Blob Storage';
    if (raw.includes('upload interface') || raw.includes('upload component') || raw === 'upload') return 'Upload Interface';
    if (raw.includes('dropbox')) return 'Dropbox Service';
    if (raw.includes('user')) return 'User';
    return raw;
  }

  // Main entry: returns Excalidraw element skeletons for a given step
  buildElements(stepDesc, existingElements = []) {
    const lower = stepDesc.toLowerCase();
    const labelIndex = this._buildLabelIndex(existingElements);

    const isConnection = /(arrow|connect|link|line)/.test(lower);

    if (isConnection) {
      // Try parse "from X to Y"
      let fromLabel, toLabel;
      const m = lower.match(/from (.+?) to (.+)/);
      if (m) {
        fromLabel = this._normalizePrimaryLabel(m[1].trim());
        toLabel = this._normalizePrimaryLabel(m[2].trim());
      } else {
        const labels = this._extractLabels(lower).map(l => this._normalizePrimaryLabel(l));
        if (labels.length >= 2) {
          fromLabel = labels[0];
          toLabel = labels[1];
        }
      }
      if (fromLabel && toLabel) {
        const fromShape = labelIndex[fromLabel.toLowerCase()];
        const toShape = labelIndex[toLabel.toLowerCase()];
        if (fromShape && toShape) {
          // Ensure we don't already have an arrow between these two (simple check)
          const hasExistingArrow = existingElements.some(el => el.type === 'arrow' && el.startBinding && el.endBinding && ((el.startBinding.elementId === fromShape.id && el.endBinding.elementId === toShape.id) || (el.startBinding.elementId === toShape.id && el.endBinding.elementId === fromShape.id)));
          if (!hasExistingArrow) return [buildArrow({ startElement: fromShape, endElement: toShape })];
        }
        // If one side missing, try reconcile arrows that plan skipped: return []
      }
      return [];
    }

    // Shape creation
    let label;
    if (lower.includes('load balancer')) label = 'Load Balancer';
    else if (lower.includes('backend server') || lower.includes('application server') || (lower.includes(' server') && !lower.includes('dropbox'))) label = 'Application Server';
    else if (lower.includes('blob storage') || (lower.includes('storage') && !lower.includes('blob storage arrow'))) label = 'Blob Storage';
    else if (lower.includes('upload interface') || lower.includes('upload component') || (lower.includes('upload') && !lower.includes('upload arrow'))) label = 'Upload Interface';
    else if (lower.includes('dropbox')) label = 'Dropbox Service';
    else if (lower.includes('user')) label = 'User';
    else label = stepDesc;

    if (labelIndex[label.toLowerCase()]) return [];

    const shapeCount = existingElements.filter(e => e.type !== 'arrow' && e.type !== 'text').length;
    const x = this.xStart + shapeCount * this.xStep;
    const y = this.yStart;

    const shapeType = label === 'Load Balancer' ? 'diamond' : 'rectangle';
    const shape = buildShape({ type: shapeType, x, y, customLabel: label });
    // dynamic text size & centering
    const textWidth = Math.min(shape.width - 16, approxTextWidth(label, 20));
    const textEl = buildText({ text: label, x: x + (shape.width - textWidth)/2, y: y + (shape.height - 24)/2, width: textWidth, containerId: shape.id });
    shape.boundElements.push({ id: textEl.id, type: 'text' });

    const existingShapes = existingElements.filter(e => e.type !== 'arrow' && e.type !== 'text');
    const prevShape = existingShapes[existingShapes.length - 1];
    const out = [shape, textEl];
    if (prevShape) out.push(buildArrow({ startElement: prevShape, endElement: shape }));
    return out;
  }
}

module.exports = DiagramBuilder;
