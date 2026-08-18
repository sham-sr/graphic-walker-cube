import { canReuseWalkerSpecs, resolveReplaceSpecs } from './canReuseWalkerSpecs';
import type { WalkerField } from './contract';

const status: WalkerField = {
    fid: 'Orders.status',
    name: 'Status',
    analyticType: 'dimension',
    semanticType: 'nominal',
};
const count: WalkerField = {
    fid: 'Orders.count',
    name: 'Count',
    analyticType: 'measure',
    semanticType: 'quantitative',
};

const chart = JSON.stringify([
    {
        visId: 'c1',
        encodings: {
            dimensions: [{ fid: 'Orders.status' }],
            measures: [{ fid: 'Orders.count' }],
            rows: [{ fid: 'gw_count_fid' }],
        },
    },
]);

describe('canReuseWalkerSpecs', () => {
    test('keeps empty specs', () => {
        expect(canReuseWalkerSpecs('[]', [status])).toBe(true);
        expect(canReuseWalkerSpecs(undefined, [status])).toBe(true);
    });

    test('keeps charts whose encoding fields still exist', () => {
        expect(canReuseWalkerSpecs(chart, [status, count])).toBe(true);
    });

    test('rejects charts that reference a removed field', () => {
        expect(canReuseWalkerSpecs(chart, [status])).toBe(false);
    });

    test('rejects invalid JSON', () => {
        expect(canReuseWalkerSpecs('{', [status])).toBe(false);
    });
});

describe('resolveReplaceSpecs', () => {
    test('reuses previous specs when the input omits them', () => {
        expect(resolveReplaceSpecs(undefined, chart, [status, count])).toEqual({
            specsJson: chart,
            chartsCleared: false,
        });
    });

    test('clears charts when the field set no longer matches', () => {
        expect(resolveReplaceSpecs(undefined, chart, [status])).toEqual({
            specsJson: '[]',
            chartsCleared: true,
        });
    });
});
