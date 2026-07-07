import React, { useEffect, useRef } from 'react';

interface VideoRendererProps {
  stream: MediaStream | null;
  muted?: boolean;
  autoPlay?: boolean;
  playsInline?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Safely renders a MediaStream into a video element without causing React
 * serialization issues or infinite re-renders.
 */
export const VideoRenderer: React.FC<VideoRendererProps> = ({
  stream,
  muted = true,
  autoPlay = true,
  playsInline = true,
  className,
  style
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (stream) {
      // Only set srcObject if it's different to prevent flickering
      if (video.srcObject !== stream) {
        video.srcObject = stream;
      }
    } else {
      video.srcObject = null;
    }

    // Cleanup isn't strictly necessary for srcObject assignment itself,
    // but good practice.
    return () => {
      // Don't clear on unmount if we might reuse it quickly,
      // but typically we want to release the binding.
      if (video.srcObject === stream) {
        video.srcObject = null;
      }
    };
  }, [stream]);

  return (
    <video
      ref={videoRef}
      muted={muted}
      autoPlay={autoPlay}
      playsInline={playsInline}
      className={className}
      style={{
        objectFit: 'cover',
        backgroundColor: '#000',
        width: '100%',
        height: '100%',
        ...style
      }}
    />
  );
};
