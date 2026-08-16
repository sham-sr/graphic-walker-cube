import { coerceTemporalValue, normalizeDataByMeta, transData } from './utils';

describe('normalizeDataByMeta', () => {
    test('coerces temporal strings to epoch milliseconds', () => {
        const fields = [
            { fid: 'gwc_0', key: 'gwc_0', name: 'date', analyticType: 'dimension' as const, semanticType: 'temporal' as const },
            { fid: 'gwc_1', key: 'gwc_1', name: 'amount', analyticType: 'measure' as const, semanticType: 'quantitative' as const },
            { fid: 'gwc_2', key: 'gwc_2', name: 'city', analyticType: 'dimension' as const, semanticType: 'nominal' as const },
        ];
        const rows = normalizeDataByMeta([{ gwc_0: '2024-01-15', gwc_1: '12', gwc_2: 'Berlin' }], fields);
        expect(rows[0].gwc_0).toBe(Date.parse('2024-01-15'));
        expect(rows[0].gwc_1).toBe(12);
        expect(rows[0].gwc_2).toBe('Berlin');
    });

    test('coerceTemporalValue keeps finite numbers and nulls empty values', () => {
        expect(coerceTemporalValue(1_700_000_000_000)).toBe(1_700_000_000_000);
        expect(coerceTemporalValue('')).toBeNull();
        expect(coerceTemporalValue(null)).toBeNull();
        expect(coerceTemporalValue('not-a-date')).toBeNull();
    });

    test('transData normalizes inferred temporal columns', () => {
        const { dataSource, fields } = transData([{ date: '2024-06-01', value: 3 }]);
        const dateField = fields.find((field) => field.basename === 'date' || field.name === 'date');
        expect(dateField?.semanticType).toBe('temporal');
        expect(typeof dataSource[0][dateField!.fid]).toBe('number');
    });
});
