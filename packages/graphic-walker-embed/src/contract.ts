/**
 * Public host contract for Graphic Walker embeddings.
 * Framework-agnostic: no Vue, no Cube.js, no React.
 */

export const GW_CONFIG_KIND = 'cube-gw-config' as const;
export const GW_REPORT_KIND = 'cube-gw-report' as const;
export const GW_ARTIFACT_VERSION = 1 as const;

export const GW_CONFIG_EXTENSION = '.cube-config.json';
export const GW_REPORT_EXTENSION = '.cube-report.json';

export type WalkerSemanticType = 'quantitative' | 'nominal' | 'ordinal' | 'temporal';
export type WalkerAnalyticType = 'dimension' | 'measure';

export interface WalkerField {
    fid: string;
    name?: string;
    basename?: string;
    semanticType: WalkerSemanticType;
    analyticType: WalkerAnalyticType;
    offset?: number;
}

export type WalkerRow = Record<string, unknown>;

/** Opaque host-owned metadata (Cube Front stores cubeName + query here). */
export type DatasetProvenance = Record<string, unknown>;

export interface WalkerDatasetInput {
    name: string;
    rows: WalkerRow[];
    fields: WalkerField[];
    provenance?: DatasetProvenance;
    /** Serialized chart specs JSON (stringified string[]). */
    specsJson?: string;
}

export interface WalkerDatasetInfo {
    id: string;
    name: string;
}

export interface WalkerConfigDataset {
    id: string;
    name: string;
    fields: WalkerField[];
    specsJson: string;
    provenance?: DatasetProvenance;
}

export interface WalkerReportDataset extends WalkerConfigDataset {
    rows: WalkerRow[];
}

export interface GraphicWalkerConfig {
    kind: typeof GW_CONFIG_KIND;
    version: typeof GW_ARTIFACT_VERSION;
    selectedDatasetId?: string;
    datasets: WalkerConfigDataset[];
}

export interface GraphicWalkerReport {
    kind: typeof GW_REPORT_KIND;
    version: typeof GW_ARTIFACT_VERSION;
    selectedDatasetId?: string;
    datasets: WalkerReportDataset[];
}

export type GraphicWalkerArtifact = GraphicWalkerConfig | GraphicWalkerReport;

export class DatasetLimitError extends Error {
    readonly code = 'DATASET_LIMIT' as const;

    constructor(
        public readonly maxDatasets: number,
        public readonly datasets: WalkerDatasetInfo[]
    ) {
        super(`Maximum number of datasets (${maxDatasets}) reached`);
        this.name = 'DatasetLimitError';
    }
}

export class DatasetRowsLimitError extends Error {
    readonly code = 'DATASET_ROWS_LIMIT' as const;

    constructor(
        public readonly maxRows: number,
        public readonly rowCount: number
    ) {
        super(`Dataset has ${rowCount} rows; maximum allowed is ${maxRows}`);
        this.name = 'DatasetRowsLimitError';
    }
}

export interface GraphicWalkerHostOptions {
    maxDatasets: number;
    maxRows?: number;
    i18nLang?: string;
    appearance?: 'light' | 'dark';
}

export interface GraphicWalkerHost {
    setLocale(lang: string): void;
    setAppearance(mode: 'light' | 'dark'): void;
    addDataset(input: WalkerDatasetInput): Promise<{ id: string }>;
    replaceDataset(id: string, input: WalkerDatasetInput): Promise<{ id: string }>;
    removeDataset(id: string): Promise<void>;
    listDatasets(): Promise<{ id: string; name: string }[]>;
    exportConfig(): Promise<GraphicWalkerConfig>;
    exportReport(): Promise<GraphicWalkerReport>;
    applyConfig(config: GraphicWalkerConfig, rowsById: Record<string, WalkerRow[]>): Promise<void>;
    importReport(report: GraphicWalkerReport): Promise<void>;
    destroy(): void;
}

export function isGraphicWalkerConfig(value: unknown): value is GraphicWalkerConfig {
    return isArtifact(value, GW_CONFIG_KIND);
}

export function isGraphicWalkerReport(value: unknown): value is GraphicWalkerReport {
    return isArtifact(value, GW_REPORT_KIND);
}

export function detectWalkerArtifact(value: unknown): GraphicWalkerArtifact | null {
    if (isGraphicWalkerConfig(value) || isGraphicWalkerReport(value)) {
        return value;
    }
    return null;
}

export function fileExtensionForKind(kind: GraphicWalkerArtifact['kind']): string {
    return kind === GW_REPORT_KIND ? GW_REPORT_EXTENSION : GW_CONFIG_EXTENSION;
}

function isArtifact(value: unknown, kind: GraphicWalkerArtifact['kind']): boolean {
    if (typeof value !== 'object' || value === null) {
        return false;
    }
    const record = value as Record<string, unknown>;
    return record.kind === kind && record.version === GW_ARTIFACT_VERSION && Array.isArray(record.datasets);
}
