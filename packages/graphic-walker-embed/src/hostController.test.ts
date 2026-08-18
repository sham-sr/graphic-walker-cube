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
        expect(await provider.getDataSourceList()).toEqual([{ id, name: 'A' }]);
    });

    test('throws on maxDatasets and replace swaps the dataset', async () => {
        const provider = createFakeProvider();
        const registry = createDatasetRegistry({ maxDatasets: 1 });
        const host = createHostController(provider, registry, {});
        const first = await host.addDataset(input('A'));

        await expect(host.addDataset(input('B'))).rejects.toBeInstanceOf(DatasetLimitError);

        const replaced = await host.replaceDataset(first.id, input('B', { specsJson: '["kept"]' }));
        expect(replaced.id).not.toBe(first.id);
        expect(await host.listDatasets()).toEqual([{ id: replaced.id, name: 'B' }]);
        expect(await provider.getDataSourceList()).toEqual([{ id: replaced.id, name: 'B' }]);
        expect((await host.exportConfig()).datasets[0]?.specsJson).toBe('["kept"]');
    });

    test('replace keeps previous charts when fields still match', async () => {
        const provider = createFakeProvider();
        const registry = createDatasetRegistry({ maxDatasets: 2 });
        const host = createHostController(provider, registry, {});
        const specsJson = JSON.stringify([
            { visId: 'c1', encodings: { dimensions: [{ fid: 'Orders.status' }] } },
        ]);
        const first = await host.addDataset(input('A', { specsJson }));
        await provider.saveSpecs(first.id, specsJson);

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
        await provider.saveSpecs(first.id, specsJson);

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

    test('importReport keeps all datasets and selects the saved dataset after provider ids change', async () => {
        const source = createHostController(createFakeProvider(), createDatasetRegistry({ maxDatasets: 5 }), {});
        await source.addDataset(input('Tickets A'));
        await source.addDataset(input('Tickets B'));
        const goods = await source.addDataset(input('Товары'));
        const snapshot = await source.exportReport();
        snapshot.selectedDatasetId = goods.id;

        const target = createHostController(createFakeProvider(), createDatasetRegistry({ maxDatasets: 5 }), {});
        await target.importReport(snapshot);
        const restored = await target.exportReport();
        expect(restored.datasets.map(dataset => dataset.name)).toEqual(['Tickets A', 'Tickets B', 'Товары']);
        expect(restored.datasets).toHaveLength(3);
        const selected = restored.datasets.find(dataset => dataset.id === restored.selectedDatasetId);
        expect(selected?.name).toBe('Товары');
        expect(await target.listDatasets()).toHaveLength(3);
    });
});
