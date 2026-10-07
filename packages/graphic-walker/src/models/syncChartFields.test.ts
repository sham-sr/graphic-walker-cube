import { COUNT_FIELD_ID, MEA_KEY_ID, MEA_VAL_ID } from '../constants';
import type { IMutField, IViewField } from '../interfaces';
import { newChart, syncChartFieldsWithMeta } from './visSpecHistory';

const BASE_META: IMutField[] = [
    { fid: 'category', name: 'Category', semanticType: 'nominal', analyticType: 'dimension' },
    { fid: 'sales', name: 'Sales', semanticType: 'quantitative', analyticType: 'measure' },
];

describe('syncChartFieldsWithMeta', () => {
    test('returns the same reference when meta is unchanged', () => {
        const chart = newChart(BASE_META, 'Chart');
        expect(syncChartFieldsWithMeta(chart, BASE_META)).toBe(chart);
    });

    test('adds a new meta field before count and virtual fields', () => {
        const chart = newChart(BASE_META, 'Chart');
        const meta: IMutField[] = [...BASE_META, { fid: 'profit', name: 'Profit', semanticType: 'quantitative', analyticType: 'measure' }];
        const synced = syncChartFieldsWithMeta(chart, meta);
        const measureFids = synced.encodings.measures.map((f) => f.fid);
        const profitIdx = measureFids.indexOf('profit');
        const countIdx = measureFids.indexOf(COUNT_FIELD_ID);
        const meaValIdx = measureFids.indexOf(MEA_VAL_ID);
        expect(profitIdx).toBeGreaterThanOrEqual(0);
        expect(profitIdx).toBeLessThan(countIdx);
        expect(profitIdx).toBeLessThan(meaValIdx);
    });

    test('removes vanished raw fields from pools and encoding channels', () => {
        const chart = newChart(BASE_META, 'Chart');
        chart.encodings.rows = [{ fid: 'sales', name: 'Sales', semanticType: 'quantitative', analyticType: 'measure', aggName: 'sum' }];
        chart.encodings.columns = [{ fid: 'category', name: 'Category', semanticType: 'nominal', analyticType: 'dimension' }];
        const meta: IMutField[] = [{ fid: 'category', name: 'Category', semanticType: 'nominal', analyticType: 'dimension' }];
        const synced = syncChartFieldsWithMeta(chart, meta);
        expect(synced.encodings.measures.map((f) => f.fid)).not.toContain('sales');
        expect(synced.encodings.rows.map((f) => f.fid)).toEqual([]);
        expect(synced.encodings.columns.map((f) => f.fid)).toEqual(['category']);
    });

    test('keeps computed fields when raw meta fields disappear', () => {
        const chart = newChart(BASE_META, 'Chart');
        const computed: IViewField = {
            fid: 'computed_sum',
            name: 'Computed sum',
            semanticType: 'quantitative',
            analyticType: 'measure',
            aggName: 'sum',
            computed: true,
            expression: { op: 'one', params: [], as: 'computed_sum' },
        };
        chart.encodings.measures = [computed, ...chart.encodings.measures];
        const synced = syncChartFieldsWithMeta(chart, [{ fid: 'category', name: 'Category', semanticType: 'nominal', analyticType: 'dimension' }]);
        expect(synced.encodings.measures.some((f) => f.fid === 'computed_sum')).toBe(true);
    });

    test('updates renamed field labels from meta', () => {
        const chart = newChart(BASE_META, 'Chart');
        const meta: IMutField[] = [
            { fid: 'category', name: 'Product category', semanticType: 'nominal', analyticType: 'dimension' },
            { fid: 'sales', name: 'Sales', semanticType: 'quantitative', analyticType: 'measure' },
        ];
        const synced = syncChartFieldsWithMeta(chart, meta);
        const category = synced.encodings.dimensions.find((f) => f.fid === 'category');
        expect(category?.name).toBe('Product category');
        expect(category?.basename).toBe('Product category');
    });

    test('preserves a field the user moved from dimensions to measures', () => {
        const chart = newChart(BASE_META, 'Chart');
        const categoryField = chart.encodings.dimensions.find((f) => f.fid === 'category')!;
        chart.encodings.dimensions = chart.encodings.dimensions.filter((f) => f.fid !== 'category');
        chart.encodings.measures = [
            ...chart.encodings.measures.filter((f) => f.fid !== COUNT_FIELD_ID && f.fid !== MEA_VAL_ID),
            { ...categoryField, analyticType: 'measure', aggName: 'sum' },
            ...chart.encodings.measures.filter((f) => f.fid === COUNT_FIELD_ID || f.fid === MEA_VAL_ID),
        ];
        const synced = syncChartFieldsWithMeta(chart, BASE_META);
        expect(synced.encodings.dimensions.map((f) => f.fid)).not.toContain('category');
        expect(synced.encodings.measures.map((f) => f.fid)).toContain('category');
        expect(synced.encodings.measures.find((f) => f.fid === 'category')?.aggName).toBe('sum');
    });

    test('keeps virtual pool fields', () => {
        const chart = newChart(BASE_META, 'Chart');
        const synced = syncChartFieldsWithMeta(chart, BASE_META);
        expect(synced.encodings.dimensions.some((f) => f.fid === MEA_KEY_ID)).toBe(true);
        expect(synced.encodings.measures.some((f) => f.fid === COUNT_FIELD_ID)).toBe(true);
        expect(synced.encodings.measures.some((f) => f.fid === MEA_VAL_ID)).toBe(true);
    });
});
