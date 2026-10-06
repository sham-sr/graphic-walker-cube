import type { IDataSourceProvider, IMutField, IRow } from '@kanaries/graphic-walker';
import { DatasetLimitError, GW_CONFIG_KIND, GW_REPORT_KIND } from './contract';
import { createDatasetRegistry } from './datasetRegistry';
import { createHostController } from './hostController';
import type { WalkerDatasetInput, WalkerField } from './contract';

const fields: WalkerField[] = [
    { fid: 'Orders.status', name: 'Status', analyticType: 'dimension', semanticType: 'nominal' },
];

function input(name: string, extra?: Partial<WalkerDatasetInput>): WalkerDatasetInput {
    return {
        name,
        fields,
        rows: [{ 'Orders.status': name }],
        provenance: { cubeName: 'Orders', query: { measures: ['Orders.count'] } },
        ...extra,
    };
}

function createFakeProvider(): IDataSourceProvider {
    const datasets: { id: string; name: string }[] = [];
    const meta = new Map<string, IMutField[]>();
    const specs = new Map<string, string>();
    const rows = new Map<string, IRow[]>();
    let seq = 0;
    const listeners = new Set<(event: number, datasetId: string) => void>();

    return {
        async getDataSourceList() {
            return [...datasets];
        },
        async addDataSource(data, fieldsMeta, name) {
            const id = `p${++seq}`;
            datasets.push({ id, name });
            meta.set(id, fieldsMeta);
            specs.set(id, '[]');
            rows.set(id, data);
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
            if (value === undefined) throw new Error('cannot find specs');
            return value;
        },
        async saveSpecs(id, value) {
            specs.set(id, value);
        },
        async removeDataSource(id) {
            const index = datasets.findIndex((dataset) => dataset.id === id);
            if (index < 0) throw new Error('cannot find dataset');
            datasets.splice(index, 1);
            meta.delete(id);
            specs.delete(id);
            rows.delete(id);
        },
        async queryData() {
            return [];
        },
        registerCallback(callback) {
            listeners.add(callback);
            return () => listeners.delete(callback);
        },
    };
}

describe('createHostController', () => {
    test('adds dataset, exports config without rows, report with rows', async () => {
        const provider = createFakeProvider();
        const registry = createDatasetRegistry({ maxDatasets: 3 });
        const host = createHostController(provider, registry, {});

        const { id } = await host.addDataset(input('A', { specsJson: '["chart"]' }));
        const config = await host.exportConfig();
        const report = await host.exportReport();

        expect(config.kind).toBe(GW_CONFIG_KIND);
        expect(config.datasets[0]?.id).toBe(id);
        expect(config.datasets[0]).not.toHaveProperty('rows');
        expect(config.datasets[0]?.provenance).toEqual({ cubeName: 'Orders', query: { measures: ['Orders.count'] } });
        expect(report.kind).toBe(GW_REPORT_KIND);
        expect(report.datasets[0]?.rows).toEqual([{ 'Orders.status': 'A' }]);
        expect(report.datasets[0]?.specsJson).toBe('["chart"]');
        const providerId = registry.get(id).providerId;
        expect(await provider.getDataSourceList()).toEqual([{ id: providerId, name: 'A' }]);
    });

    test('add with stable id returns the same external id', async () => {
        const provider = createFakeProvider();
        const registry = createDatasetRegistry({ maxDatasets: 3 });
        const host = createHostController(provider, registry, {});

        const { id } = await host.addDataset(input('A', { id: 'slotA' }));
        expect(id).toBe('slotA');
        expect(registry.get('slotA').providerId).not.toBe('slotA');
        expect(await host.listDatasets()).toEqual([{ id: 'slotA', name: 'A' }]);
    });

    test('throws on maxDatasets and replace keeps the external id', async () => {
        const provider = createFakeProvider();
        const registry = createDatasetRegistry({ maxDatasets: 1 });
        const host = createHostController(provider, registry, {});
        const first = await host.addDataset(input('A'));

        await expect(host.addDataset(input('B'))).rejects.toBeInstanceOf(DatasetLimitError);

        const replaced = await host.replaceDataset(first.id, input('B', { specsJson: '["kept"]' }));
        expect(replaced.id).toBe(first.id);
        expect(await host.listDatasets()).toEqual([{ id: first.id, name: 'B' }]);
        expect(registry.get(first.id).providerId).not.toBe(first.id);
        expect((await host.exportConfig()).datasets[0]?.id).toBe(first.id);
        expect((await host.exportConfig()).datasets[0]?.specsJson).toBe('["kept"]');
    });

    test('replaceDataset with slot id returns slot id and preserves specs when fields match', async () => {
        const provider = createFakeProvider();
        const registry = createDatasetRegistry({ maxDatasets: 2 });
        const host = createHostController(provider, registry, {});
        const specsJson = JSON.stringify([
            { visId: 'c1', encodings: { dimensions: [{ fid: 'Orders.status' }] } },
        ]);
        await host.addDataset(input('A', { id: 'slotA', specsJson }));
        await provider.saveSpecs(registry.get('slotA').providerId, specsJson);

        const replaced = await host.replaceDataset('slotA', input('B'));
        expect(replaced.id).toBe('slotA');
        expect(replaced.chartsCleared).toBe(false);
        expect((await host.exportConfig()).datasets[0]?.specsJson).toBe(specsJson);
    });

    test('replaceDataset clears charts on slot id when fields incompatible', async () => {
        const provider = createFakeProvider();
        const registry = createDatasetRegistry({ maxDatasets: 2 });
        const host = createHostController(provider, registry, {});
        const specsJson = JSON.stringify([
            { visId: 'c1', encodings: { measures: [{ fid: 'Orders.count' }] } },
        ]);
        await host.addDataset(input('A', { id: 'slotA', specsJson }));
        await provider.saveSpecs(registry.get('slotA').providerId, specsJson);

        const replaced = await host.replaceDataset('slotA', input('B'));
        expect(replaced.id).toBe('slotA');
        expect(replaced.chartsCleared).toBe(true);
        expect((await host.exportConfig()).datasets[0]?.specsJson).toBe('[]');
    });

    test('replacing a non-selected dataset preserves its specs', async () => {
        const provider = createFakeProvider();
        const registry = createDatasetRegistry({ maxDatasets: 3 });
        const host = createHostController(provider, registry, {});
        const specsA = JSON.stringify([
            { visId: 'a1', encodings: { dimensions: [{ fid: 'Orders.status' }] } },
        ]);
        await host.addDataset(input('A', { id: 'slotA', specsJson: specsA }));
        await provider.saveSpecs(registry.get('slotA').providerId, specsA);
        await host.addDataset(input('B', { id: 'slotB' }));
        expect(registry.selectedDatasetId).toBe('slotB');

        await host.replaceDataset('slotA', input('A2'));
        expect((await host.exportConfig()).datasets.find((d) => d.id === 'slotA')?.specsJson).toBe(specsA);
        expect(registry.selectedDatasetId).toBe('slotB');
    });

    test('exportConfig and applyConfig round-trip external ids and specs', async () => {
        const provider = createFakeProvider();
        const registry = createDatasetRegistry({ maxDatasets: 3 });
        const host = createHostController(provider, registry, {});
        const specsJson = '["chart-slot"]';
        await host.addDataset(input('A', { id: 'slotA', specsJson }));

        const config = await host.exportConfig();
        expect(config.datasets[0]?.id).toBe('slotA');
        expect(config.datasets[0]?.specsJson).toBe(specsJson);

        const target = createHostController(createFakeProvider(), createDatasetRegistry({ maxDatasets: 3 }), {});
        await target.applyConfig(config, { slotA: [{ 'Orders.status': 'round-trip' }] });
        const roundTrip = await target.exportConfig();
        expect(roundTrip.datasets[0]?.id).toBe('slotA');
        expect(roundTrip.datasets[0]?.specsJson).toBe(specsJson);
    });

    test('replace keeps previous charts when fields still match', async () => {
        const provider = createFakeProvider();
        const registry = createDatasetRegistry({ maxDatasets: 2 });
        const host = createHostController(provider, registry, {});
        const specsJson = JSON.stringify([
            { visId: 'c1', encodings: { dimensions: [{ fid: 'Orders.status' }] } },
        ]);
        const first = await host.addDataset(input('A', { specsJson }));
        await provider.saveSpecs(registry.get(first.id).providerId, specsJson);

        const replaced = await host.replaceDataset(first.id, input('B'));
        expect(replaced.chartsCleared).toBe(false);
        expect((await host.exportConfig()).datasets[0]?.specsJson).toBe(specsJson);
    });

    test('replace clears charts when encoding fields disappeared', async () => {
        const provider = createFakeProvider();
        const registry = createDatasetRegistry({ maxDatasets: 2 });
        const host = createHostController(provider, registry, {});
        const specsJson = JSON.stringify([
            { visId: 'c1', encodings: { measures: [{ fid: 'Orders.count' }] } },
        ]);
        const first = await host.addDataset(input('A', { specsJson }));
        await provider.saveSpecs(registry.get(first.id).providerId, specsJson);

        const replaced = await host.replaceDataset(first.id, input('B'));
        expect(replaced.chartsCleared).toBe(true);
        expect((await host.exportConfig()).datasets[0]?.specsJson).toBe('[]');
    });

    test('applyConfig reloads rows by dataset id and keeps provenance', async () => {
        const provider = createFakeProvider();
        const registry = createDatasetRegistry({ maxDatasets: 3 });
        const host = createHostController(provider, registry, {});
        const { id } = await host.addDataset(input('A'));
        const config = await host.exportConfig();

        await host.applyConfig(config, { [id]: [{ 'Orders.status': 'refreshed' }] });
        const report = await host.exportReport();
        expect(report.datasets[0]?.rows).toEqual([{ 'Orders.status': 'refreshed' }]);
        expect(report.datasets[0]?.provenance).toEqual(config.datasets[0]?.provenance);
        expect(await provider.getDataSourceList()).toHaveLength(1);
    });

    test('importReport keeps external ids and selects the saved dataset after provider ids change', async () => {
        const source = createHostController(createFakeProvider(), createDatasetRegistry({ maxDatasets: 5 }), {});
        await source.addDataset(input('Tickets A', { id: 'tickets-a' }));
        await source.addDataset(input('Tickets B', { id: 'tickets-b' }));
        const goods = await source.addDataset(input('Товары', { id: 'goods' }));
        const snapshot = await source.exportReport();
        snapshot.selectedDatasetId = goods.id;

        const target = createHostController(createFakeProvider(), createDatasetRegistry({ maxDatasets: 5 }), {});
        await target.importReport(snapshot);
        const restored = await target.exportReport();
        expect(restored.datasets.map((dataset) => dataset.id)).toEqual(['tickets-a', 'tickets-b', 'goods']);
        expect(restored.datasets).toHaveLength(3);
        expect(restored.selectedDatasetId).toBe('goods');
        const selected = restored.datasets.find((dataset) => dataset.id === restored.selectedDatasetId);
        expect(selected?.name).toBe('Товары');
        expect(await target.listDatasets()).toHaveLength(3);
    });
});
