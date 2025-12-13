import { useEffect, useState } from 'react';

interface PixelStar {
  id: number;
  x: number;
  y: number;
  size: number;
  opacity: number;
  twinkleDelay: number;
  color: string;
}

const PixelStars = () => {
  const [stars, setStars] = useState<PixelStar[]>([]);

  useEffect(() => {
    const generateStars = () => {
      const newStars: PixelStar[] = [];
      const starCount = 80;
      
      for (let i = 0; i < starCount; i++) {
        // Mostly white/blue stars with occasional warm ones
        const colorRoll = Math.random();
        let color: string;
        if (colorRoll < 0.6) {
          color = 'hsl(0, 0%, 100%)'; // White
        } else if (colorRoll < 0.8) {
          color = 'hsl(210, 80%, 80%)'; // Light blue
        } else if (colorRoll < 0.9) {
          color = 'hsl(45, 100%, 85%)'; // Warm yellow
        } else {
          color = 'hsl(270, 60%, 80%)'; // Soft purple
        }
        
        newStars.push({
          id: i,
          x: Math.random() * 100,
          y: Math.random() * 100,
          size: Math.random() < 0.7 ? 2 : 3, // Mostly 2px, some 3px for pixel look
          opacity: Math.random() * 0.6 + 0.2,
          twinkleDelay: Math.random() * 6,
          color,
        });
      }
      setStars(newStars);
    };

    generateStars();
  }, []);

  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none">
      {stars.map((star) => (
        <div
          key={star.id}
          className="absolute animate-twinkle"
          style={{
            left: `${star.x}%`,
            top: `${star.y}%`,
            width: `${star.size}px`,
            height: `${star.size}px`,
            backgroundColor: star.color,
            opacity: star.opacity,
            animationDelay: `${star.twinkleDelay}s`,
            animationDuration: `${3 + Math.random() * 2}s`,
          }}
        />
      ))}
    </div>
  );
};

export default PixelStars;
