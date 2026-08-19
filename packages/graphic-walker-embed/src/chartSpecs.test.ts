import { createDatasetRegistry } from './datasetRegistry';
import { findChartSpec, listChartsFromRegistry, parseWalkerCharts } from './chartSpecs';

const specsJson = JSON.stringify([
    {
        visId: 'vis_sales',
        name: 'Sales',
        encodings: { columns: [], rows: [], color: [] },
        config: { geoms: ['bar'] },
    },
    { visId: 'broken' },
    {
        visId: 'vis_empty_name',
        encodings: {},
        config: {},
    },
]);

describe('parseWalkerCharts', () => {
    test('keeps only complete Graphic Walker sheets', () => {
        const charts = parseWalkerCharts(specsJson);
        expect(charts.map((chart) => chart.visId)).toEqual(['vis_sales', 'vis_empty_name']);
        expect(charts[0]?.name).toBe('Sales');
        expect(charts[1]?.name).toBe('Chart');
    });

    test('returns an empty list for invalid JSON', () => {
        expect(parseWalkerCharts('not-json')).toEqual([]);
        expect(parseWalkerCharts('{}')).toEqual([]);
    });

    test('reads Graphic Walker exportFullRaw history strings', () => {
        const history = JSON.stringify({
            base: {
                visId: 'vis_line',
                name: 'График 1',
                encodings: { columns: [{ fid: 'date' }], rows: [{ fid: 'cash' }] },
                config: { geoms: ['line'] },
            },
            timeline: [],
        });
        const charts = parseWalkerCharts(JSON.stringify([history]));
        expect(charts).toEqual([
            expect.objectContaining({
                visId: 'vis_line',
                name: 'График 1',
            }),
        ]);
        expect(charts[0]?.spec.config).toEqual({ geoms: ['line'] });
    });
});

describe('listChartsFromRegistry', () => {
    test('lists sheets with dataset id and provenance fingerprint', () => {
        const registry = createDatasetRegistry({ maxDatasets: 4 });
        registry.add(
            {
                name: 'Orders',
                fields: [],
                rows: [{ n: 1 }],
                specsJson,
                provenance: { queryFingerprint: 'fp-1' },
            },
            'ds1'
        );
        expect(listChartsFromRegistry(registry)).toEqual([
            {
                datasetId: 'ds1',
                datasetName: 'Orders',
                visId: 'vis_sales',
                name: 'Sales',
                queryFingerprint: 'fp-1',
            },
            {
                datasetId: 'ds1',
                datasetName: 'Orders',
                visId: 'vis_empty_name',
                name: 'Chart',
                queryFingerprint: 'fp-1',
            },
        ]);
        expect(findChartSpec(registry, 'ds1', 'vis_sales')?.name).toBe('Sales');
        expect(findChartSpec(registry, 'ds1', 'missing')).toBeNull();
        expect(findChartSpec(registry, 'missing', 'vis_sales')).toBeNull();
    });

    test('does not invent a fingerprint when provenance only has a Cube query', () => {
        const registry = createDatasetRegistry({ maxDatasets: 4 });
        registry.add(
            {
                name: 'Orders',
                fields: [],
                rows: [{ n: 1 }],
                specsJson,
                provenance: { query: { measures: ['Orders.count'] } },
            },
            'ds1'
        );
        expect(listChartsFromRegistry(registry)[0]?.queryFingerprint).toBeUndefined();
    });
});
