import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'icon' | 'outline';
  fullWidth?: boolean;
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  fullWidth = false,
  icon,
  iconPosition = 'left',
  className,
  disabled,
  ...props
}) => {
  const baseStyles = 'inline-flex items-center justify-center font-sketch font-bold transition-all duration-150 select-none sketch-btn-press disabled:opacity-50 disabled:pointer-events-none';

  const variants = {
    // 4real Solid Ink-Red button (Zero Neon)
    primary: 'bg-[#9b2c2c] hover:bg-[#b91c1c] text-white border-2 border-black rounded-none py-3 px-5 sketch-shadow text-base tracking-wide',
    
    // 4real Paper White button
    secondary: 'bg-white hover:bg-[#fbfaf7] text-[#1a1a1a] border-2 border-black rounded-none py-3 px-5 sketch-shadow text-base',
    
    // 4real Outline
    outline: 'border-2 border-black hover:bg-black/5 text-[#1a1a1a] rounded-none py-2.5 px-4 sketch-shadow-xs',
    
    // Header icon buttons
    icon: 'p-2 rounded-none bg-white hover:bg-[#fbfaf7] border-2 border-black text-[#1a1a1a] hover:text-[#9b2c2c] sketch-shadow-xs',
  };

  return (
    <button
      className={twMerge(
        clsx(
          baseStyles,
          variants[variant],
          fullWidth && 'w-full',
          className
        )
      )}
      disabled={disabled}
      {...props}
    >
      {icon && iconPosition === 'left' && <span className="mr-2 flex items-center">{icon}</span>}
      <span>{children}</span>
      {icon && iconPosition === 'right' && <span className="ml-2 flex items-center">{icon}</span>}
    </button>
  );
};
