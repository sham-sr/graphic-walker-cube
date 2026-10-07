import { toCountNumber, toFiniteNumber } from './coerceNumber';

describe('coerceNumber', () => {
    test('toFiniteNumber accepts number, bigint, and numeric strings', () => {
        expect(toFiniteNumber(3)).toBe(3);
        expect(toFiniteNumber(2n)).toBe(2);
        expect(toFiniteNumber('29066142')).toBe(29066142);
        expect(toFiniteNumber('29 066 142')).toBe(29066142);
    });

    test('toFiniteNumber rejects non-numeric values', () => {
        expect(toFiniteNumber(null)).toBeUndefined();
        expect(toFiniteNumber('baikppk')).toBeUndefined();
        expect(toFiniteNumber(Number.NaN)).toBeUndefined();
    });

    test('toCountNumber defaults to zero', () => {
        expect(toCountNumber(undefined)).toBe(0);
        expect(toCountNumber('2')).toBe(2);
    });
});
