import { createCubeCellKey } from './pathKey';
import type { IPivotCube, IPivotTablePath } from './interface';
import {
    collectMeasureExtent,
    formatPercent,
    heatmapFill,
    measureValueKey,
    nextSortMode,
    normalize01,
    percentShare,
    readNumericCell,
    resolvePivotColorMode,
    resolvePivotHeaderMode,
    resolvePivotPercentMode,
    resolvePivotTotals,
    pivotTotalsFromInput,
    formatPivotHeaderValue,
} from './display';

function cubeWith(path: IPivotTablePath, sales: number): IPivotCube {
    return { cells: { [createCubeCellKey(path)]: { sales_sum: sales } } };
}

const measure = { fid: 'sales', aggName: 'sum' };
const west = [{ key: 'region', value: 'West' }];
const east = [{ key: 'region', value: 'East' }];
const y2020 = [{ key: 'year', value: 2020 }];

describe('pivot display helpers', () => {
    test('resolves heatmap as the default color mode', () => {
        expect(resolvePivotColorMode(undefined)).toBe('heatmap');
        expect(resolvePivotPercentMode(undefined)).toBe('none');
        expect(measureValueKey(measure, true)).toBe('sales_sum');
    });

    test('normalizes a domain and paints a readable heatmap', () => {
        expect(normalize01(5, 0, 10)).toBe(0.5);
        expect(normalize01(3, 3, 3)).toBe(0.5);
        expect(heatmapFill(0, false)).toMatch(/^rgb\(/);
        expect(heatmapFill(1, true)).toMatch(/^rgba\(/);
    });

    test('computes row / column / grand percent from cube rollups', () => {
        const cube: IPivotCube = {
            cells: {
                ...cubeWith([...west, ...y2020], 10).cells,
                ...cubeWith(west, 40).cells,
                ...cubeWith(y2020, 25).cells,
                ...cubeWith([], 100).cells,
            },
        };
        expect(percentShare(cube, west, y2020, measure, true, 'row', 10)).toBeCloseTo(0.25);
        expect(percentShare(cube, west, y2020, measure, true, 'column', 10)).toBeCloseTo(0.4);
        expect(percentShare(cube, west, y2020, measure, true, 'grand', 10)).toBeCloseTo(0.1);
        expect(formatPercent(0.251)).toMatch(/25[.,]1%/);
    });

    test('extent ignores summary leaves', () => {
        const cube: IPivotCube = {
            cells: {
                ...cubeWith(west, 10).cells,
                ...cubeWith(east, 30).cells,
                ...cubeWith([], 999).cells,
            },
        };
        const extent = collectMeasureExtent(
            cube,
            [
                { kind: 'value', key: 'West', value: 'West', sort: '', uniqueKey: 'w', fieldKey: 'region', children: [], height: 0, isCollapsed: true, path: west },
                { kind: 'value', key: 'East', value: 'East', sort: '', uniqueKey: 'e', fieldKey: 'region', children: [], height: 0, isCollapsed: true, path: east },
                { kind: 'summary', key: 't', value: 'total', sort: '', uniqueKey: 's', fieldKey: '', children: [], height: 0, isCollapsed: true, path: [] },
            ],
            [{ kind: 'value', key: 'root', value: 'root', sort: '', uniqueKey: 'c', fieldKey: '', children: [], height: 0, isCollapsed: true, path: [] }],
            measure,
            true,
            (left) => readNumericCell(cube.cells[createCubeCellKey(left.path)], measure, true)
        );
        expect(extent).toEqual({ min: 10, max: 30 });
    });

    test('cycles header sort none → asc → desc → none', () => {
        expect(nextSortMode(undefined)).toBe('ascending');
        expect(nextSortMode('ascending')).toBe('descending');
        expect(nextSortMode('descending')).toBe('none');
    });

    test('maps legacy showTableSummary onto independent row and column modes', () => {
        expect(resolvePivotTotals({ showTableSummary: true })).toEqual({ rows: 'all', columns: 'all' });
        expect(resolvePivotTotals({ showTableSummary: false })).toEqual({ rows: 'off', columns: 'off' });
        expect(resolvePivotTotals({ showTableSummary: true, pivotRowTotals: 'off', pivotColumnTotals: 'grand' })).toEqual({
            rows: 'off',
            columns: 'grand',
        });
        expect(resolvePivotTotals({ showTableSummary: true }, false)).toEqual({ rows: 'off', columns: 'off' });
        expect(pivotTotalsFromInput(true)).toEqual({ rows: 'all', columns: 'all' });
        expect(pivotTotalsFromInput({ rows: 'grand' })).toEqual({ rows: 'grand', columns: 'off' });
    });

    test('formats summary headers without parsing them as dates', () => {
        expect(
            formatPivotHeaderValue(
                { kind: 'summary', key: 't', value: '__pivot_summary__', sort: '', uniqueKey: 's', fieldKey: '', children: [], height: 0, isCollapsed: true, path: [] },
                undefined,
                [],
                0
            )
        ).toBe('Total');
        expect(
            formatPivotHeaderValue(
                {
                    kind: 'summary',
                    key: 't',
                    value: '__pivot_summary__',
                    sort: '',
                    uniqueKey: 's',
                    fieldKey: '',
                    children: [],
                    height: 0,
                    isCollapsed: true,
                    path: [{ key: 'region', value: 'East' }],
                },
                undefined,
                [{ fid: 'region', name: 'Region', analyticType: 'dimension', semanticType: 'nominal' }],
                0
            )
        ).toBe('Total: East');
        const dateField = { fid: 'date', name: 'Date', analyticType: 'dimension' as const, semanticType: 'temporal' as const };
        expect(
            formatPivotHeaderValue(
                {
                    kind: 'summary',
                    key: 't',
                    value: '__pivot_summary__',
                    sort: '',
                    uniqueKey: 's',
                    fieldKey: 'date',
                    children: [],
                    height: 0,
                    isCollapsed: true,
                    path: [],
                },
                dateField,
                [dateField],
                0
            )
        ).toBe('Total');
    });

    test('resolves nested vs repeated header mode', () => {
        expect(resolvePivotHeaderMode(undefined)).toBe('nested');
        expect(resolvePivotHeaderMode(false)).toBe('nested');
        expect(resolvePivotHeaderMode('nested')).toBe('nested');
        expect(resolvePivotHeaderMode(true)).toBe('repeat');
        expect(resolvePivotHeaderMode('repeat')).toBe('repeat');
    });
});
