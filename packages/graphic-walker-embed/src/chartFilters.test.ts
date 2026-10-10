import { parseWalkerCharts } from './chartSpecs';
import { chartFilterFids, patchChartFilterSpecs, visualEncodings } from './chartFilters';

const sheet = {
    visId: 'vis1',
    name: 'Sales',
    encodings: {
        columns: [],
        rows: [],
        filters: [
            { fid: 'region', rule: { type: 'one of', value: ['A'], caseSensitive: false } },
            { fid: 'year', rule: { type: 'range', value: [2020, 2024] } },
        ],
    },
    config: { geoms: ['bar'] },
};

function filtersOf(specsJson: string) {
    const chart = parseWalkerCharts(specsJson).find((item) => item.visId === 'vis1');
    return (chart?.spec.encodings as { filters?: Array<{ fid: string; rule: { type: string; value: unknown } | null }> }).filters ?? [];
}

describe('patchChartFilterSpecs', () => {
    test('changes values and operators without adding or dropping fids', () => {
        const specsJson = JSON.stringify([sheet, { visId: 'other', encodings: { filters: [{ fid: 'keep' }] }, config: {} }]);
        const before = chartFilterFids(parseWalkerCharts(specsJson)[0]?.spec ?? {});
        const patched = patchChartFilterSpecs(specsJson, 'vis1', [
            { fid: 'region', type: 'not in', value: ['B'] },
            { fid: 'year', value: [2021, 2024] },
            { fid: 'missing', type: 'one of', value: ['Z'] },
        ]);
        const filters = filtersOf(patched.specsJson);
        expect(filters.map((filter) => filter.fid)).toEqual(before);
        expect(patched.fids).toEqual(['region', 'year']);
        expect(filters.find((filter) => filter.fid === 'region')?.rule).toEqual({ type: 'not in', value: ['B'] });
        expect(filters.find((filter) => filter.fid === 'year')?.rule).toEqual({ type: 'range', value: [2021, 2024] });
        const other = parseWalkerCharts(patched.specsJson).find((chart) => chart.visId === 'other');
        expect(chartFilterFids(other?.spec ?? {})).toEqual(['keep']);
    });

    test('writes the new rule into a history spec and appends writeFilter without changing fids', () => {
        const history = JSON.stringify({
            base: {
                visId: 'vis1',
                name: 'График 1',
                encodings: sheet.encodings,
                config: sheet.config,
            },
            timeline: [[8, 0, { type: 'one of', value: ['OLD'] }]],
        });
        const specsJson = JSON.stringify([history]);
        const before = chartFilterFids(parseWalkerCharts(specsJson)[0]?.spec ?? {});
        const patched = patchChartFilterSpecs(specsJson, 'vis1', [{ fid: 'region', type: 'one of', value: ['B'] }]);
        expect(patched.fids).toEqual(before);
        const stored = JSON.parse(JSON.parse(patched.specsJson)[0] as string) as {
            base: { encodings: { filters: Array<{ fid: string; rule: { value: unknown } }> } };
            timeline: unknown[];
        };
        expect(stored.base.encodings.filters.map((filter) => filter.fid)).toEqual(['region', 'year']);
        expect(stored.base.encodings.filters[0]?.rule).toEqual({
            type: 'one of',
            value: ['B'],
            caseSensitive: false,
        });
        expect(stored.timeline).toEqual([
            [8, 0, { type: 'one of', value: ['OLD'] }],
            [8, 0, { type: 'one of', value: ['B'], caseSensitive: false }],
        ]);
        expect(filtersOf(patched.specsJson).find((filter) => filter.fid === 'region')?.rule?.value).toEqual(['B']);
    });

    test('leaves the saved spec untouched when the patch only toggles enabled', () => {
        const specsJson = JSON.stringify([sheet]);
        const patched = patchChartFilterSpecs(specsJson, 'vis1', [{ fid: 'region', enabled: false }]);
        expect(patched.specsJson).toBe(specsJson);
        expect(patched.fids).toEqual(['region', 'year']);
    });
});

describe('visualEncodings', () => {
    test('nulls a disabled rule only on the render copy', () => {
        const spec = parseWalkerCharts(JSON.stringify([sheet]))[0]?.spec ?? {};
        const saved = JSON.stringify(spec);
        const visual = visualEncodings(spec, new Set(['region']));
        const filters = visual.filters as Array<{ fid: string; rule: unknown }>;
        expect(JSON.stringify(spec)).toBe(saved);
        expect(filters.find((filter) => filter.fid === 'region')?.rule).toBeNull();
        expect(filters.filter((filter) => filter.rule).map((filter) => filter.fid)).toEqual(['year']);
        expect((spec.encodings as { filters: Array<{ fid: string; rule: { value: unknown } }> }).filters[0]?.rule.value).toEqual(['A']);
    });
});
