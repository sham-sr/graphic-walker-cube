import type { IDataSourceProvider, IMutField, IRow } from '@kanaries/graphic-walker';
import {
    DatasetLimitError,
    DatasetRowsLimitError,
    type GraphicWalkerConfig,
    type GraphicWalkerReport,
    type WalkerDatasetInput,
    type WalkerField,
    type WalkerRow,
} from './contract';
import type { DatasetRegistry } from './datasetRegistry';

function toMutFields(fields: WalkerField[]): IMutField[] {
    return fields.map((field) => ({
        fid: field.fid,
        name: field.name,
        basename: field.basename,
        semanticType: field.semanticType,
        analyticType: field.analyticType,
        offset: field.offset,
    }));
}

function toRows(rows: WalkerRow[]): IRow[] {
    return rows as IRow[];
}

export async function clearProvider(provider: IDataSourceProvider): Promise<void> {
    if (!provider.removeDataSource) {
        return;
    }
    const existing = await provider.getDataSourceList();
    for (const dataset of existing) {
        await provider.removeDataSource(dataset.id);
    }
}

export async function syncSpecsFromProvider(provider: IDataSourceProvider, registry: DatasetRegistry): Promise<void> {
    for (const dataset of registry.list()) {
        try {
            const specsJson = await provider.getSpecs(dataset.id);
            registry.updateSpecs(dataset.id, specsJson);
        } catch {
            // Dataset may not exist in the provider yet.
        }
    }
}

export async function pushRegistryToProvider(provider: IDataSourceProvider, registry: DatasetRegistry): Promise<void> {
    const snapshot = registry.list().map((info) => registry.get(info.id));
    await clearProvider(provider);
    registry.clear();
    for (const record of snapshot) {
        const id = await provider.addDataSource(toRows(record.rows), toMutFields(record.fields), record.name);
        if (record.specsJson && record.specsJson !== '[]') {
            await provider.saveSpecs(id, record.specsJson);
        }
        registry.add(
            {
                name: record.name,
                fields: record.fields,
                rows: record.rows,
                provenance: record.provenance,
                specsJson: record.specsJson,
            },
            id
        );
    }
}

export interface HostController {
    addDataset(input: WalkerDatasetInput): Promise<{ id: string }>;
    replaceDataset(id: string, input: WalkerDatasetInput): Promise<{ id: string }>;
    removeDataset(id: string): Promise<void>;
    listDatasets(): Promise<{ id: string; name: string }[]>;
    exportConfig(): Promise<GraphicWalkerConfig>;
    exportReport(): Promise<GraphicWalkerReport>;
    applyConfig(config: GraphicWalkerConfig, rowsById: Record<string, WalkerRow[]>): Promise<void>;
    importReport(report: GraphicWalkerReport): Promise<void>;
}

export function createHostController(
    provider: IDataSourceProvider,
    registry: DatasetRegistry,
    options: { maxRows?: number }
): HostController {
    const addToProvider = async (input: WalkerDatasetInput): Promise<string> => {
        if (registry.size >= registry.maxDatasets) {
            throw new DatasetLimitError(registry.maxDatasets, registry.list());
        }
        if (options.maxRows !== undefined && options.maxRows > 0 && input.rows.length > options.maxRows) {
            throw new DatasetRowsLimitError(options.maxRows, input.rows.length);
        }
        const id = await provider.addDataSource(toRows(input.rows), toMutFields(input.fields), input.name);
        if (input.specsJson && input.specsJson !== '[]') {
            await provider.saveSpecs(id, input.specsJson);
        }
        registry.add(input, id);
        return id;
    };

    return {
        async addDataset(input) {
            const id = await addToProvider(input);
            return { id };
        },
        async replaceDataset(id, input) {
            if (provider.removeDataSource) {
                try {
                    await provider.removeDataSource(id);
                } catch {
                    // Dataset may only exist in the pending registry.
                }
            }
            if (registry.list().some((dataset) => dataset.id === id)) {
                registry.remove(id);
            }
            const nextId = await addToProvider(input);
            return { id: nextId };
        },
        async removeDataset(id) {
            if (provider.removeDataSource) {
                try {
                    await provider.removeDataSource(id);
                } catch {
                    // Ignore missing provider entries.
                }
            }
            if (registry.list().some((dataset) => dataset.id === id)) {
                registry.remove(id);
            }
        },
        async listDatasets() {
            return registry.list();
        },
        async exportConfig() {
            await syncSpecsFromProvider(provider, registry);
            return registry.exportConfig();
        },
        async exportReport() {
            await syncSpecsFromProvider(provider, registry);
            return registry.exportReport();
        },
        async applyConfig(config, rowsById) {
            registry.importConfig(config, rowsById);
            await pushRegistryToProvider(provider, registry);
        },
        async importReport(report) {
            registry.importReport(report);
            await pushRegistryToProvider(provider, registry);
        },
    };
}
