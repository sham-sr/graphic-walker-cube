import { persistedChartRaw, replacePersistedChart, sheetFilterAllowlist } from './sheetFilterFields';

const spec = {
    visId: 'vis1',
    encodings: {
        dimensions: [{ fid: 'city' }, { fid: 'gw_count_fid' }],
        measures: [{ fid: 'amount' }],
        columns: [{ fid: 'weekday' }],
        rows: [{ fid: 'amount' }],
        color: [{ fid: 'channel' }],
        filters: [{ fid: 'station' }, { fid: 'weekday' }],
    },
    config: { geoms: ['bar'] },
};

describe('sheetFilterAllowlist', () => {
    test('keeps sheet channels and drops the full field list and service fids', () => {
        expect(sheetFilterAllowlist(spec)).toEqual(['amount', 'weekday', 'channel', 'station']);
    });

    test('returns nothing when encodings are missing', () => {
        expect(sheetFilterAllowlist({})).toEqual([]);
    });
});

describe('persisted chart raw', () => {
    test('round-trips a sheet replacement', () => {
        const specsJson = JSON.stringify([spec, { visId: 'other', encodings: {}, config: {} }]);
        expect(persistedChartRaw(specsJson, 'vis1')).toContain('"weekday"');
        const next = replacePersistedChart(specsJson, 'vis1', '{"visId":"vis1","replaced":true}');
        expect(next).toContain('replaced');
        expect(persistedChartRaw(next ?? '', 'other')).toContain('other');
        expect(replacePersistedChart(specsJson, 'missing', '{}')).toBeNull();
    });
});
