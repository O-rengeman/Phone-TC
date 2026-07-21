import { useState, useRef } from 'react';
import { VideoRenderer } from './VideoRenderer';

interface FloatingPipProps {
  stream: MediaStream;
  onClose: () => void;
}

export function FloatingPip({ stream, onClose }: FloatingPipProps) {
  const [position, setPosition] = useState({ x: Math.max(0, window.innerWidth - 180 - 16), y: Math.max(0, window.innerHeight - 120 - 70) });
  const [size, setSize] = useState({ width: 180, height: 120 });
  const pipRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const isResizingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0, posX: 0, posY: 0 });
  const resizeStartRef = useRef({ x: 0, y: 0, width: 0, height: 0 });

  const handlePointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).classList.contains('pip-resize-handle')) {
      isResizingRef.current = true;
      resizeStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        width: size.width,
        height: size.height
      };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      e.stopPropagation();
      return;
    }

    isDraggingRef.current = true;
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      posX: position.x,
      posY: position.y
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (isDraggingRef.current) {
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      setPosition({
        x: Math.max(0, Math.min(window.innerWidth - size.width, dragStartRef.current.posX + dx)),
        y: Math.max(0, Math.min(window.innerHeight - size.height, dragStartRef.current.posY + dy))
      });
    } else if (isResizingRef.current) {
      const dx = e.clientX - resizeStartRef.current.x;
      const dy = e.clientY - resizeStartRef.current.y;
      setSize({
        width: Math.max(100, Math.min(600, resizeStartRef.current.width + dx)),
        height: Math.max(75, Math.min(450, resizeStartRef.current.height + dy))
      });
    }
  };

  const handlePointerUp = () => {
    isDraggingRef.current = false;
    isResizingRef.current = false;
  };

  return (
    <div
      ref={pipRef}
      className="floating-pip"
      style={{
        position: 'fixed',
        left: `${position.x}px`,
        top: `${position.y}px`,
        width: `${size.width}px`,
        height: `${size.height}px`,
        zIndex: 9999,
        touchAction: 'none'
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      <div className="pip-header">
        <span>RETURN OUT</span>
        <button className="pip-close-btn" onClick={onClose}>✕</button>
      </div>
      <div className="pip-content">
        <VideoRenderer stream={stream} className="pip-video-el" />
      </div>
      <div className="pip-resize-handle" />
    </div>
  );
}