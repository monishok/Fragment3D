import { useEffect, useState, useRef, useMemo } from 'react';
import globeImage from '@/assets/reference-globe.png';

interface Pixel {
  x: number;
  y: number;
  r: number;
  g: number;
  b: number;
  a: number;
}

interface AnimatedPixel extends Pixel {
  startX: number;
  startY: number;
  delay: number;
}

interface PixelGlobeProps {
  onAnimationComplete?: () => void;
}

const PixelGlobe = ({ onAnimationComplete }: PixelGlobeProps = {}) => {
  const [pixels, setPixels] = useState<Pixel[]>([]);
  const [animationComplete, setAnimationComplete] = useState(false);
  const [animationStarted, setAnimationStarted] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Pixel size and sampling rate - smaller values = smaller globe
  const pixelSize = 2;
  const sampleRate = 5; // Sample every 5th pixel (reduced for performance)
  const scale = 1.875; // Scale for ~375px diameter

  // Extract pixels from the image
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);

      const imageData = ctx.getImageData(0, 0, img.width, img.height);
      const data = imageData.data;
      const extractedPixels: Pixel[] = [];

      // Sample pixels at intervals
      for (let y = 0; y < img.height; y += sampleRate) {
        for (let x = 0; x < img.width; x += sampleRate) {
          const i = (y * img.width + x) * 4;
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const a = data[i + 3];

          // Skip transparent and very dark space background pixels
          const brightness = (r + g + b) / 3;
          if (a > 50 && brightness > 25) {
            extractedPixels.push({
              x: (x / sampleRate) * pixelSize * scale,
              y: (y / sampleRate) * pixelSize * scale,
              r, g, b,
              a: a / 255,
            });
          }
        }
      }

      setPixels(extractedPixels);
      setImageLoaded(true);
    };
    img.src = globeImage;
  }, []);

  // Calculate globe dimensions
  const globeWidth = useMemo(() => {
    if (pixels.length === 0) return 200;
    return Math.max(...pixels.map(p => p.x)) + pixelSize;
  }, [pixels]);

  const globeHeight = useMemo(() => {
    if (pixels.length === 0) return 200;
    return Math.max(...pixels.map(p => p.y)) + pixelSize;
  }, [pixels]);

  // Generate animated pixels with starting positions from screen edges
  const animatedPixels = useMemo(() => {
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1920;
    const vh = typeof window !== 'undefined' ? window.innerHeight : 1080;

    return pixels.map((pixel, index): AnimatedPixel => {
      const edge = index % 4;
      let startX: number, startY: number;

      // Push pixels much further off-screen (beyond viewport)
      const offscreenBuffer = 500;

      switch (edge) {
        case 0: // top edge
          startX = Math.random() * vw - vw / 2 - globeWidth / 2;
          startY = -vh - offscreenBuffer;
          break;
        case 1: // right edge
          startX = vw + offscreenBuffer;
          startY = Math.random() * vh - vh / 2 - globeHeight / 2;
          break;
        case 2: // bottom edge
          startX = Math.random() * vw - vw / 2 - globeWidth / 2;
          startY = vh + offscreenBuffer;
          break;
        case 3: // left edge
        default:
          startX = -vw - offscreenBuffer;
          startY = Math.random() * vh - vh / 2 - globeHeight / 2;
          break;
      }

      return {
        ...pixel,
        startX,
        startY,
        delay: Math.random() * 0.6,
      };
    });
  }, [pixels, globeWidth, globeHeight]);

  // Start animation after image loads
  useEffect(() => {
    if (!imageLoaded) return;

    const startTimer = setTimeout(() => {
      setAnimationStarted(true);
    }, 200);

    const completeTimer = setTimeout(() => {
      setAnimationComplete(true);
      onAnimationComplete?.();
    }, 4000);

    return () => {
      clearTimeout(startTimer);
      clearTimeout(completeTimer);
    };
  }, [imageLoaded]);

  // Loading state - render empty space to prevent layout shift
  if (!imageLoaded) {
    return (
      <div className="relative flex items-center justify-center" style={{ width: 150, height: 150 }} />
    );
  }

  // Static render after animation completes
  if (animationComplete) {
    return (
      <div className="relative flex items-center justify-center" style={{ marginTop: '-10px' }}>
        <div
          className="relative"
          style={{
            width: `${globeWidth}px`,
            height: `${globeHeight}px`,
          }}
        >
          {pixels.map((pixel, index) => (
            <div
              key={index}
              className="absolute"
              style={{
                width: `${pixelSize * scale}px`,
                height: `${pixelSize * scale}px`,
                backgroundColor: `rgba(${pixel.r},${pixel.g},${pixel.b},${pixel.a})`,
                left: `${pixel.x}px`,
                top: `${pixel.y}px`,
              }}
            />
          ))}
        </div>
        {/* Fragment3D overlay text */}
        <div className="absolute inset-0 flex items-center justify-center">
          <h1
            className="text-black tracking-wider text-center"
            style={{
              fontFamily: "'Press Start 2P', monospace",
              fontSize: `${Math.min(globeWidth * 0.12, 36)}px`,
              textShadow: '0 0 10px rgba(255,255,255,0.8), 0 0 20px rgba(255,255,255,0.5)',
            }}
          >
            Fragment3D
          </h1>
        </div>
      </div>
    );
  }

  // Animated render
  return (
    <div className="relative flex items-center justify-center overflow-visible" style={{ marginTop: '-10px' }}>
      <div
        className="relative will-change-transform"
        style={{
          width: `${globeWidth}px`,
          height: `${globeHeight}px`,
        }}
      >
        {animatedPixels.map((pixel, index) => (
          <div
            key={index}
            className="absolute will-change-transform"
            style={{
              width: `${pixelSize * scale}px`,
              height: `${pixelSize * scale}px`,
              backgroundColor: `rgba(${pixel.r},${pixel.g},${pixel.b},${pixel.a})`,
              transform: animationStarted
                ? `translate3d(${pixel.x}px, ${pixel.y}px, 0)`
                : `translate3d(${pixel.startX}px, ${pixel.startY}px, 0)`,
              transition: `transform 2.5s cubic-bezier(0.22, 1, 0.36, 1) ${pixel.delay}s`,
            }}
          />
        ))}
      </div>
      {/* Fragment3D overlay text - fades in during animation */}
      <div
        className="absolute inset-0 flex items-center justify-center transition-opacity duration-1000"
        style={{
          opacity: animationStarted ? 1 : 0,
          transitionDelay: '2s'
        }}
      >
        <h1
          className="text-black tracking-wider text-center"
          style={{
            fontFamily: "'Press Start 2P', monospace",
            fontSize: `${Math.min(globeWidth * 0.12, 36)}px`,
            textShadow: '0 0 10px rgba(255,255,255,0.8), 0 0 20px rgba(255,255,255,0.5)',
          }}
        >
          Fragment3D
        </h1>
      </div>
    </div>
  );
};

export default PixelGlobe;
