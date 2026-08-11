'use client';

import { Loader2 } from 'lucide-react';
import { useState, useTransition } from 'react';

import { logMood } from '@/app/actions/logs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sheet } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { MOOD_LABELS, SYMPTOM_TAGS, type LogOutcome } from '@tmh/shared';

/**
 * Faces rather than numbers: a 1–5 scale is easier to answer honestly when it
 * is shown as expression rather than as a score to optimise.
 */
const FACES: Record<number, string> = { 1: '😞', 2: '🙁', 3: '😐', 4: '🙂', 5: '😄' };

export function MoodSheet({
  open,
  onClose,
  onLogged,
}: {
  open: boolean;
  onClose: () => void;
  onLogged: (outcome: LogOutcome) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [score, setScore] = useState<number | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [note, setNote] = useState('');

  const submit = (chosen: number, withDetail = false) => {
    setScore(chosen);
    startTransition(async () => {
      const outcome = await logMood({
        score: chosen,
        tags: withDetail ? tags : [],
        ...(withDetail && note.trim() ? { note: note.trim() } : {}),
      });
      setScore(null);
      setTags([]);
      setNote('');
      onLogged(outcome);
    });
  };

  const toggleTag = (tag: string) =>
    setTags((current) =>
      current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag],
    );

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="How are you feeling?"
      description="Tap a face to log it. Details are optional."
    >
      <div className="flex flex-col gap-5">
        <fieldset>
          <legend className="sr-only">Mood</legend>
          <div className="grid grid-cols-5 gap-2">
            {[1, 2, 3, 4, 5].map((value) => (
              <button
                key={value}
                type="button"
                disabled={pending}
                onClick={() => submit(value)}
                aria-label={MOOD_LABELS[value]}
                className={cn(
                  'flex flex-col items-center gap-1 rounded-xl border border-border p-3 transition-colors',
                  'hover:border-mood hover:bg-mood/10 disabled:opacity-60',
                )}
              >
                {pending && score === value ? (
                  <Loader2 aria-hidden className="size-6 animate-spin text-mood" />
                ) : (
                  <span aria-hidden className="text-2xl leading-none">
                    {FACES[value]}
                  </span>
                )}
                <span className="text-[11px] leading-tight text-muted-foreground">
                  {MOOD_LABELS[value]}
                </span>
              </button>
            ))}
          </div>
        </fieldset>

        <details className="group">
          <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">
            Add symptoms or a note
          </summary>

          <div className="mt-4 flex flex-col gap-4">
            <fieldset>
              <legend className="mb-2 text-sm font-medium">Symptoms</legend>
              <div className="flex flex-wrap gap-1.5">
                {SYMPTOM_TAGS.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTag(tag)}
                    aria-pressed={tags.includes(tag)}
                    className={cn(
                      'rounded-full border border-border px-3 py-1 text-xs transition-colors',
                      tags.includes(tag)
                        ? 'border-mood bg-mood/15 text-foreground'
                        : 'text-muted-foreground hover:border-mood/50',
                    )}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </fieldset>

            <div>
              <Label htmlFor="mood-note">Note</Label>
              <Input
                id="mood-note"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Anything worth remembering"
                className="mt-1.5"
              />
            </div>

            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((value) => (
                <Button
                  key={value}
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  onClick={() => submit(value, true)}
                  aria-label={`Log ${MOOD_LABELS[value]} with details`}
                  className="flex-1"
                >
                  <span aria-hidden>{FACES[value]}</span>
                </Button>
              ))}
            </div>
          </div>
        </details>
      </div>
    </Sheet>
  );
}
