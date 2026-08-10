import { cn } from '@/lib/utils';

/**
 * Persistent, non-alarming reminder that this is a journal, not a diagnostic
 * tool (brief §8). Deliberately styled as quiet supporting text rather than a
 * warning banner — it should read as context, not as an alert.
 */
export function MedicalDisclaimer({
  className,
  variant = 'block',
}: {
  className?: string;
  variant?: 'block' | 'inline';
}) {
  if (variant === 'inline') {
    return (
      <p className={cn('text-xs leading-relaxed text-muted-foreground', className)}>
        Patterns describe your own logged data. They are not medical advice.
      </p>
    );
  }

  return (
    <aside
      aria-label="Medical disclaimer"
      className={cn(
        'rounded-lg border border-dashed border-border/60 px-4 py-3 text-xs leading-relaxed text-muted-foreground',
        className,
      )}
    >
      tmh is a tracking and journaling tool, not a medical device. It does not diagnose or treat any
      condition, and nothing here is medical advice. Please talk to a clinician about health
      decisions.
    </aside>
  );
}
