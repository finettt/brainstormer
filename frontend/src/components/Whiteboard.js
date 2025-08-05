import React, { useImperativeHandle, forwardRef, useRef } from "react";
import { Excalidraw, exportToBlob } from "@excalidraw/excalidraw";

const whiteboardStyle = {
  flex: 1,  // This allows the whiteboard to take up the remaining space
  height: "100%", // Ensure it takes the full height of the container
  border: "1px solid #ccc",
  marginBottom: "20px",
};

const Whiteboard = forwardRef((props, ref) => {
  const excalidrawRef = useRef(null);

  useImperativeHandle(ref, () => ({
    exportToImage: async () => {
      if (excalidrawRef.current) {
        const blob = await exportToBlob({
          elements: excalidrawRef.current.getSceneElements(),
          appState: excalidrawRef.current.getAppState(),
          mimeType: "image/png",
        });
        return blob;
      }
      return null;
    },
    getSceneAndState: () => {
      if (!excalidrawRef.current) {
        return { elements: [], appState: {} };
      }
      return {
        elements: excalidrawRef.current.getSceneElements(),
        appState: excalidrawRef.current.getAppState(),
      };
    },
    summarizeScene: () => {
      if (!excalidrawRef.current) return '';
      const elements = excalidrawRef.current.getSceneElements();
      return elements.map((el) => {
        const { type, x, y, width, height, text } = el;
        const label = text ? ` labelled '${text}'` : '';
        if (width && height) {
          return `${type} at (${Math.round(x)}, ${Math.round(y)}) size ${Math.round(width)}x${Math.round(height)}${label}`;
        }
        return `${type} at (${Math.round(x)}, ${Math.round(y)})${label}`;
      }).join('; ');
    },
    updateScene: ({ elements }) => {
      if (excalidrawRef.current && typeof excalidrawRef.current.updateScene === "function") {
        const currentElements = excalidrawRef.current.getSceneElements();
        const merged = [...currentElements, ...elements];
        excalidrawRef.current.updateScene({ elements: merged, scrollToContent: true });
      }
    }

  }));

  return (
    <div style={whiteboardStyle}>
      <Excalidraw ref={excalidrawRef} />
    </div>
  );
  
});

export default Whiteboard;
