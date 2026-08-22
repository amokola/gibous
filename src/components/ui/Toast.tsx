import React, { useEffect } from 'react';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastProps {
  id?: string;
  type?: ToastType;
  message: string;
  duration?: number;
  onClose?: () => void;
  className?: string;
}

export const Toast: React.FC<ToastProps> = ({
  type = 'info',
  message,
  duration = 3500,
  onClose,
  className = '',
}) => {
  useEffect(() => {
    if (duration > 0 && onClose) {
      const timer = setTimeout(onClose, duration);
      return () => clearTimeout(timer);
    }
  }, [duration, onClose]);

  const getStyle = () => {
    switch (type) {
      case 'success':
        return {
          container: 'bg-[#dcfce7] text-[#166534] border-black',
          icon: <CheckCircle2 className="w-4 h-4 text-[#166534] shrink-0" />,
        };
      case 'error':
        return {
          container: 'bg-[#fee2e2] text-[#991b1b] border-black',
          icon: <AlertCircle className="w-4 h-4 text-[#991b1b] shrink-0" />,
        };
      case 'warning':
        return {
          container: 'bg-[#fef3c7] text-[#854d0e] border-black',
          icon: <AlertTriangle className="w-4 h-4 text-[#854d0e] shrink-0" />,
        };
      default:
        return {
          container: 'bg-[#e0f2fe] text-[#0369a1] border-black',
          icon: <Info className="w-4 h-4 text-[#0369a1] shrink-0" />,
        };
    }
  };

  const style = getStyle();

  return (
    <div
      role={type === 'error' ? 'alert' : 'status'}
      aria-live={type === 'error' ? 'assertive' : 'polite'}
      className={`border-2 p-2.5 font-sketch text-xs font-bold sketch-shadow-xs flex items-center justify-between gap-2 animate-fade-in ${style.container} ${className}`.trim()}
    >
      <div className="flex items-center gap-2">
        {style.icon}
        <span>{message}</span>
      </div>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Dismiss notification"
          className="p-0.5 hover:bg-black/10 transition-colors cursor-pointer"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
};

export default Toast;
