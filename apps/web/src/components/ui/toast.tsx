'use client';

import { AlertCircle, CheckCircle2, Undo2 } from 'lucide-react';
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { cn } from '@/lib/utils';

interface Toast {
  id: number;
  tone: 'success' | 'error';
  message: string;
  onUndo?: () => void;
}

interface ToastApi {
  show: (toast: Omit<Toast, 'id'>) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const VISIBLE_MS = 6000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const show = useCallback(
    (toast: Omit<Toast, 'id'>) => {
      const id = nextId.current++;
      setToasts((current) => [...current.slice(-2), { ...toast, id }]);
      setTimeout(() => dismiss(id), VISIBLE_MS);
    },
    [dismiss],
  );

  const api = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}

      {/* Announced politely: a confirmation should not interrupt a screen
          reader mid-sentence, but it must not be silent either. */}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex flex-col items-center gap-2 px-4 sm:bottom-6"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={cn(
              'pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-xl border px-4 py-3 shadow-lg',
              'border-border bg-popover text-popover-foreground',
            )}
          >
            {toast.tone === 'success' ? (
              <CheckCircle2 aria-hidden className="size-4 shrink-0 text-primary" />
            ) : (
              <AlertCircle aria-hidden className="size-4 shrink-0 text-destructive" />
            )}
            <p className="min-w-0 flex-1 text-sm">{toast.message}</p>
            {toast.onUndo && (
              <button
                type="button"
                onClick={() => {
                  toast.onUndo?.();
                  dismiss(toast.id);
                }}
                className="flex shrink-0 items-center gap-1 text-sm font-medium text-primary hover:underline"
              >
                <Undo2 aria-hidden className="size-3.5" />
                Undo
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside <ToastProvider>.');
  return context;
}
