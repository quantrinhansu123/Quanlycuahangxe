import React, { useState, useCallback, type ReactNode } from 'react';
import { ToastContext, type Toast, type ToastType } from './toast';

export const ToastProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const showToast = useCallback((message: string, type: ToastType = 'success') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts(prev => [...prev, { id, message, type }]);

    // Lỗi giữ lâu hơn để đọc hết nội dung; success vẫn 2s.
    const durationMs = type === 'error' ? 5000 : 2000;
    setTimeout(() => {
      removeToast(id);
    }, durationMs);
  }, [removeToast]);

  return (
    <ToastContext.Provider value={{ showToast, toasts, removeToast }}>
      {children}
    </ToastContext.Provider>
  );
};
