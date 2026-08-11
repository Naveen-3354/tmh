'use client';

import { X } from 'lucide-react';
import { useEffect, useId, useRef } from 'react';

import { cn } from '@/lib/utils';

/**
 * A bottom sheet built on the native `<dialog>` element.
 *
 * Native rather than a Radix portal: focus trapping, Escape handling, inert
 * background and the top layer all come from the platform, which is less code
 * and better behaved with a mobile keyboard open.
 */
export function Sheet({
  open,
  onClose,
  title,
  description,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onClose={onClose}
      onCancel={onClose}
      onClick={(event) => {
        // Clicking the backdrop closes; clicking the panel must not.
        if (event.target === ref.current) onClose();
      }}
      className={cn(
        'm-0 mt-auto w-full max-w-lg rounded-t-2xl border border-border bg-card p-0 text-card-foreground',
        'backdrop:bg-black/60 backdrop:backdrop-blur-sm',
        'sm:mx-auto sm:my-auto sm:rounded-2xl',
        'open:animate-in open:slide-in-from-bottom-4 open:fade-in',
        className,
      )}
    >
      <div className="flex max-h-[85vh] flex-col">
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="font-medium tracking-tight">
              {title}
            </h2>
            {description && (
              <p id={descriptionId} className="mt-0.5 text-sm text-muted-foreground">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground"
          >
            <X aria-hidden className="size-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </dialog>
  );
}
