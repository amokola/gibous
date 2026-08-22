import React from 'react';
import { Loader2 } from 'lucide-react';

export interface LoadingButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  isLoading?: boolean;
  loadingText?: string;
  variant?: 'primary' | 'secondary' | 'yellow' | 'green' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  children: React.ReactNode;
}

export const LoadingButton: React.FC<LoadingButtonProps> = ({
  isLoading = false,
  loadingText,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  disabled,
  className = '',
  children,
  ...props
}) => {
  const getVariantStyles = () => {
    switch (variant) {
      case 'secondary':
        return 'bg-[#1a365d] text-white hover:bg-[#122844] active:bg-[#0c1a2d]';
      case 'yellow':
        return 'bg-[#fff9c4] text-[#854d0e] hover:bg-[#fef08a] active:bg-[#fde047]';
      case 'green':
        return 'bg-[#166534] text-white hover:bg-[#124d27] active:bg-[#0d381c]';
      case 'outline':
        return 'bg-white text-[#1a1a1a] hover:bg-[#f2efe9] active:bg-[#e8e0d0]';
      case 'primary':
      default:
        return 'bg-[#9b2c2c] text-white hover:bg-[#802222] active:bg-[#661b1b]';
    }
  };

  const getSizeStyles = () => {
    switch (size) {
      case 'sm':
        return 'px-3 py-1.5 text-xs';
      case 'lg':
        return 'px-6 py-3 text-lg';
      case 'md':
      default:
        return 'px-4 py-2.5 text-sm';
    }
  };

  const isDisabled = disabled || isLoading;

  return (
    <button
      {...props}
      disabled={isDisabled}
      aria-busy={isLoading}
      className={`
        border-2 border-black font-sketch font-bold tracking-wide
        transition-all duration-100 flex items-center justify-center gap-2
        ${fullWidth ? 'w-full' : ''}
        ${getSizeStyles()}
        ${getVariantStyles()}
        ${isDisabled ? 'opacity-60 cursor-not-allowed' : 'sketch-shadow-xs active:translate-x-[1px] active:translate-y-[1px] cursor-pointer'}
        ${className}
      `.trim()}
    >
      {isLoading ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin shrink-0" />
          <span>{loadingText || children}</span>
        </>
      ) : (
        children
      )}
    </button>
  );
};

export default LoadingButton;
