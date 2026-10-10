import type { IDataSourceProvider, IMutField, IRow } from '@kanaries/graphic-walker';
import type { WalkerCategoryOrder, WalkerCategoryOrderRequest } from './contract';
import { createGraphicWalkerHost } from './host';
import { parseWalkerCharts } from './chartSpecs';

const mockRoots: { el: object; unmounted: boolean }[] = [];
const mockFrames: Array<Record<string, unknown>> = [];
const tableDownloads: string[] = [];
const pivotGrid = {
    rows: [
        ['Region', 'sum(Paid)'],
        ['East', '1,234.5'],
    ],
    headerRows: 1,
    headerColumns: 1,
    merges: [{ s: { r: 1, c: 0 }, e: { r: 2, c: 0 } }],
};

interface TileRenderRecord {
    name: unknown;
    computation: unknown;
    visualState: unknown;
    appearance: unknown;
    locale: unknown;
}

const tileRenders: TileRenderRecord[] = [];

jest.mock('@kanaries/duckdb-computation', () => ({
    async getMemoryProvider() {
        throw new Error('provider must be injected');
    },
    async init() {},
}));

jest.mock('react-dom/client', () => ({
    createRoot(el: object) {
        const record = { el, unmounted: false };
        mockRoots.push(record);
        return {
            render(element: unknown) {
                walkElement(element);
            },
            unmount() {
                record.unmounted = true;
            },
        };
    },
}));

function walkElement(element: unknown): void {
    if (element == null || typeof element !== 'object') {
        return;
    }
    if (Array.isArray(element)) {
        element.forEach(walkElement);
        return;
    }
    const node = element as { type?: unknown; props?: Record<string, unknown> };
    const props = node.props ?? {};
    if (props.visualState && typeof props.computation === 'function') {
        tileRenders.push({
            name: props.name,
            computation: props.computation,
            visualState: props.visualState,
            appearance: props.appearance,
            locale: props.locale,
        });
    }
    const geoms = (props.visualConfig as { geoms?: unknown[] } | undefined)?.geoms;
    const isTable = Array.isArray(geoms) && geoms[0] === 'table';
    const ref = props.ref as { current: unknown } | undefined;
    if (ref && !isTable && props.visualState && typeof props.visualState === 'object') {
        ref.current = {
            getCanvasData: async () => ['data:image/png;base64,iVBORw0KGgo='],
            getSVGData: async () => ['<svg xmlns="http://www.w3.org/2000/svg"></svg>'],
        };
        mockFrames.push(props.visualState as Record<string, unknown>);
    }
    const tableRef = props.exportHandlerRef as { current: unknown } | undefined;
    if (tableRef && isTable) {
        tableRef.current = {
            download: () => tableDownloads.push('csv'),
            downloadXLSX: () => tableDownloads.push('xlsx'),
            downloadODS: () => tableDownloads.push('ods'),
            readGrid: () => pivotGrid,
        };
    }
    if (typeof node.type === 'function') {
        walkElement((node.type as (next: Record<string, unknown>) => unknown)(props));
        return;
    }
    if (props.children) {
        walkElement(props.children);
    }
}

async function createFakeProvider(): Promise<IDataSourceProvider> {
    const datasets: { id: string; name: string }[] = [];
    const meta = new Map<string, IMutField[]>();
    const specs = new Map<string, string>();
    let seq = 0;
    return {
        async getDataSourceList() {
            return [...datasets];
        },
        async addDataSource(_data: IRow[], fields: IMutField[], name: string) {
            const id = `p${++seq}`;
            datasets.push({ id, name });
            meta.set(id, fields);
            specs.set(id, '[]');
            return id;
        },
        async getMeta(id) {
            return meta.get(id) ?? [];
        },
        async setMeta(id, next) {
            meta.set(id, next);
        },
        async getSpecs(id) {
            const value = specs.get(id);
            if (value === undefined) {
                throw new Error('cannot find specs');
            }
            return value;
        },
        async saveSpecs(id, value) {
            specs.set(id, value);
        },
        async removeDataSource(id) {
            const index = datasets.findIndex((dataset) => dataset.id === id);
            if (index >= 0) {
                datasets.splice(index, 1);
            }
            meta.delete(id);
            specs.delete(id);
        },
        async queryData() {
            return [];
        },
        registerCallback() {
            return () => undefined;
        },
    };
}

async function createCountingProvider(counter: { n: number }): Promise<IDataSourceProvider> {
    const provider = await createFakeProvider();
    const queryData = provider.queryData.bind(provider);
    provider.queryData = async (payload, datasetIds) => {
        counter.n += 1;
        return queryData(payload, datasetIds);
    };
    return provider;
}

const chartFields = [
    { fid: 'region', name: 'Region', semanticType: 'nominal' as const, analyticType: 'dimension' as const },
    { fid: 'year', name: 'Year', semanticType: 'ordinal' as const, analyticType: 'dimension' as const },
];

function renderNamed(name: string): TileRenderRecord {
    for (let index = tileRenders.length - 1; index >= 0; index -= 1) {
        const record = tileRenders[index];
        if (record?.name === name) {
            return record;
        }
    }
    throw new Error(`tile render not found: ${name}`);
}

function asComputation(value: unknown): (payload: { workflow: unknown[] }) => Promise<unknown> {
    if (typeof value !== 'function') {
        throw new Error('tile computation missing');
    }
    return value as (payload: { workflow: unknown[] }) => Promise<unknown>;
}

const sheet = {
    visId: 'vis1',
    name: 'Sales',
    encodings: {
        dimensions: [],
        measures: [],
        columns: [],
        rows: [],
        filters: [
            { fid: 'region', rule: { type: 'one of', value: ['A'] } },
            { fid: 'year', rule: { type: 'range', value: [2020, 2024] } },
        ],
    },
    config: { geoms: ['bar'] },
};

describe('createGraphicWalkerHost dashboard api', () => {
    beforeEach(() => {
        mockRoots.length = 0;
        mockFrames.length = 0;
        tableDownloads.length = 0;
        tileRenders.length = 0;
        const gw = require('@kanaries/graphic-walker') as { graphicWalkerMounts: unknown[] };
        gw.graphicWalkerMounts.length = 0;
    });

    test('patches filters, exports png and svg, and unmounts only the editor', async () => {
        const editorEl = { id: 'editor' };
        const tileEl = { id: 'tile' };
        const host = await createGraphicWalkerHost(editorEl as unknown as HTMLElement, { maxDatasets: 2 }, {
            createProvider: createFakeProvider,
        });
        const { id } = await host.addDataset({
            id: 'ds1',
            name: 'Orders',
            fields: [],
            rows: [{ region: 'A' }],
            specsJson: JSON.stringify([sheet]),
        });
        const release = host.createChartView(tileEl as unknown as HTMLElement, { datasetId: id, visId: 'vis1' });

        await host.patchChartFilters({ datasetId: id, visId: 'vis1' }, [
            { fid: 'region', value: ['B'], enabled: false },
            { fid: 'missing', type: 'one of', value: ['Z'] },
        ]);

        const config = await host.exportConfig();
        const filters = (
            parseWalkerCharts(config.datasets[0]?.specsJson ?? '[]')[0]?.spec.encodings as {
                filters: Array<{ fid: string; rule: { type: string; value: unknown } | null }>;
            }
        ).filters;
        expect(filters.map((filter) => filter.fid)).toEqual(['region', 'year']);
        expect(filters[0]?.rule).toEqual({ type: 'one of', value: ['B'] });

        const frame = mockFrames[mockFrames.length - 1];
        const visualFilters = frame?.filters as Array<{ fid: string; rule: unknown }>;
        expect(visualFilters.find((filter) => filter.fid === 'region')?.rule).toBeNull();
        expect(visualFilters.filter((filter) => filter.rule).map((filter) => filter.fid)).toEqual(['year']);

        await expect(host.exportChart({ datasetId: id, visId: 'vis1' }, 'png')).resolves.toEqual({
            format: 'png',
            data: 'data:image/png;base64,iVBORw0KGgo=',
        });
        await expect(host.exportChart({ datasetId: id, visId: 'vis1' }, 'svg')).resolves.toEqual({
            format: 'svg',
            data: '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
        });

        await host.setEditorMounted(false);
        expect(mockRoots.filter((root) => root.el === editorEl).every((root) => root.unmounted)).toBe(true);
        expect(mockRoots.filter((root) => root.el === tileEl).map((root) => root.unmounted)).toEqual([false]);
        await expect(host.listDatasets()).resolves.toEqual([{ id: 'ds1', name: 'Orders' }]);
        await expect(host.listCharts()).resolves.toEqual([
            expect.objectContaining({ datasetId: 'ds1', visId: 'vis1', name: 'Sales' }),
        ]);
        await expect(host.exportChart({ datasetId: id, visId: 'vis1' }, 'svg')).resolves.toEqual({
            format: 'svg',
            data: '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
        });

        await host.setEditorMounted(true);
        expect(mockRoots.filter((root) => root.el === editorEl && !root.unmounted)).toHaveLength(1);
        await expect(host.listDatasets()).resolves.toEqual([{ id: 'ds1', name: 'Orders' }]);
        expect(mockRoots.filter((root) => root.el === tileEl && !root.unmounted)).toHaveLength(1);

        release();
        host.destroy();
    });

    test('mounts the sheet filter editor with fields already on the sheet', async () => {
        const editorEl = { id: 'editor' };
        const panelEl = { id: 'filters' };
        const host = await createGraphicWalkerHost(editorEl as unknown as HTMLElement, { maxDatasets: 2 }, {
            createProvider: createFakeProvider,
        });
        const { id } = await host.addDataset({
            id: 'ds1',
            name: 'Orders',
            fields: [],
            rows: [{ region: 'A' }],
            specsJson: JSON.stringify([sheet]),
        });
        const gw = require('@kanaries/graphic-walker') as {
            sheetFilterMounts: Array<{ fieldAllowlist: string[]; specRaw: string; onClose?: () => void }>;
        };
        gw.sheetFilterMounts.length = 0;
        const onClose = jest.fn();
        const release = host.mountSheetFilterPanel(
            panelEl as unknown as HTMLElement,
            { datasetId: id, visId: 'vis1' },
            { onClose }
        );
        expect(gw.sheetFilterMounts.at(-1)?.fieldAllowlist).toEqual(['region', 'year']);
        expect(gw.sheetFilterMounts.at(-1)?.specRaw).toContain('region');
        gw.sheetFilterMounts.at(-1)?.onClose?.();
        expect(onClose).toHaveBeenCalledTimes(1);
        release();
        expect(mockRoots.filter((root) => root.el === panelEl).every((root) => root.unmounted)).toBe(true);
        host.destroy();
    });

    test('downloads a pivot table instead of a chart image', async () => {
        const editorEl = { id: 'editor' };
        const tileEl = { id: 'pivot' };
        const host = await createGraphicWalkerHost(editorEl as unknown as HTMLElement, { maxDatasets: 2 }, {
            createProvider: createFakeProvider,
        });
        const pivot = {
            ...sheet,
            visId: 'pivot1',
            config: { geoms: ['table'] },
        };
        const { id } = await host.addDataset({
            id: 'ds1',
            name: 'Orders',
            fields: [],
            rows: [{ region: 'A' }],
            specsJson: JSON.stringify([pivot]),
        });
        host.createChartView(tileEl as unknown as HTMLElement, { datasetId: id, visId: 'pivot1' });
        await expect(host.listCharts()).resolves.toEqual([
            expect.objectContaining({ visId: 'pivot1', kind: 'table' }),
        ]);
        await expect(host.exportChart({ datasetId: id, visId: 'pivot1' }, 'csv')).resolves.toEqual({
            format: 'csv',
            data: '',
        });
        await expect(host.exportChart({ datasetId: id, visId: 'pivot1' }, 'xlsx')).resolves.toEqual({
            format: 'xlsx',
            data: '',
        });
        expect(tableDownloads).toEqual(['csv', 'xlsx']);
        await expect(host.exportChart({ datasetId: id, visId: 'pivot1' }, 'png')).rejects.toThrow(/no image export/);
        await expect(host.exportChart({ datasetId: id, visId: 'pivot1' }, 'svg')).rejects.toThrow(/no image export/);
        await expect(host.exportChart({ datasetId: id, visId: 'pivot1' }, 'grid')).resolves.toEqual({
            format: 'grid',
            data: '',
            grid: pivotGrid,
        });
        host.destroy();
    });

    test('rerenders only the tiles in scope and keeps computation stable', async () => {
        const editorEl = { id: 'editor' };
        const salesEl = { id: 'sales' };
        const costsEl = { id: 'costs' };
        const otherEl = { id: 'other' };
        const host = await createGraphicWalkerHost(editorEl as unknown as HTMLElement, { maxDatasets: 4 }, {
            createProvider: createFakeProvider,
        });
        const costs = { ...sheet, visId: 'vis2', name: 'Costs' };
        const other = { ...sheet, visId: 'vis1', name: 'Other' };
        const { id } = await host.addDataset({
            id: 'ds1',
            name: 'Orders',
            fields: chartFields,
            rows: [{ region: 'A', year: 2024 }],
            specsJson: JSON.stringify([sheet, costs]),
        });
        host.createChartView(salesEl as unknown as HTMLElement, { datasetId: id, visId: 'vis1' });
        host.createChartView(costsEl as unknown as HTMLElement, { datasetId: id, visId: 'vis2' });
        const mounted = tileRenders.length;

        const { id: otherId } = await host.addDataset({
            id: 'ds2',
            name: 'Returns',
            fields: chartFields,
            rows: [{ region: 'B', year: 2024 }],
            specsJson: JSON.stringify([other]),
        });
        expect(tileRenders).toHaveLength(mounted);

        host.createChartView(otherEl as unknown as HTMLElement, { datasetId: otherId, visId: 'vis1' });
        const salesBefore = renderNamed('Sales');
        const costsBefore = renderNamed('Costs');
        const otherBefore = renderNamed('Other');
        expect(salesBefore.computation).toBe(costsBefore.computation);
        expect(salesBefore.computation).not.toBe(otherBefore.computation);

        const beforePatch = tileRenders.length;
        await host.patchChartFilters({ datasetId: id, visId: 'vis1' }, [{ fid: 'region', value: ['B'] }]);
        expect(tileRenders.slice(beforePatch).map((record) => record.name)).toEqual(['Sales']);
        const salesPatched = renderNamed('Sales');
        expect(salesPatched.computation).toBe(salesBefore.computation);
        expect(salesPatched.visualState).not.toBe(salesBefore.visualState);

        host.setAppearance('dark');
        const salesAfter = renderNamed('Sales');
        const costsAfter = renderNamed('Costs');
        const otherAfter = renderNamed('Other');
        expect(tileRenders.slice(-3).map((record) => record.name)).toEqual(['Sales', 'Costs', 'Other']);
        expect(salesAfter.computation).toBe(salesPatched.computation);
        expect(salesAfter.visualState).toBe(salesPatched.visualState);
        expect(costsAfter.computation).toBe(costsBefore.computation);
        expect(costsAfter.visualState).toBe(costsBefore.visualState);
        expect(otherAfter.computation).toBe(otherBefore.computation);
        expect(otherAfter.visualState).toBe(otherBefore.visualState);
        expect(salesAfter.appearance).toBe('dark');

        const beforeReplace = tileRenders.length;
        await host.replaceDataset(otherId, {
            name: 'Returns',
            fields: chartFields,
            rows: [{ region: 'C', year: 2023 }],
            specsJson: JSON.stringify([other]),
        });
        expect(tileRenders.slice(beforeReplace).map((record) => record.name)).toEqual(['Other']);
        expect(renderNamed('Other').computation).not.toBe(otherBefore.computation);
        host.destroy();
    });

    test('caches identical tile queries until the dataset rows change', async () => {
        const editorEl = { id: 'editor' };
        const tileEl = { id: 'tile' };
        const counter = { n: 0 };
        const host = await createGraphicWalkerHost(editorEl as unknown as HTMLElement, { maxDatasets: 2 }, {
            createProvider: () => createCountingProvider(counter),
        });
        const { id } = await host.addDataset({
            id: 'ds1',
            name: 'Orders',
            fields: chartFields,
            rows: [{ region: 'A', year: 2024 }],
            specsJson: JSON.stringify([sheet]),
        });
        host.createChartView(tileEl as unknown as HTMLElement, { datasetId: id, visId: 'vis1' });
        const computation = asComputation(renderNamed('Sales').computation);
        const mountedState = renderNamed('Sales').visualState;
        const payload = { workflow: [{ type: 'view', query: [] }] };
        await computation(payload);
        await computation(payload);
        expect(counter.n).toBe(1);
        await computation({ workflow: [{ type: 'view', query: [{ op: 'raw', fields: ['region'] }] }] });
        expect(counter.n).toBe(2);

        host.setLocale('en-US');
        const rerender = renderNamed('Sales');
        expect(rerender.computation).toBe(computation);
        expect(rerender.visualState).toBe(mountedState);
        expect(rerender.locale).toBe('en-US');

        await host.replaceDataset(id, {
            name: 'Orders',
            fields: chartFields,
            rows: [{ region: 'B', year: 2020 }],
            specsJson: JSON.stringify([sheet]),
        });
        const replaced = asComputation(renderNamed('Sales').computation);
        expect(replaced).not.toBe(computation);
        await replaced(payload);
        expect(counter.n).toBe(3);
        host.destroy();
    });

    test('passes categoryOrderProvider to the editor with the selected dataset id', async () => {
        const editorEl = { id: 'editor-order' };
        const categoryOrderProvider = jest.fn(
            async (_request: WalkerCategoryOrderRequest): Promise<WalkerCategoryOrder | null> => ({ order: ['пн', 'вт'] })
        );
        const host = await createGraphicWalkerHost(
            editorEl as unknown as HTMLElement,
            { maxDatasets: 2, categoryOrderProvider },
            { createProvider: createFakeProvider }
        );
        await host.addDataset({
            id: 'ds1',
            name: 'Orders',
            fields: chartFields,
            rows: [{ region: 'A', year: 2024 }],
        });
        const gw = require('@kanaries/graphic-walker') as {
            graphicWalkerMounts: Array<{
                categoryOrderProvider?: (request: {
                    field: { fid: string; name: string; semanticType: string };
                }) => Promise<WalkerCategoryOrder | null>;
            }>;
        };
        const provider = gw.graphicWalkerMounts.at(-1)?.categoryOrderProvider;
        expect(typeof provider).toBe('function');
        if (!provider) {
            throw new Error('categoryOrderProvider was not passed to GraphicWalker');
        }
        await expect(provider({ field: { fid: 'region', name: 'Region', semanticType: 'nominal' } })).resolves.toEqual({
            order: ['пн', 'вт'],
        });
        expect(categoryOrderProvider).toHaveBeenCalledWith({
            datasetId: 'ds1',
            fid: 'region',
            name: 'Region',
            semanticType: 'nominal',
        });
        host.destroy();

        gw.graphicWalkerMounts.length = 0;
        const plain = await createGraphicWalkerHost(editorEl as unknown as HTMLElement, { maxDatasets: 2 }, {
            createProvider: createFakeProvider,
        });
        expect(gw.graphicWalkerMounts.at(-1)?.categoryOrderProvider).toBeUndefined();
        plain.destroy();
    });
});
