/**
 * Science of Gifts - Toast Container Component (Phase 10)
 * Renders understated, non-blocking toast notifications in the editorial aesthetic.
 */

import React, { useEffect, useState } from 'react';
import { toast, ToastMessage } from '../services/toastService';
import { CheckCircle2, AlertCircle, Info, AlertTriangle, X } from 'lucide-react';

export const ToastContainer: React.FC = () => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  useEffect(() => {
    const unsubscribe = toast.subscribe((updated) => {
      setToasts(updated);
    });
    return unsubscribe;
  }, []);

  if (toasts.length === 0) return null;

  return (
    <aside
      aria-live="polite"
      aria-label="Notifications"
      className="fixed bottom-4 right-4 left-4 sm:left-auto sm:bottom-5 sm:right-5 z-50 flex flex-col gap-2.5 max-w-sm pointer-events-none"
    >
      {toasts.map((t) => {
        let icon = <Info className="w-4 h-4 text-blue-700 shrink-0 mt-0.5" />;
        let borderClass = 'border-[#dcd6ca] bg-white text-[#1e232a]';

        if (t.type === 'success') {
          icon = <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />;
          borderClass = 'border-emerald-200 bg-[#f9fdfa] text-[#123624]';
        } else if (t.type === 'error') {
          icon = <AlertCircle className="w-4 h-4 text-rose-700 shrink-0 mt-0.5" />;
          borderClass = 'border-rose-200 bg-[#fdf8f8] text-[#4a1212]';
        } else if (t.type === 'warning') {
          icon = <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />;
          borderClass = 'border-amber-200 bg-[#fefcf6] text-[#4a3512]';
        }

        return (
          <div
            key={t.id}
            role="status"
            className={`pointer-events-auto p-3.5 rounded-xl border shadow-lg transition-all transform translate-y-0 flex items-start justify-between gap-3 ${borderClass}`}
          >
            <div className="flex items-start gap-2.5 flex-1 min-w-0">
              {icon}
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold leading-snug">{t.title}</div>
                {t.description && (
                  <div className="text-[11px] opacity-80 mt-0.5 leading-normal break-words">
                    {t.description}
                  </div>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => toast.dismiss(t.id)}
              aria-label="Dismiss notification"
              className="p-1 -mr-1 -mt-1 opacity-60 hover:opacity-100 rounded-md hover:bg-black/5 transition-opacity"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </aside>
  );
};
