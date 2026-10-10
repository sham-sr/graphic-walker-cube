import {
    DatasetLimitError,
    DatasetRowsLimitError,
    GW_ARTIFACT_VERSION,
    GW_CONFIG_KIND,
    GW_REPORT_KIND,
    type GraphicWalkerConfig,
    type GraphicWalkerReport,
    type WalkerConfigDataset,
    type WalkerDatasetInfo,
    type WalkerDatasetInput,
    type WalkerField,
    type WalkerRow,
} from './contract';

export interface DatasetRegistryRecord {
    /** Caller-facing stable id. */
    id: string;
    /** Id assigned by the Graphic Walker data provider. */
    providerId: string;
    name: string;
    fields: WalkerField[];
    rows: WalkerRow[];
    specsJson: string;
    provenance?: Record<string, unknown>;
}

export interface DatasetRegistryOptions {
    maxDatasets: number;
    maxRows?: number;
    /** Строки датасета записаны или датасет удалён. Аргумент — id провайдера, им же ключуется queryData. */
    onDatasetDataChanged?: (providerId: string) => void;
    /** Реестр очищен целиком: import, replace всех слотов, destroy. */
    onDatasetDataCleared?: () => void;
}

const EMPTY_SPECS = '[]';

function clone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
}

function newId(): string {
    return `ds_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

export function createDatasetRegistry(options: DatasetRegistryOptions) {
    const datasets = new Map<string, DatasetRegistryRecord>();
    let selectedDatasetId: string | undefined;

    const maxDatasets = options.maxDatasets;
    const maxRows = options.maxRows;

    function notifyDataChanged(providerId: string): void {
        options.onDatasetDataChanged?.(providerId);
    }

    function notifyDataCleared(): void {
        options.onDatasetDataCleared?.();
    }

    function list(): WalkerDatasetInfo[] {
        return [...datasets.values()].map((dataset) => ({ id: dataset.id, name: dataset.name }));
    }

    function get(id: string): DatasetRegistryRecord {
        const dataset = datasets.get(id);
        if (!dataset) {
            throw new Error(`Dataset not found: ${id}`);
        }
        return dataset;
    }

    function assertRowsLimit(rows: WalkerRow[]): void {
        if (maxRows !== undefined && maxRows > 0 && rows.length > maxRows) {
            throw new DatasetRowsLimitError(maxRows, rows.length);
        }
    }

    function assertCanAdd(exceptId?: string): void {
        const size = exceptId && datasets.has(exceptId) ? datasets.size - 1 : datasets.size;
        if (size >= maxDatasets) {
            throw new DatasetLimitError(maxDatasets, list());
        }
    }

    function add(input: WalkerDatasetInput, id?: string, providerId?: string): string {
        assertCanAdd();
        assertRowsLimit(input.rows);
        const externalId = id ?? providerId ?? newId();
        const record: DatasetRegistryRecord = {
            id: externalId,
            providerId: providerId ?? externalId,
            name: input.name,
            fields: clone(input.fields),
            rows: clone(input.rows),
            specsJson: input.specsJson ?? EMPTY_SPECS,
            provenance: input.provenance ? clone(input.provenance) : undefined,
        };
        datasets.set(externalId, record);
        selectedDatasetId = externalId;
        notifyDataChanged(record.providerId);
        return externalId;
    }

    function findExternalIdByProviderId(providerId: string): string | undefined {
        for (const record of datasets.values()) {
            if (record.providerId === providerId) {
                return record.id;
            }
        }
        return undefined;
    }

    function replace(id: string, input: WalkerDatasetInput): string {
        const previous = datasets.get(id);
        if (!previous) {
            throw new Error(`Dataset not found: ${id}`);
        }
        assertRowsLimit(input.rows);
        datasets.delete(id);
        notifyDataChanged(previous.providerId);
        return add(input);
    }

    function remove(id: string): void {
        const previous = datasets.get(id);
        if (!previous) {
            throw new Error(`Dataset not found: ${id}`);
        }
        datasets.delete(id);
        notifyDataChanged(previous.providerId);
        if (selectedDatasetId === id) {
            const remaining = [...datasets.keys()];
            selectedDatasetId = remaining[remaining.length - 1];
        }
    }

    function updateSpecs(id: string, specsJson: string): void {
        get(id).specsJson = specsJson;
    }

    function clear(): void {
        datasets.clear();
        selectedDatasetId = undefined;
        notifyDataCleared();
    }

    function toConfigDataset(dataset: DatasetRegistryRecord): WalkerConfigDataset {
        return {
            id: dataset.id,
            name: dataset.name,
            fields: clone(dataset.fields),
            specsJson: dataset.specsJson,
            provenance: dataset.provenance ? clone(dataset.provenance) : undefined,
        };
    }

    function exportConfig(): GraphicWalkerConfig {
        return {
            kind: GW_CONFIG_KIND,
            version: GW_ARTIFACT_VERSION,
            selectedDatasetId,
            datasets: [...datasets.values()].map(toConfigDataset),
        };
    }

    function exportReport(): GraphicWalkerReport {
        return {
            kind: GW_REPORT_KIND,
            version: GW_ARTIFACT_VERSION,
            selectedDatasetId,
            datasets: [...datasets.values()].map((dataset) => ({
                ...toConfigDataset(dataset),
                rows: clone(dataset.rows),
            })),
        };
    }

    function importConfig(config: GraphicWalkerConfig, rowsById: Record<string, WalkerRow[]>): void {
        clear();
        for (const dataset of config.datasets) {
            const rows = rowsById[dataset.id];
            if (!rows) {
                throw new Error(`Missing refreshed rows for dataset ${dataset.id}`);
            }
            add(
                {
                    name: dataset.name,
                    fields: dataset.fields,
                    rows,
                    provenance: dataset.provenance,
                    specsJson: dataset.specsJson,
                },
                dataset.id
            );
        }
        selectedDatasetId = config.selectedDatasetId && datasets.has(config.selectedDatasetId) ? config.selectedDatasetId : selectedDatasetId;
    }

    function importReport(report: GraphicWalkerReport): void {
        clear();
        for (const dataset of report.datasets) {
            add(
                {
                    name: dataset.name,
                    fields: dataset.fields,
                    rows: dataset.rows,
                    provenance: dataset.provenance,
                    specsJson: dataset.specsJson,
                },
                dataset.id
            );
        }
        selectedDatasetId = report.selectedDatasetId && datasets.has(report.selectedDatasetId) ? report.selectedDatasetId : selectedDatasetId;
    }

    return {
        get maxDatasets() {
            return maxDatasets;
        },
        get size() {
            return datasets.size;
        },
        get selectedDatasetId() {
            return selectedDatasetId;
        },
        setSelectedDatasetId(id: string | undefined) {
            selectedDatasetId = id;
        },
        list,
        get,
        add,
        replace,
        remove,
        updateSpecs,
        clear,
        exportConfig,
        exportReport,
        importConfig,
        importReport,
        findExternalIdByProviderId,
    };
}

export type DatasetRegistry = ReturnType<typeof createDatasetRegistry>;
