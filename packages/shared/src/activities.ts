/**
 * MET (Metabolic Equivalent of Task) values for calorie-burn estimation.
 *
 * Values follow the Compendium of Physical Activities, the same reference the
 * free wger exercise database uses. Kept local rather than fetched so that
 * logging an activity never depends on a third-party API being reachable —
 * wger is used to *enrich* the catalogue, not to make burn estimation work.
 */

export const ACTIVITY_INTENSITIES = ['light', 'moderate', 'vigorous'] as const;
export type ActivityIntensity = (typeof ACTIVITY_INTENSITIES)[number];

export interface ActivityType {
  /** Stable identifier persisted on the activity log row. */
  readonly slug: string;
  readonly label: string;
  readonly category: 'cardio' | 'strength' | 'sport' | 'lifestyle' | 'mind_body';
  /** MET by intensity. Every activity defines all three so the UI never gaps. */
  readonly met: Readonly<Record<ActivityIntensity, number>>;
}

export const ACTIVITY_TYPES: readonly ActivityType[] = [
  {
    slug: 'walking',
    label: 'Walking',
    category: 'cardio',
    met: { light: 2.8, moderate: 3.5, vigorous: 5.0 },
  },
  {
    slug: 'running',
    label: 'Running',
    category: 'cardio',
    met: { light: 6.0, moderate: 9.8, vigorous: 12.8 },
  },
  {
    slug: 'cycling',
    label: 'Cycling',
    category: 'cardio',
    met: { light: 4.0, moderate: 8.0, vigorous: 12.0 },
  },
  {
    slug: 'swimming',
    label: 'Swimming',
    category: 'cardio',
    met: { light: 4.8, moderate: 7.0, vigorous: 10.0 },
  },
  {
    slug: 'rowing',
    label: 'Rowing',
    category: 'cardio',
    met: { light: 4.0, moderate: 7.0, vigorous: 8.5 },
  },
  {
    slug: 'elliptical',
    label: 'Elliptical',
    category: 'cardio',
    met: { light: 4.6, moderate: 5.0, vigorous: 7.0 },
  },
  {
    slug: 'stair_climbing',
    label: 'Stair climbing',
    category: 'cardio',
    met: { light: 4.0, moderate: 8.8, vigorous: 11.0 },
  },
  {
    slug: 'hiking',
    label: 'Hiking',
    category: 'cardio',
    met: { light: 4.5, moderate: 6.0, vigorous: 7.8 },
  },
  {
    slug: 'jump_rope',
    label: 'Jump rope',
    category: 'cardio',
    met: { light: 8.8, moderate: 11.8, vigorous: 12.3 },
  },
  {
    slug: 'hiit',
    label: 'HIIT',
    category: 'cardio',
    met: { light: 6.0, moderate: 8.0, vigorous: 10.0 },
  },
  {
    slug: 'weight_training',
    label: 'Weight training',
    category: 'strength',
    met: { light: 3.5, moderate: 5.0, vigorous: 6.0 },
  },
  {
    slug: 'bodyweight',
    label: 'Bodyweight circuit',
    category: 'strength',
    met: { light: 3.8, moderate: 5.5, vigorous: 8.0 },
  },
  {
    slug: 'crossfit',
    label: 'CrossFit',
    category: 'strength',
    met: { light: 5.0, moderate: 8.0, vigorous: 12.0 },
  },
  {
    slug: 'pilates',
    label: 'Pilates',
    category: 'mind_body',
    met: { light: 2.5, moderate: 3.0, vigorous: 4.0 },
  },
  {
    slug: 'yoga',
    label: 'Yoga',
    category: 'mind_body',
    met: { light: 2.0, moderate: 3.0, vigorous: 4.0 },
  },
  {
    slug: 'stretching',
    label: 'Stretching',
    category: 'mind_body',
    met: { light: 2.0, moderate: 2.3, vigorous: 2.8 },
  },
  {
    slug: 'football',
    label: 'Football / soccer',
    category: 'sport',
    met: { light: 5.0, moderate: 7.0, vigorous: 10.0 },
  },
  {
    slug: 'basketball',
    label: 'Basketball',
    category: 'sport',
    met: { light: 4.5, moderate: 6.5, vigorous: 9.3 },
  },
  {
    slug: 'tennis',
    label: 'Tennis',
    category: 'sport',
    met: { light: 5.0, moderate: 7.3, vigorous: 8.0 },
  },
  {
    slug: 'badminton',
    label: 'Badminton',
    category: 'sport',
    met: { light: 4.5, moderate: 5.5, vigorous: 7.0 },
  },
  {
    slug: 'cricket',
    label: 'Cricket',
    category: 'sport',
    met: { light: 3.8, moderate: 4.8, vigorous: 6.0 },
  },
  {
    slug: 'table_tennis',
    label: 'Table tennis',
    category: 'sport',
    met: { light: 3.0, moderate: 4.0, vigorous: 5.0 },
  },
  {
    slug: 'dancing',
    label: 'Dancing',
    category: 'lifestyle',
    met: { light: 3.0, moderate: 5.0, vigorous: 7.8 },
  },
  {
    slug: 'gardening',
    label: 'Gardening',
    category: 'lifestyle',
    met: { light: 2.8, moderate: 3.8, vigorous: 5.0 },
  },
  {
    slug: 'housework',
    label: 'Housework',
    category: 'lifestyle',
    met: { light: 2.3, moderate: 3.3, vigorous: 4.0 },
  },
  {
    slug: 'other',
    label: 'Other activity',
    category: 'lifestyle',
    met: { light: 2.5, moderate: 4.0, vigorous: 6.0 },
  },
] as const;

const ACTIVITY_BY_SLUG: ReadonlyMap<string, ActivityType> = new Map(
  ACTIVITY_TYPES.map((activity) => [activity.slug, activity]),
);

export function findActivityType(slug: string): ActivityType | undefined {
  return ACTIVITY_BY_SLUG.get(slug);
}

export const ACTIVITY_SLUGS = ACTIVITY_TYPES.map((activity) => activity.slug) as readonly string[];

/**
 * MET for an activity at an intensity, falling back to the generic "other"
 * profile so an unknown slug still produces a usable estimate.
 */
export function metFor(slug: string, intensity: ActivityIntensity): number {
  const activity = findActivityType(slug) ?? findActivityType('other');
  // `other` is a literal in ACTIVITY_TYPES, so this branch is unreachable in
  // practice; the constant keeps the function total without a non-null assert.
  if (!activity) return 4.0;
  return activity.met[intensity];
}
