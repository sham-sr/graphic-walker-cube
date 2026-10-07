import { tableFromJSON, vectorFromArray } from 'apache-arrow';
import { BN } from 'apache-arrow/util/bn';
import { describe, expect, test } from 'vitest';
import { arrowToJSON, transformData } from './result';

describe('arrowToJSON', () => {
    test('converts apache-arrow Vector to a plain array', () => {
        const vector = vectorFromArray([1, 2.5, 3]);
        expect(arrowToJSON(vector)).toEqual([1, 2.5, 3]);
    });

    test('converts vector-like objects when constructor name is minified', () => {
        class a {
            length = 2;
            private readonly data = [0, 10];
            get(index: number) {
                return this.data[index];
            }
            toArray() {
                return this.data;
            }
            *[Symbol.iterator]() {
                yield* this.data;
            }
        }
        expect(arrowToJSON(new a())).toEqual([0, 10]);
    });

    test('converts Date and bigint like before', () => {
        const date = new Date('2020-01-01T00:00:00.000Z');
        expect(arrowToJSON(date)).toBe(date.getTime());
        expect(arrowToJSON(BigInt('9007199254740991'))).toBe(9007199254740991);
        expect(arrowToJSON(BigInt('9007199254740992'))).toBe('9007199254740992');
    });

    test('converts Arrow BN values', () => {
        const bn = BN.signed(new Int32Array([42]));
        expect(arrowToJSON(bn)).toBe(42);
    });
});

describe('transformData', () => {
    test('decodes list columns so bin bounds are numeric array elements', () => {
        const table = tableFromJSON([{ bin_x: [0, 10] }, { bin_x: [10, 20] }]);
        const rows = transformData(table as Parameters<typeof transformData>[0]) as Array<{ bin_x: number[] }>;
        expect(rows[0].bin_x).toEqual([0, 10]);
        expect(typeof rows[0].bin_x[0]).toBe('number');
        expect(rows[1].bin_x[0]).toBe(10);
    });
});
