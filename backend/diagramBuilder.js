// DiagramBuilder: deterministic Excalidraw element generator for system diagrams

class DiagramBuilder {
  constructor() {
    this.xStart = 100;
    this.yStart = 100;
    this.xStep = 250;
    this.yStep = 120;
    this.registry = {};
    this.version = 1;
  }

  // Main entry: returns Excalidraw element skeletons for a given step
  buildElements(stepDesc, existingElements = []) {
    const lower = stepDesc.toLowerCase();
    let elements = [];
    let x = this.xStart + existingElements.length * this.xStep;
    let y = this.yStart;
    let boxId, shapeType, label;

    // Helper: create full skeleton for shapes
    const baseShape = (id, type, text) => ({
      id,
      type,
      x,
      y,
      width: 120,
      height: 60,
      angle: 0,
      strokeColor: '#000000',
      backgroundColor: type === 'diamond' ? '#e0e0e0' : '#ffffff',
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
      verticalAlign: 'middle',
      version: this.version++
    });

    // Registry for id lookup
    const registry = { ...this.registry };

    if (lower.includes('user')) {
      boxId = 'user_' + existingElements.length;
      shapeType = 'rectangle';
      label = 'User';
      elements.push(baseShape(boxId, shapeType, label));
      registry[boxId] = { x, y, width: 120, height: 60 };
    } else if (lower.includes('load balancer')) {
      boxId = 'lb_' + existingElements.length;
      shapeType = 'diamond';
      label = 'Load Balancer';
      elements.push(baseShape(boxId, shapeType, label));
      registry[boxId] = { x, y, width: 120, height: 60 };
    } else if (lower.includes('backend server') || lower.includes('server')) {
      boxId = 'server_' + existingElements.length;
      shapeType = 'rectangle';
      label = 'Backend Server';
      elements.push(baseShape(boxId, shapeType, label));
      registry[boxId] = { x, y, width: 120, height: 60 };
    } else if (lower.includes('blob storage') || lower.includes('storage')) {
      boxId = 'storage_' + existingElements.length;
      shapeType = 'rectangle';
      label = 'Blob Storage';
      elements.push(baseShape(boxId, shapeType, label));
      registry[boxId] = { x, y, width: 120, height: 60 };
    } else {
      boxId = 'box_' + existingElements.length;
      shapeType = 'rectangle';
      label = stepDesc;
      elements.push(baseShape(boxId, shapeType, label));
      registry[boxId] = { x, y, width: 120, height: 60 };
    }

    // Arrow template (full skeleton, no label)
    const arrow = (id, startId, endId, startAnchor, endAnchor) => ({
      id,
      type: 'arrow',
      x: startAnchor.x,
      y: startAnchor.y,
      width: Math.abs(endAnchor.x - startAnchor.x),
      height: Math.abs(endAnchor.y - startAnchor.y),
      angle: 0,
      strokeColor: '#000000',
      backgroundColor: 'transparent',
      fillStyle: 'solid',
      strokeWidth: 2,
      roughness: 1,
      opacity: 100,
      groupIds: [],
      points: [[0,0],[endAnchor.x - startAnchor.x, endAnchor.y - startAnchor.y]],
      start: { id: startId },
      end: { id: endId },
      locked: false,
      version: this.version++
    });

    // Find previous shape (not text)
    const prevShape = existingElements.slice().reverse().find(e => e.type === 'rectangle' || e.type === 'diamond');
    if (prevShape) {
      // Use registry for anchor points
      const prevAnchor = {
        x: prevShape.x + (prevShape.width || 120),
        y: prevShape.y + (prevShape.height || 60) / 2
      };
      const currShape = elements.find(e => e.id === boxId);
      const currAnchor = {
        x: currShape.x,
        y: currShape.y + (currShape.height || 60) / 2
      };
      elements.push(arrow('arrow_' + existingElements.length, prevShape.id, currShape.id, prevAnchor, currAnchor));
    }

    // Update registry for next call
    this.registry = { ...registry };

    return elements;
  }
}

module.exports = DiagramBuilder;
