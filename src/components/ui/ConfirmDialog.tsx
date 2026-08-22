import React from 'react';
import { AlertTriangle } from 'lucide-react';

export interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  detail?: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'primary';
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  title,
  message,
  detail,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'danger',
  onConfirm,
  onCancel,
}) => {
  if (!isOpen) return null;

  const getVariantStyles = () => {
    switch (variant) {
      case 'danger':
        return {
          btnBg: 'bg-[#9b2c2c] hover:bg-[#802222] text-white',
          headerBg: 'bg-[#fee2e2] text-[#991b1b]',
          icon: <AlertTriangle className="w-5 h-5 text-[#991b1b]" />,
        };
      case 'warning':
        return {
          btnBg: 'bg-[#ca8a04] hover:bg-[#a16207] text-white',
          headerBg: 'bg-[#fef3c7] text-[#854d0e]',
          icon: <AlertTriangle className="w-5 h-5 text-[#854d0e]" />,
        };
      default:
        return {
          btnBg: 'bg-[#1a365d] hover:bg-[#122844] text-white',
          headerBg: 'bg-[#e0f2fe] text-[#0369a1]',
          icon: <AlertTriangle className="w-5 h-5 text-[#0369a1]" />,
        };
    }
  };

  const styles = getVariantStyles();

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      aria-describedby="confirm-dialog-description"
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[1px] flex items-center justify-center p-4 animate-fade-in"
    >
      <div className="w-full max-w-[340px] bg-[#fbfaf7] border-4 border-black p-4 sketch-shadow font-sketch text-[#1a1a1a] flex flex-col gap-3">
        {/* Header */}
        <div className={`flex items-center gap-2 p-2 border-2 border-black ${styles.headerBg}`}>
          {styles.icon}
          <h2 id="confirm-dialog-title" className="text-base font-bold uppercase tracking-wide">
            {title}
          </h2>
        </div>

        {/* Description */}
        <div className="bg-white border-2 border-black p-3 text-xs leading-relaxed flex flex-col gap-1.5">
          <p id="confirm-dialog-description" className="font-bold text-[#1a1a1a]">
            {message}
          </p>
          {detail && (
            <p className="text-[#1a1a1a]/70 font-mono text-[11px] bg-[#f2efe9] p-1.5 border border-black/20">
              {detail}
            </p>
          )}
        </div>

        {/* Buttons */}
        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-2.5 bg-white hover:bg-[#f2efe9] text-[#1a1a1a] border-2 border-black font-sketch text-xs font-bold transition-colors cursor-pointer"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`flex-1 py-2.5 border-2 border-black font-sketch text-xs font-bold sketch-shadow-xs active:translate-x-[1px] active:translate-y-[1px] transition-transform cursor-pointer ${styles.btnBg}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
