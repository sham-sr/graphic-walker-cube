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

        const replaced = await host.replaceDataset(first.id, input('B'));
        expect(replaced.id).not.toBe(first.id);
        expect(await host.listDatasets()).toEqual([{ id: replaced.id, name: 'B' }]);
        expect(await provider.getDataSourceList()).toEqual([{ id: replaced.id, name: 'B' }]);
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

    test('importReport restores snapshot rows', async () => {
        const source = createHostController(createFakeProvider(), createDatasetRegistry({ maxDatasets: 3 }), {});
        await source.addDataset(input('Snap'));
        const snapshot = await source.exportReport();

        const target = createHostController(createFakeProvider(), createDatasetRegistry({ maxDatasets: 3 }), {});
        await target.importReport(snapshot);
        expect((await target.exportReport()).datasets[0]?.rows).toEqual([{ 'Orders.status': 'Snap' }]);
    });
});
