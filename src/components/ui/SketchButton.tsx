import React from 'react';

interface SketchButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'blue' | 'yellow' | 'dark' | 'red';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
  children: React.ReactNode;
}

export const SketchButton: React.FC<SketchButtonProps> = ({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  icon,
  iconPosition = 'left',
  children,
  className = '',
  disabled = false,
  ...props
}) => {
  const sizeStyles = {
    sm: 'py-1.5 px-3 text-xs sm:text-sm gap-1.5 rounded-none border-2',
    md: 'py-2.5 px-4 text-base sm:text-lg gap-2 rounded-none border-2',
    lg: 'py-3.5 px-6 text-lg sm:text-xl gap-2.5 rounded-none border-2.5',
  };

  const variantStyles = {
    primary:
      'bg-[#9b2c2c] hover:bg-[#b91c1c] text-white border-black sketch-shadow active:shadow-none',
    blue:
      'bg-[#1a365d] hover:bg-[#23487a] text-white border-black sketch-shadow active:shadow-none',
    yellow:
      'bg-[#fff9c4] hover:bg-[#fef08a] text-[#1a1a1a] border-black sketch-shadow active:shadow-none',
    dark:
      'bg-[#1a1a1a] hover:bg-[#2d2d2d] text-white border-black sketch-shadow active:shadow-none',
    red:
      'bg-[#ef4444] hover:bg-[#dc2626] text-white border-black sketch-shadow active:shadow-none',
  };

  return (
    <button
      type="button"
      disabled={disabled}
      className={`font-sketch font-bold tracking-wider inline-flex items-center justify-center transition-all select-none sketch-btn-press ${
        sizeStyles[size]
      } ${variantStyles[variant]} ${fullWidth ? 'w-full' : ''} ${
        disabled ? 'opacity-40 pointer-events-none cursor-not-allowed' : ''
      } ${className}`}
      {...props}
    >
      {icon && iconPosition === 'left' && <span className="flex-shrink-0">{icon}</span>}
      <span>{children}</span>
      {icon && iconPosition === 'right' && <span className="flex-shrink-0">{icon}</span>}
    </button>
  );
};
