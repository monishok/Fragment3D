import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import PixelStars from '@/components/PixelStars';
import PixelGlobe from '@/components/PixelGlobe';
import PixelButton from '@/components/PixelButton';
import ScrollIndicator from '@/components/ScrollIndicator';

const Index = () => {
  const navigate = useNavigate();
  const { isLoggedIn } = useAuth();
  const [showButtons, setShowButtons] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);

  // Detect any scroll and trigger navigation with transition
  useEffect(() => {
    if (!isLoggedIn || isTransitioning) return;

    const handleScroll = () => {
      // Any scroll triggers the transition
      if (window.scrollY > 50 && !isTransitioning) {
        setIsTransitioning(true);

        // Navigate to dashboard during the slide-up animation
        setTimeout(() => {
          navigate('/dashboard');
        }, 400); // Navigate mid-animation for smooth transition
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [isLoggedIn, isTransitioning, navigate]);

  const handleAnimationComplete = () => {
    if (!isLoggedIn) {
      setShowButtons(true);
    }
  };

  return (
    <>
      <div
        className={`min-h-screen bg-space-bg flex flex-col items-center justify-center relative overflow-hidden transition-transform duration-700 ease-out ${isTransitioning ? '-translate-y-full' : 'translate-y-0'
          }`}
      >
        <PixelStars />

        <main className="relative z-10 flex flex-col items-center justify-center gap-16 px-4">
          <div className="relative">
            <PixelGlobe onAnimationComplete={handleAnimationComplete} />
          </div>

          {/* Buttons - only show for unauthenticated users after animation */}
          {!isLoggedIn && showButtons && (
            <div
              className="flex flex-col sm:flex-row gap-6 mt-8 transition-opacity duration-700"
              style={{ opacity: showButtons ? 1 : 0 }}
            >
              <PixelButton onClick={() => navigate('/login')}>Login</PixelButton>
              <PixelButton onClick={() => navigate('/register')}>Register</PixelButton>
            </div>
          )}
        </main>

        {/* Scroll indicator for logged-in users */}
        {isLoggedIn && <ScrollIndicator />}
      </div>

      {/* Spacer to enable scrolling for logged-in users */}
      {isLoggedIn && !isTransitioning && (
        <div className="h-screen" aria-hidden="true" />
      )}
    </>
  );
};

export default Index;
