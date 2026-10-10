/**
 * Public host contract for Graphic Walker embeddings.
 * Framework-agnostic: no Vue, no Cube.js, no React.
 */

export const GW_CONFIG_KIND = 'cube-gw-config' as const;
export const GW_REPORT_KIND = 'cube-gw-report' as const;
export const GW_ARTIFACT_VERSION = 1 as const;

export const GW_CONFIG_EXTENSION = '.cube-config.json';
export const GW_REPORT_EXTENSION = '.cube-report.json';

/** Toolbar keys Graphic Walker already supports via `toolbar.exclude`. */
export const GW_TOOLBAR_KANARIES = 'kanaries';
export const GW_TOOLBAR_DEBUG = 'debug';
export const GW_DEFAULT_TOOLBAR_EXCLUDE = [GW_TOOLBAR_KANARIES, GW_TOOLBAR_DEBUG] as const;

/**
 * Kanaries AskViz / VL chat stay off in the Cube host.
 * `true` would fall back to api.kanaries.net; the embed never enables that path.
 */
export const GW_EMBED_ENHANCE_API = {
    features: {
        askviz: false,
        feedbackAskviz: false,
        vlChat: false,
    },
} as const;

/** Graphic Walker experimental flags. Computed fields match the upstream playground. */
export interface GraphicWalkerExperimentalFeatures {
    computedField?: boolean;
}

export const GW_DEFAULT_EXPERIMENTAL_FEATURES: GraphicWalkerExperimentalFeatures = {
    computedField: true,
};

export type WalkerSemanticType = 'quantitative' | 'nominal' | 'ordinal' | 'temporal';
export type WalkerAnalyticType = 'dimension' | 'measure';

/** Порядок категорий измерения. Необязателен: старые поля без него работают как раньше. */
export interface WalkerCategoryOrder {
    by?: string;
    order?: string[];
}

/**
 * Запрос порядка категорий у хоста.
 * Плоский: cube_front не импортирует типы Graphic Walker.
 */
export interface WalkerCategoryOrderRequest {
    /** Внешний id датасета, который сейчас открыт в редакторе. */
    datasetId: string;
    fid: string;
    name: string;
    semanticType: string;
}

export interface WalkerField {
    fid: string;
    name?: string;
    basename?: string;
    semanticType: WalkerSemanticType;
    analyticType: WalkerAnalyticType;
    offset?: number;
    categoryOrder?: WalkerCategoryOrder;
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
    /** Stable external id (e.g. host slot id). When omitted, the provider id is used. */
    id?: string;
}

export interface WalkerDatasetInfo {
    id: string;
    name: string;
}

/** One Graphic Walker sheet, identified without copying rows or specs. */
/** `table` is a pivot/crosstab (`geoms[0] === 'table'`). Everything else is a graphic. */
export type WalkerChartKind = 'chart' | 'table';

export interface WalkerChartInfo {
    datasetId: string;
    datasetName: string;
    visId: string;
    name: string;
    queryFingerprint?: string;
    /** Omitted by older hosts. `listCharts` always sets it. */
    kind?: WalkerChartKind;
}

export interface WalkerChartRef {
    datasetId: string;
    visId: string;
}

/** Operators already stored on a Graphic Walker filter rule. */
export type WalkerFilterRuleType = 'one of' | 'not in' | 'range' | 'temporal range' | 'regexp';

/**
 * Change one existing sheet filter.
 * `type` and `value` are written into the saved spec.
 * `enabled` is session-only: `false` keeps the spec rule and omits it from the PureRenderer frame.
 * An unknown `fid` is ignored. The saved filter list is not extended or shortened.
 */
export interface WalkerChartFilterPatch {
    fid: string;
    type?: WalkerFilterRuleType;
    value?: unknown;
    enabled?: boolean;
}

export type WalkerChartExportFormat = 'png' | 'svg' | 'csv' | 'xlsx' | 'ods' | 'grid';

/**
 * Text grid of a pivot tile, with the same cell text as the on-screen table.
 * `headerRows` / `headerColumns` are the frozen header bands. `merges` uses spreadsheet ranges.
 */
export interface WalkerTableGrid {
    /** Cell text formatted as on screen. */
    rows: (string | null)[][];
    /** Number of column-header rows at the top. */
    headerRows: number;
    /** Number of row-header columns on the left. */
    headerColumns: number;
    merges: { s: { r: number; c: number }; e: { r: number; c: number } }[];
}

/**
 * Image from the same renderer API the editor toolbar uses (`getCanvasData` / `getSVGData`).
 * png `data` is a data URL. svg `data` is SVG markup or a data URL.
 * `grid` leaves `data` empty and fills `grid` for a table tile.
 */
export interface WalkerChartExport {
    format: WalkerChartExportFormat;
    data: string;
    /** Set when `format` is `grid`. */
    grid?: WalkerTableGrid;
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
    /** Initial Graphic Walker segment. Default: visualization (charts). */
    defaultTab?: 'data' | 'visualization';
    /** Hide toolbar items by Graphic Walker key. Default: Kanaries docs and debug. */
    toolbarExclude?: readonly string[];
    /** Graphic Walker experimental flags. Default: computed fields enabled. */
    experimentalFeatures?: GraphicWalkerExperimentalFeatures;
    /**
     * Провайдер порядка категорий.
     * Редактор вызывает его для измерения. `null` — у API нет порядка, остаётся автоопределение.
     * Без этой опции кнопка на пилюле не показывается.
     */
    categoryOrderProvider?: (request: WalkerCategoryOrderRequest) => Promise<WalkerCategoryOrder | null>;
}

export interface WalkerReplaceResult {
    id: string;
    /** True when previous charts could not be applied to the new fields */
    chartsCleared?: boolean;
}

/**
 * Параметры диалога «Настройки фильтра» листа.
 * Метод открывает диалог «Настройки фильтра» GW для листа.
 * Поля ограничены каналами листа.
 */
export interface WalkerSheetFilterPanelOptions {
    /**
     * Диалог закрыт подтверждением или отменой.
     * Хосту следует вызвать release, возвращённый из `mountSheetFilterPanel`.
     */
    onClose?: () => void;
}

export interface GraphicWalkerHost {
    setLocale(lang: string): void;
    setAppearance(mode: 'light' | 'dark'): void;
    addDataset(input: WalkerDatasetInput): Promise<{ id: string }>;
    replaceDataset(id: string, input: WalkerDatasetInput): Promise<WalkerReplaceResult>;
    removeDataset(id: string): Promise<void>;
    listDatasets(): Promise<{ id: string; name: string }[]>;
    /** Charts already built on Graphic Walker sheets (pointers, not data copies). */
    listCharts(): Promise<WalkerChartInfo[]>;
    /** Render one sheet into `el` via PureRenderer + the existing DuckDB provider. */
    createChartView(el: HTMLElement, ref: WalkerChartRef): () => void;
    /**
     * Update values or operators of existing sheet filters and remember which fids are off for this session.
     * Disabled rules stay in the saved spec and are passed to PureRenderer as `rule: null`.
     */
    patchChartFilters(ref: WalkerChartRef, patches: readonly WalkerChartFilterPatch[]): Promise<void>;
    /**
     * Export one live tile through the editor toolbar's renderer API, without enabling the PureRenderer toolbar.
     * png/svg return image data. csv/xlsx/ods download a pivot table through the same handler as the editor toolbar.
     * `grid` returns `{ format: 'grid', data: '', grid }` for a table tile.
     * png/svg on a table tile reject with 'Table has no image export'.
     */
    exportChart(ref: WalkerChartRef, format: WalkerChartExportFormat): Promise<WalkerChartExport>;
    /**
     * Открывает диалог «Настройки фильтра» GW для листа в `el`.
     * Поля ограничены каналами листа.
     * Запись уходит в spec датасета и обновляет живые плитки.
     * `options.onClose` — диалог закрыт; хосту следует вызвать release.
     */
    mountSheetFilterPanel(el: HTMLElement, ref: WalkerChartRef, options?: WalkerSheetFilterPanelOptions): () => void;
    /**
     * Mount or unmount the Graphic Walker editor.
     * Unmount flushes specs first. The dataset registry, DuckDB provider, and chart tiles stay alive.
     */
    setEditorMounted(mounted: boolean): Promise<void>;
    exportConfig(): Promise<GraphicWalkerConfig>;
    exportReport(): Promise<GraphicWalkerReport>;
    applyConfig(config: GraphicWalkerConfig, rowsById: Record<string, WalkerRow[]>): Promise<void>;
    importReport(report: GraphicWalkerReport): Promise<void>;
    /** Persist in-memory chart specs for the current dataset before switching or exporting. */
    flushSpecs(): Promise<void>;
    selectDataset(id: string): Promise<void>;
    destroy(): void;
}

export { canReuseWalkerSpecs, resolveReplaceSpecs } from './canReuseWalkerSpecs';

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
