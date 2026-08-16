import {
    DatasetLimitError,
    DatasetRowsLimitError,
    GW_CONFIG_KIND,
    GW_REPORT_KIND,
    isGraphicWalkerConfig,
    isGraphicWalkerReport,
} from './contract';
import { createDatasetRegistry } from './datasetRegistry';
import type { WalkerDatasetInput, WalkerField, WalkerRow } from './contract';

const fields: WalkerField[] = [
    { fid: 'Orders.status', name: 'Status', analyticType: 'dimension', semanticType: 'nominal' },
    { fid: 'Orders.count', name: 'Count', analyticType: 'measure', semanticType: 'quantitative' },
];

const rows: WalkerRow[] = [{ 'Orders.status': 'shipped', 'Orders.count': 3 }];

function input(name: string, extra?: Partial<WalkerDatasetInput>): WalkerDatasetInput {
    return {
        name,
        fields,
        rows,
        provenance: { cubeName: 'Orders', query: { measures: ['Orders.count'] } },
        ...extra,
    };
}

describe('createDatasetRegistry', () => {
    test('adds datasets and exports config without rows', () => {
        const registry = createDatasetRegistry({ maxDatasets: 3 });
        const id = registry.add(input('A'));
        const config = registry.exportConfig();

        expect(config.kind).toBe(GW_CONFIG_KIND);
        expect(config.datasets).toHaveLength(1);
        expect(config.datasets[0]?.id).toBe(id);
        expect(config.datasets[0]?.provenance).toEqual({ cubeName: 'Orders', query: { measures: ['Orders.count'] } });
        expect(config.datasets[0]).not.toHaveProperty('rows');
        expect(isGraphicWalkerConfig(config)).toBe(true);
    });

    test('exports report with rows and round-trips import', () => {
        const registry = createDatasetRegistry({ maxDatasets: 3 });
        registry.add(input('A', { specsJson: '["chart-a"]' }));
        const report = registry.exportReport();

        expect(report.kind).toBe(GW_REPORT_KIND);
        expect(report.datasets[0]?.rows).toEqual(rows);
        expect(isGraphicWalkerReport(report)).toBe(true);

        const restored = createDatasetRegistry({ maxDatasets: 3 });
        restored.importReport(report);
        expect(restored.size).toBe(1);
        expect(restored.exportReport().datasets[0]?.specsJson).toBe('["chart-a"]');
    });

    test('throws DatasetLimitError and allows replace', () => {
        const registry = createDatasetRegistry({ maxDatasets: 1 });
        const firstId = registry.add(input('A'));

        expect(() => registry.add(input('B'))).toThrow(DatasetLimitError);
        try {
            registry.add(input('B'));
        } catch (error) {
            expect(error).toBeInstanceOf(DatasetLimitError);
            const limitError = error as DatasetLimitError;
            expect(limitError.datasets).toEqual([{ id: firstId, name: 'A' }]);
            expect(limitError.maxDatasets).toBe(1);
        }

        const nextId = registry.replace(firstId, input('B'));
        expect(nextId).not.toBe(firstId);
        expect(registry.list()).toEqual([{ id: nextId, name: 'B' }]);
    });

    test('throws when row count exceeds maxRows', () => {
        const registry = createDatasetRegistry({ maxDatasets: 3, maxRows: 1 });
        expect(() => registry.add(input('A', { rows: [rows[0]!, rows[0]!] }))).toThrow(DatasetRowsLimitError);
    });

    test('importConfig requires refreshed rows keyed by dataset id', () => {
        const registry = createDatasetRegistry({ maxDatasets: 3 });
        const id = registry.add(input('A'));
        const config = registry.exportConfig();

        const restored = createDatasetRegistry({ maxDatasets: 3 });
        expect(() => restored.importConfig(config, {})).toThrow(/Missing refreshed rows/);

        const nextRows = [{ 'Orders.status': 'pending', 'Orders.count': 9 }];
        restored.importConfig(config, { [id]: nextRows });
        expect(restored.exportReport().datasets[0]?.rows).toEqual(nextRows);
        expect(restored.exportReport().datasets[0]?.provenance).toEqual(config.datasets[0]?.provenance);
    });

    test('remove drops a dataset and reassigns selection', () => {
        const registry = createDatasetRegistry({ maxDatasets: 3 });
        const a = registry.add(input('A'));
        const b = registry.add(input('B'));
        expect(registry.selectedDatasetId).toBe(b);
        registry.remove(b);
        expect(registry.selectedDatasetId).toBe(a);
        expect(registry.size).toBe(1);
    });
});
