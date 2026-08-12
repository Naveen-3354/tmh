'use client';

import { Droplets, Dumbbell, Plus, Smile, UtensilsCrossed } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useState, useTransition } from 'react';

import { deleteLogEntry } from '@/app/actions/logs';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import type { LogOutcome } from '@tmh/shared';

import { ActivitySheet } from './activity-sheet';
import { CameraSheet } from './camera-sheet';
import { FoodSheet } from './food-sheet';
import { MoodSheet } from './mood-sheet';
import { MoreSheet } from './more-sheet';
import { WaterSheet } from './water-sheet';
import type { RecentActivity, RecentFood } from '@/lib/queries/recent';
import type { DoseToday } from '@/lib/queries/recent';

export type SheetName = 'water' | 'food' | 'activity' | 'mood' | 'more' | 'camera' | null;

/**
 * The primary logging surface.
 *
 * Pinned within thumb reach on mobile. Every entry point here reaches a
 * completed log in at most two taps for the common case — one to open, one to
 * choose a preset or a recent item (RESEARCH.md D1).
 */
export function QuickAddBar({
  recentFoods,
  recentActivities,
  doses,
  timezone,
  photoRecognitionAvailable,
  photoRecognitionEnabled,
}: {
  recentFoods: RecentFood[];
  recentActivities: RecentActivity[];
  doses: DoseToday[];
  timezone: string;
  photoRecognitionAvailable: boolean;
  photoRecognitionEnabled: boolean;
}) {
  const [sheet, setSheet] = useState<SheetName>(null);
  const [, startTransition] = useTransition();
  const toast = useToast();
  const router = useRouter();

  /**
   * Shared completion path for every sheet.
   *
   * The write has already happened optimistically in the sheet; this reports
   * the outcome, offers undo, and refreshes the server data.
   */
  const handleOutcome = useCallback(
    (outcome: LogOutcome, options: { undoable?: boolean } = {}) => {
      if (!outcome.ok) {
        toast.show({ tone: 'error', message: outcome.error });
        return;
      }

      toast.show({
        tone: 'success',
        message: outcome.summary,
        ...(options.undoable !== false
          ? {
              onUndo: () => {
                startTransition(async () => {
                  const undone = await deleteLogEntry(outcome.kind, outcome.id);
                  if (!undone.ok) {
                    toast.show({ tone: 'error', message: undone.error });
                  }
                  router.refresh();
                });
              },
            }
          : {}),
      });

      setSheet(null);
      router.refresh();
    },
    [router, toast],
  );

  const actions = [
    { name: 'water' as const, label: 'Water', Icon: Droplets, color: 'var(--metric-water)' },
    { name: 'food' as const, label: 'Food', Icon: UtensilsCrossed, color: 'var(--metric-energy)' },
    { name: 'activity' as const, label: 'Move', Icon: Dumbbell, color: 'var(--metric-move)' },
    { name: 'mood' as const, label: 'Mood', Icon: Smile, color: 'var(--metric-mood)' },
    { name: 'more' as const, label: 'More', Icon: Plus, color: 'var(--muted-foreground)' },
  ];

  return (
    <>
      <nav
        aria-label="Quick add"
        className={cn(
          'fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 backdrop-blur-md',
          // Clears the iOS home indicator.
          'pb-[env(safe-area-inset-bottom)]',
        )}
      >
        <ul className="mx-auto flex w-full max-w-3xl items-stretch">
          {actions.map(({ name, label, Icon, color }) => (
            <li key={name} className="flex-1">
              <button
                type="button"
                onClick={() => setSheet(name)}
                aria-haspopup="dialog"
                className={cn(
                  'flex h-16 w-full flex-col items-center justify-center gap-1 transition-colors',
                  'hover:bg-accent/60 active:bg-accent',
                )}
              >
                <Icon aria-hidden className="size-5" style={{ color }} />
                <span className="text-xs font-medium">{label}</span>
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <WaterSheet
        open={sheet === 'water'}
        onClose={() => setSheet(null)}
        onLogged={handleOutcome}
      />
      <FoodSheet
        open={sheet === 'food'}
        onClose={() => setSheet(null)}
        onLogged={handleOutcome}
        onScan={() => setSheet('camera')}
        recentFoods={recentFoods}
        timezone={timezone}
      />
      {/* Mounted only while open, so it starts from clean state and always
          releases the camera when dismissed. */}
      {sheet === 'camera' && (
        <CameraSheet
          open
          onClose={() => setSheet(null)}
          onLogged={handleOutcome}
          photoRecognitionAvailable={photoRecognitionAvailable}
          photoRecognitionEnabled={photoRecognitionEnabled}
        />
      )}
      <ActivitySheet
        open={sheet === 'activity'}
        onClose={() => setSheet(null)}
        onLogged={handleOutcome}
        recentActivities={recentActivities}
      />
      <MoodSheet open={sheet === 'mood'} onClose={() => setSheet(null)} onLogged={handleOutcome} />
      <MoreSheet
        open={sheet === 'more'}
        onClose={() => setSheet(null)}
        onLogged={handleOutcome}
        doses={doses}
        timezone={timezone}
      />
    </>
  );
}
