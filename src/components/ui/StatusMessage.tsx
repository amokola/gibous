import React from 'react';
import { Info, CheckCircle2, AlertTriangle, AlertCircle } from 'lucide-react';

export interface StatusMessageProps {
  type?: 'info' | 'success' | 'warning' | 'error';
  message: string;
  className?: string;
}

export const StatusMessage: React.FC<StatusMessageProps> = ({
  type = 'info',
  message,
  className = '',
}) => {
  const getStyle = () => {
    switch (type) {
      case 'success':
        return {
          bg: 'bg-[#dcfce7] text-[#166534] border-black',
          icon: <CheckCircle2 className="w-4 h-4 text-[#166534] shrink-0" />,
        };
      case 'warning':
        return {
          bg: 'bg-[#fef3c7] text-[#854d0e] border-black',
          icon: <AlertTriangle className="w-4 h-4 text-[#854d0e] shrink-0" />,
        };
      case 'error':
        return {
          bg: 'bg-[#fee2e2] text-[#991b1b] border-black',
          icon: <AlertCircle className="w-4 h-4 text-[#991b1b] shrink-0" />,
        };
      default:
        return {
          bg: 'bg-[#e0f2fe] text-[#0369a1] border-black',
          icon: <Info className="w-4 h-4 text-[#0369a1] shrink-0" />,
        };
    }
  };

  const style = getStyle();

  return (
    <div
      role={type === 'error' ? 'alert' : 'status'}
      aria-live={type === 'error' ? 'assertive' : 'polite'}
      className={`p-2 border-2 font-sketch text-xs font-bold sketch-shadow-xs flex items-center gap-2 ${style.bg} ${className}`.trim()}
    >
      {style.icon}
      <span>{message}</span>
    </div>
  );
};

export default StatusMessage;
