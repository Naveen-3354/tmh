/**
 * Unit conversion helpers.
 *
 * Storage is always metric (see DECISIONS.md P0-9). These functions exist only
 * for the display edge and for parsing user input in imperial mode.
 */

export const UNIT_SYSTEMS = ['metric', 'imperial'] as const;
export type UnitSystem = (typeof UNIT_SYSTEMS)[number];

const KG_PER_LB = 0.45359237;
const CM_PER_INCH = 2.54;
const INCHES_PER_FOOT = 12;
const ML_PER_FL_OZ = 29.5735295625;
const KM_PER_MILE = 1.609344;

/** Round to a fixed number of decimal places without floating-point drift. */
export function round(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export const lbToKg = (lb: number): number => lb * KG_PER_LB;
export const kgToLb = (kg: number): number => kg / KG_PER_LB;

export const inchesToCm = (inches: number): number => inches * CM_PER_INCH;
export const cmToInches = (cm: number): number => cm / CM_PER_INCH;

export const flOzToMl = (flOz: number): number => flOz * ML_PER_FL_OZ;
export const mlToFlOz = (ml: number): number => ml / ML_PER_FL_OZ;

export const milesToKm = (miles: number): number => miles * KM_PER_MILE;
export const kmToMiles = (km: number): number => km / KM_PER_MILE;

/** Split a centimetre height into feet + inches for imperial display. */
export function cmToFeetInches(cm: number): { feet: number; inches: number } {
  const totalInches = cmToInches(cm);
  const feet = Math.floor(totalInches / INCHES_PER_FOOT);
  const inches = round(totalInches - feet * INCHES_PER_FOOT, 1);
  // Guard the rounding edge: 5'11.96" must not render as 5'12".
  if (inches >= INCHES_PER_FOOT) {
    return { feet: feet + 1, inches: 0 };
  }
  return { feet, inches };
}

export function feetInchesToCm(feet: number, inches: number): number {
  return inchesToCm(feet * INCHES_PER_FOOT + inches);
}

/** Format a stored metric weight for the user's chosen system. */
export function formatWeight(kg: number, system: UnitSystem): string {
  return system === 'metric' ? `${round(kg, 1)} kg` : `${round(kgToLb(kg), 1)} lb`;
}

/** Format a stored metric height for the user's chosen system. */
export function formatHeight(cm: number, system: UnitSystem): string {
  if (system === 'metric') return `${round(cm, 0)} cm`;
  const { feet, inches } = cmToFeetInches(cm);
  return `${feet}'${round(inches, 0)}"`;
}

/** Format a stored millilitre volume for the user's chosen system. */
export function formatVolume(ml: number, system: UnitSystem): string {
  if (system === 'metric') {
    return ml >= 1000 ? `${round(ml / 1000, 2)} L` : `${round(ml, 0)} ml`;
  }
  return `${round(mlToFlOz(ml), 1)} fl oz`;
}

/** Format a stored metric distance for the user's chosen system. */
export function formatDistance(km: number, system: UnitSystem): string {
  return system === 'metric' ? `${round(km, 2)} km` : `${round(kmToMiles(km), 2)} mi`;
}
