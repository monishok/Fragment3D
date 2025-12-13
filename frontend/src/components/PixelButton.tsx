import { cn } from '@/lib/utils';

interface PixelButtonProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  type?: 'button' | 'submit' | 'reset';
  disabled?: boolean;
}

const PixelButton = ({ children, className, onClick, type = 'button', disabled = false }: PixelButtonProps) => {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "relative px-8 py-3 font-bold uppercase tracking-wider",
        "bg-space-accent/20 text-space-accent-glow border-2 border-space-accent",
        "hover:bg-space-accent/40 hover:text-foreground hover:border-space-accent-glow",
        "transition-all duration-200",
        "shadow-[4px_4px_0_0_hsl(var(--space-accent))]",
        "hover:shadow-[2px_2px_0_0_hsl(var(--space-accent-glow)),0_0_20px_hsl(var(--space-accent)/0.5)]",
        "hover:translate-x-[2px] hover:translate-y-[2px]",
        "active:shadow-none active:translate-x-[4px] active:translate-y-[4px]",
        "disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-x-0 disabled:hover:translate-y-0",
        className
      )}
      style={{ fontFamily: "'Press Start 2P', monospace", fontSize: '12px' }}
    >
      {children}
    </button>
  );
};

export default PixelButton;
