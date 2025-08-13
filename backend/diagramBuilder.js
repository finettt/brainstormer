// DiagramBuilder: deterministic Excalidraw element generator for system diagrams

class DiagramBuilder {
  constructor() {
    // You can add templates, default positions, etc. here
    this.xStart = 100;
    this.yStart = 100;
    this.xStep = 250;
    this.yStep = 120;
  }

  // Main entry: returns Excalidraw element skeletons for a given step
  buildElements(stepDesc, existingElements = []) {
    const lower = stepDesc.toLowerCase();
    let elements = [];
    let x = this.xStart + existingElements.length * this.xStep;
    let y = this.yStart;

    // Rectangle template
    const rectangle = (id, text) => ({
      id,
      type: 'rectangle',
      x,
      y,
      width: 120,
      height: 60,
      angle: 0,
      strokeColor: '#000000',
      backgroundColor: '#ffffff',
      fillStyle: 'solid',
      strokeWidth: 2,
      roughness: 1,
      opacity: 100,
      groupIds: [],
      text,
      fontSize: 20,
      fontFamily: 1,
      textAlign: 'center',
      verticalAlign: 'middle',
      points: [],
      locked: false
    });

    // Diamond template
    const diamond = (id, text) => ({
      ...rectangle(id, text),
      type: 'diamond'
    });

    // Arrow template
    const arrow = (id, startId, endId, startX, startY, endX, endY) => ({
      id,
      type: 'arrow',
      x: startX,
      y: startY,
      width: Math.abs(endX - startX),
      height: Math.abs(endY - startY),
      angle: 0,
      strokeColor: '#000000',
      backgroundColor: 'transparent',
      fillStyle: 'solid',
      strokeWidth: 2,
      roughness: 1,
      opacity: 100,
      groupIds: [],
      points: [[0,0],[endX - startX, endY - startY]],
      start: { id: startId },
      end: { id: endId },
      label: { text: '' },
      locked: false
    });

    let boxId;
    if (lower.includes('user')) {
      boxId = 'user_' + existingElements.length;
      elements.push(rectangle(boxId, 'User'));
    } else if (lower.includes('load balancer')) {
      boxId = 'lb_' + existingElements.length;
      elements.push(diamond(boxId, 'Load Balancer'));
    } else if (lower.includes('backend server') || lower.includes('server')) {
      boxId = 'server_' + existingElements.length;
      elements.push(rectangle(boxId, 'Backend Server'));
    } else if (lower.includes('blob storage') || lower.includes('storage')) {
      boxId = 'storage_' + existingElements.length;
      elements.push(rectangle(boxId, 'Blob Storage'));
    } else {
      boxId = 'box_' + existingElements.length;
      elements.push(rectangle(boxId, stepDesc));
    }

    // Add arrow from previous element to current
    if (existingElements.length > 0) {
      const prev = existingElements[existingElements.length - 1];
      const prevX = prev.x + (prev.width || 120);
      const prevY = prev.y + (prev.height || 60) / 2;
      const curr = elements[0];
      const currX = curr.x;
      const currY = curr.y + (curr.height || 60) / 2;
      elements.push(arrow('arrow_' + existingElements.length, prev.id, curr.id, prevX, prevY, currX, currY));
    }

    return elements;
  }
}

module.exports = DiagramBuilder;
