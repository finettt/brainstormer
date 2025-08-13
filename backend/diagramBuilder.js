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

    // Rectangle template (with text)
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
      locked: false,
      text,
      fontSize: 20,
      fontFamily: 1,
      textAlign: 'center',
      verticalAlign: 'middle'
    });

    // Diamond template (with text)
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

    let boxId, shapeType, label;
    if (lower.includes('user')) {
      boxId = 'user_' + existingElements.length;
      shapeType = 'rectangle';
      label = 'User';
      elements.push(rectangle(boxId, label));
    } else if (lower.includes('load balancer')) {
      boxId = 'lb_' + existingElements.length;
      shapeType = 'diamond';
      label = 'Load Balancer';
      elements.push(diamond(boxId, label));
    } else if (lower.includes('backend server') || lower.includes('server')) {
      boxId = 'server_' + existingElements.length;
      shapeType = 'rectangle';
      label = 'Backend Server';
      elements.push(rectangle(boxId, label));
    } else if (lower.includes('blob storage') || lower.includes('storage')) {
      boxId = 'storage_' + existingElements.length;
      shapeType = 'rectangle';
      label = 'Blob Storage';
      elements.push(rectangle(boxId, label));
    } else {
      boxId = 'box_' + existingElements.length;
      shapeType = 'rectangle';
      label = stepDesc;
      elements.push(rectangle(boxId, label));
    }

    // Add arrow from previous element to current
    // Find previous shape (not text)
    const prevShape = existingElements.slice().reverse().find(e => e.type === 'rectangle' || e.type === 'diamond');
    if (prevShape) {
      const prevX = prevShape.x + (prevShape.width || 120);
      const prevY = prevShape.y + (prevShape.height || 60) / 2;
      const currShape = elements.find(e => e.id === boxId);
      const currX = currShape.x;
      const currY = currShape.y + (currShape.height || 60) / 2;
      elements.push(arrow('arrow_' + existingElements.length, prevShape.id, currShape.id, prevX, prevY, currX, currY));
    }

    return elements;
  }
}

module.exports = DiagramBuilder;
