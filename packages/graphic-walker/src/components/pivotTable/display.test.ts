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
    resolvePivotDateFormat,
    resolvePivotFontSize,
    resolvePivotHeaderMode,
    resolvePivotPercentMode,
    resolvePivotTotals,
    estimatePivotVirtualRowSize,
    pivotLeafCellPresentation,
    pivotHeaderFontPresentation,
    pivotTotalsFromInput,
    formatPivotHeaderValue,
    createPivotNumberFormatter,
    formatPivotGridMetricCell,
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

    test('readNumericCell coerces bigint and numeric strings from DuckDB', () => {
        expect(readNumericCell({ sales_sum: '42' }, measure, true)).toBe(42);
        expect(readNumericCell({ sales_sum: 42n }, measure, true)).toBe(42);
        expect(readNumericCell({ sales: '12.5' }, { fid: 'sales', aggName: 'expr' }, false)).toBe(12.5);
        expect(readNumericCell({ sales_sum: 'n/a' }, measure, true)).toBeUndefined();
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

    test('formats temporal headers as localized grain or truncated ISO', () => {
        expect(resolvePivotDateFormat(undefined)).toBe('human');
        expect(resolvePivotDateFormat('technical')).toBe('technical');
        const monthField = { fid: 'tickets.sell_date.month', name: 'Month', analyticType: 'dimension' as const, semanticType: 'temporal' as const };
        const node = {
            kind: 'value' as const,
            key: 't',
            value: '2025-02-01T00:00:00.000Z',
            sort: '',
            uniqueKey: 'm',
            fieldKey: monthField.fid,
            children: [],
            height: 0,
            isCollapsed: true,
            path: [{ key: monthField.fid, value: '2025-02-01T00:00:00.000Z' }],
        };
        expect(formatPivotHeaderValue(node, monthField, [monthField], 0, undefined, 'technical')).toBe('2025-02');
        expect(formatPivotHeaderValue(node, monthField, [monthField], 0, undefined, 'human', 'en-US').toLowerCase()).toMatch(/feb/);
    });

    test('resolvePivotFontSize maps presets and defaults unknown values', () => {
        expect(resolvePivotFontSize(undefined)).toEqual({ fontPx: 12, rowPx: 32 });
        expect(resolvePivotFontSize('large')).toEqual({ fontPx: 12, rowPx: 32 });
        expect(resolvePivotFontSize(12)).toEqual({ fontPx: 12, rowPx: 32 });
        expect(resolvePivotFontSize(16)).toEqual({ fontPx: 16, rowPx: 40 });
    });

    test('pivot leaf and header presentation use classes or inline styles', () => {
        const defaultMetrics = resolvePivotFontSize(12);
        const largeMetrics = resolvePivotFontSize(16);
        expect(pivotLeafCellPresentation(defaultMetrics)).toEqual({ className: 'h-8 max-h-8 text-xs leading-8' });
        expect(pivotLeafCellPresentation(largeMetrics)).toEqual({
            className: '',
            style: { fontSize: 16, height: 40, maxHeight: 40, lineHeight: '40px' },
        });
        expect(pivotHeaderFontPresentation(defaultMetrics)).toEqual({ className: 'text-xs' });
        expect(pivotHeaderFontPresentation(largeMetrics)).toEqual({ className: '', style: { fontSize: 16 } });
    });

    test('estimatePivotVirtualRowSize scales row height by measure count', () => {
        expect(estimatePivotVirtualRowSize(32, 2)).toBe(64);
        expect(estimatePivotVirtualRowSize(resolvePivotFontSize(16).rowPx, 3)).toBe(120);
    });

    test('formats grid metrics the same way the body cell does', () => {
        const formatNumber = createPivotNumberFormatter(',.1f');
        expect(
            formatPivotGridMetricCell({
                cell: { sales_sum: 1234.5 },
                rowMeasure: null,
                columnMeasure: measure,
                aggregated: true,
                percentMode: 'none',
                formatNumber,
            })
        ).toBe('1,234.5');
        expect(
            formatPivotGridMetricCell({
                cell: null,
                rowMeasure: null,
                columnMeasure: measure,
                aggregated: true,
                percentMode: 'none',
                formatNumber,
            })
        ).toBe('—');
        expect(
            formatPivotGridMetricCell({
                cell: { sales_sum: 1, units_sum: 2 },
                rowMeasure: { fid: 'units', aggName: 'sum' },
                columnMeasure: measure,
                aggregated: true,
                percentMode: 'none',
                formatNumber,
            })
        ).toBe('1.0');
        expect(
            formatPivotGridMetricCell({
                cell: { sales: 9 },
                rowMeasure: null,
                columnMeasure: null,
                aggregated: true,
                percentMode: 'none',
                formatNumber,
            })
        ).toBe('True');

        const left = {
            kind: 'value' as const,
            key: 'region',
            value: 'East',
            sort: '',
            uniqueKey: 'e',
            fieldKey: 'region',
            children: [],
            height: 0,
            isCollapsed: true,
            path: east,
        };
        const top = {
            kind: 'root' as const,
            key: 'root',
            value: 'root',
            sort: '',
            uniqueKey: 'r',
            fieldKey: 'root',
            children: [],
            height: 0,
            isCollapsed: false,
            path: [],
        };
        const cube: IPivotCube = {
            cells: {
                [createCubeCellKey(east)]: { sales_sum: 25 },
                [createCubeCellKey([])]: { sales_sum: 100 },
            },
        };
        expect(
            formatPivotGridMetricCell({
                cell: { sales_sum: 25 },
                rowMeasure: null,
                columnMeasure: measure,
                aggregated: true,
                percentMode: 'grand',
                formatNumber,
                cube,
                left,
                top,
            })
        ).toBe('25%');
        expect(createPivotNumberFormatter('not-a-d3-format')(1234)).toBe((1234).toLocaleString());
    });
});
