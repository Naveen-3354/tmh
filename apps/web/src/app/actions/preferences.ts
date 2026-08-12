'use server';

import { profiles } from '@tmh/db';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { queryAsUser } from '@/lib/auth';

/**
 * The kill switch for photo recognition.
 *
 * Off by default. Turning it on is the user's explicit agreement to send a
 * photograph to a third-party provider — a documented exception to brief §8 —
 * so it is never flipped on their behalf, and turning it off takes effect on
 * the very next request because the route reads it every time.
 */
export async function setPhotoRecognition(formData: FormData): Promise<void> {
  const enabled = z.coerce.boolean().parse(formData.get('enabled') === 'true');

  await queryAsUser(async (db) => {
    await db.update(profiles).set({ photoRecognitionEnabled: enabled });
  });

  revalidatePath('/settings');
  revalidatePath('/today');
}
