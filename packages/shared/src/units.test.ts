import { describe, expect, it } from 'vitest';

import {
  cmToFeetInches,
  feetInchesToCm,
  formatDistance,
  formatHeight,
  formatVolume,
  formatWeight,
  kgToLb,
  lbToKg,
  round,
} from './units';

describe('round', () => {
  it('rounds without floating-point drift', () => {
    expect(round(1.005, 2)).toBe(1.01);
    expect(round(0.1 + 0.2, 2)).toBe(0.3);
  });
});

describe('weight conversion', () => {
  it('round-trips kilograms and pounds', () => {
    expect(round(kgToLb(lbToKg(180)), 6)).toBe(180);
  });

  it('converts using the international pound', () => {
    expect(round(lbToKg(154.324), 1)).toBe(70);
  });
});

describe('height conversion', () => {
  it('splits centimetres into feet and inches', () => {
    expect(cmToFeetInches(180)).toEqual({ feet: 5, inches: 10.9 });
  });

  it('carries into the next foot instead of rendering 12 inches', () => {
    // 182.87 cm is 5'11.996" — must not display as 5'12".
    expect(cmToFeetInches(182.87)).toEqual({ feet: 6, inches: 0 });
  });

  it('round-trips feet/inches through centimetres', () => {
    expect(round(feetInchesToCm(5, 10), 4)).toBe(177.8);
  });
});

describe('display formatting', () => {
  it('formats weight in the requested system', () => {
    expect(formatWeight(70, 'metric')).toBe('70 kg');
    expect(formatWeight(70, 'imperial')).toBe('154.3 lb');
  });

  it('formats height in the requested system', () => {
    expect(formatHeight(180, 'metric')).toBe('180 cm');
    expect(formatHeight(180, 'imperial')).toBe(`5'11"`);
  });

  it('promotes millilitres to litres past a threshold', () => {
    expect(formatVolume(750, 'metric')).toBe('750 ml');
    expect(formatVolume(2000, 'metric')).toBe('2 L');
    expect(formatVolume(500, 'imperial')).toBe('16.9 fl oz');
  });

  it('formats distance in the requested system', () => {
    expect(formatDistance(5, 'metric')).toBe('5 km');
    expect(formatDistance(5, 'imperial')).toBe('3.11 mi');
  });
});
