'use client';

import { Droplets, Loader2 } from 'lucide-react';
import { useState, useTransition } from 'react';

import { logWater } from '@/app/actions/logs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sheet } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import type { LogOutcome } from '@tmh/shared';

/** Common glass and bottle sizes. One tap from here completes the log. */
const PRESETS = [
  { ml: 250, label: 'Glass', hint: '250 ml' },
  { ml: 500, label: 'Bottle', hint: '500 ml' },
  { ml: 750, label: 'Large', hint: '750 ml' },
] as const;

export function WaterSheet({
  open,
  onClose,
  onLogged,
}: {
  open: boolean;
  onClose: () => void;
  onLogged: (outcome: LogOutcome) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [custom, setCustom] = useState('');
  const [busyPreset, setBusyPreset] = useState<number | null>(null);

  const submit = (amountMl: number) => {
    setBusyPreset(amountMl);
    startTransition(async () => {
      const outcome = await logWater({ amountMl });
      setBusyPreset(null);
      setCustom('');
      onLogged(outcome);
    });
  };

  const customMl = Number(custom);
  const customValid = Number.isFinite(customMl) && customMl > 0 && customMl <= 5000;

  return (
    <Sheet open={open} onClose={onClose} title="Log water" description="Tap an amount to log it.">
      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-3 gap-2">
          {PRESETS.map((preset) => (
            <button
              key={preset.ml}
              type="button"
              disabled={pending}
              onClick={() => submit(preset.ml)}
              className={cn(
                'flex flex-col items-center gap-1.5 rounded-xl border border-border p-4 transition-colors',
                'hover:border-water hover:bg-water/10 disabled:opacity-60',
              )}
            >
              {busyPreset === preset.ml ? (
                <Loader2 aria-hidden className="size-6 animate-spin text-water" />
              ) : (
                <Droplets aria-hidden className="size-6 text-water" />
              )}
              <span className="text-sm font-medium">{preset.label}</span>
              <span className="text-xs text-muted-foreground">{preset.hint}</span>
            </button>
          ))}
        </div>

        <form
          className="flex items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (customValid) submit(Math.round(customMl));
          }}
        >
          <div className="flex-1">
            <Label htmlFor="water-custom">Another amount</Label>
            <Input
              id="water-custom"
              type="number"
              inputMode="numeric"
              min={1}
              max={5000}
              placeholder="ml"
              value={custom}
              onChange={(event) => setCustom(event.target.value)}
              className="mt-1.5"
            />
          </div>
          <Button type="submit" disabled={!customValid || pending}>
            Log
          </Button>
        </form>
      </div>
    </Sheet>
  );
}
