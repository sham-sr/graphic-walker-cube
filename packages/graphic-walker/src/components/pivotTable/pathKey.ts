import type { IPivotTablePath, PivotTableValue } from './interface';

export function pivotTableValuesEqual(left: unknown, right: unknown): boolean {
    return left === right || (typeof left === 'number' && typeof right === 'number' && Number.isNaN(left) && Number.isNaN(right));
}

export function encodePivotTableValue(value: PivotTableValue): readonly [type: string, value?: string | number | boolean] {
    if (value === null) return ['null'];
    if (value === undefined) return ['undefined'];
    if (typeof value === 'number') {
        if (Number.isNaN(value)) return ['number', 'NaN'];
        if (value === Infinity) return ['number', 'Infinity'];
        if (value === -Infinity) return ['number', '-Infinity'];
        return ['number', value === 0 ? 0 : value];
    }
    return [typeof value, value];
}

export function createPivotPathKey(path: readonly { key: string; value: PivotTableValue }[]): string {
    return JSON.stringify(path.map(({ key, value }) => [key, encodePivotTableValue(value)]));
}

export function createPivotValueKey(value: PivotTableValue): string {
    return JSON.stringify(encodePivotTableValue(value));
}

export function createCubeCellKey(path: IPivotTablePath): string {
    return createPivotPathKey(path);
}
