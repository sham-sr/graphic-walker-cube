import type { IField } from '../../interfaces';
import type { INestNode, IPivotCube, IPivotTablePath } from './interface';
import { formatTemporalValue, resolveTimeGrain } from '@/vis/echarts/formatTemporal';
import { getCubeCell } from './cube';

export type PivotColorMode = 'none' | 'heatmap' | 'bar';
export type PivotPercentMode = 'none' | 'row' | 'column' | 'grand';
export type PivotTotalsMode = 'off' | 'grand' | 'all';
export type PivotHeaderMode = 'nested' | 'repeat';
export type PivotDateFormat = 'human' | 'technical';

export interface PivotTotalsConfig {
    rows: PivotTotalsMode;
    columns: PivotTotalsMode;
}

/** Worker / builder argument: legacy boolean, one mode for both axes, or per-axis config. */
export type PivotTableTotalsArg = boolean | PivotTotalsMode | Partial<PivotTotalsConfig>;

export interface PivotSummaryLabels {
    total: string;
    totalOf: (name: string) => string;
}

export const DEFAULT_PIVOT_COLOR_MODE: PivotColorMode = 'heatmap';
export const DEFAULT_PIVOT_PERCENT_MODE: PivotPercentMode = 'none';
export const DEFAULT_PIVOT_TOTALS_MODE: PivotTotalsMode = 'off';
export const DEFAULT_PIVOT_HEADER_MODE: PivotHeaderMode = 'nested';
export const DEFAULT_PIVOT_DATE_FORMAT: PivotDateFormat = 'human';
export const PIVOT_SUMMARY_KEY = '__pivot_summary__';

export const DEFAULT_PIVOT_SUMMARY_LABELS: PivotSummaryLabels = {
    total: 'Total',
    totalOf: (name) => `Total: ${name}`,
};

export function resolvePivotColorMode(mode?: PivotColorMode): PivotColorMode {
    return mode ?? DEFAULT_PIVOT_COLOR_MODE;
}

export function resolvePivotPercentMode(mode?: PivotPercentMode): PivotPercentMode {
    return mode ?? DEFAULT_PIVOT_PERCENT_MODE;
}

export function resolvePivotHeaderMode(mode?: PivotHeaderMode | boolean): PivotHeaderMode {
    if (mode === true || mode === 'repeat') return 'repeat';
    if (mode === false || mode === 'nested' || mode == null) return 'nested';
    return DEFAULT_PIVOT_HEADER_MODE;
}

export function resolvePivotDateFormat(mode?: PivotDateFormat): PivotDateFormat {
    return mode === 'technical' ? 'technical' : DEFAULT_PIVOT_DATE_FORMAT;
}

export function fieldLooksTemporal(field: Pick<IField, 'fid' | 'semanticType' | 'timeUnit' | 'expression'>): boolean {
    return field.semanticType === 'temporal' || resolveTimeGrain(field) !== undefined;
}

export function isPivotTotalsMode(value: unknown): value is PivotTotalsMode {
    return value === 'off' || value === 'grand' || value === 'all';
}

export function coercePivotTotalsMode(value: boolean | PivotTotalsMode | undefined): PivotTotalsMode {
    if (value === true) return 'all';
    if (value === false || value == null) return 'off';
    return isPivotTotalsMode(value) ? value : 'off';
}

export function pivotTotalsFromInput(totals: PivotTableTotalsArg | undefined): PivotTotalsConfig {
    if (totals === true) return { rows: 'all', columns: 'all' };
    if (totals === false || totals == null) return { rows: 'off', columns: 'off' };
    if (typeof totals === 'string') {
        const mode = coercePivotTotalsMode(totals);
        return { rows: mode, columns: mode };
    }
    return {
        rows: coercePivotTotalsMode(totals.rows),
        columns: coercePivotTotalsMode(totals.columns),
    };
}

/** Maps persisted layout to per-axis modes. Old `showTableSummary: true` becomes both axes `'all'`. */
export function resolvePivotTotals(
    layout: {
        showTableSummary?: boolean;
        pivotRowTotals?: PivotTotalsMode;
        pivotColumnTotals?: PivotTotalsMode;
    },
    defaultAggregated = true
): PivotTotalsConfig {
    if (!defaultAggregated) {
        return { rows: 'off', columns: 'off' };
    }
    const legacy: PivotTotalsMode = layout.showTableSummary ? 'all' : 'off';
    return {
        rows: layout.pivotRowTotals ?? legacy,
        columns: layout.pivotColumnTotals ?? legacy,
    };
}

export function showTableSummaryFromTotals(totals: PivotTotalsConfig): boolean {
    return totals.rows !== 'off' || totals.columns !== 'off';
}

function formatFieldValue(
    value: unknown,
    field: IField | undefined,
    dateFormat: PivotDateFormat,
    locale?: string
): string {
    if (field && fieldLooksTemporal(field)) {
        return formatTemporalValue(value, field, dateFormat, locale);
    }
    return `${value}`;
}

export function formatPivotHeaderValue(
    node: INestNode,
    field: IField | undefined,
    dims: readonly IField[],
    _displayOffset: number | undefined,
    labels: PivotSummaryLabels = DEFAULT_PIVOT_SUMMARY_LABELS,
    dateFormat: PivotDateFormat = DEFAULT_PIVOT_DATE_FORMAT,
    locale?: string
): string {
    if (node.kind === 'summary' || node.value === PIVOT_SUMMARY_KEY) {
        if (node.path.length === 0) {
            return labels.total;
        }
        const last = node.path[node.path.length - 1];
        const parentField = dims[node.path.length - 1];
        return labels.totalOf(formatFieldValue(last.value, parentField, dateFormat, locale));
    }
    return formatFieldValue(node.value, field, dateFormat, locale);
}

export function measureValueKey(measure: Pick<IField, 'fid' | 'aggName'>, aggregated: boolean): string {
    if (!aggregated || !measure.aggName || measure.aggName === 'expr') {
        return measure.fid;
    }
    return `${measure.fid}_${measure.aggName}`;
}

export function readNumericCell(
    cell: Record<string, unknown> | undefined,
    measure: Pick<IField, 'fid' | 'aggName'>,
    aggregated: boolean
): number | undefined {
    if (!cell) {
        return undefined;
    }
    const value = cell[measureValueKey(measure, aggregated)];
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function normalize01(value: number, min: number, max: number): number {
    if (max <= min) {
        return 0.5;
    }
    return Math.max(0, Math.min(1, (value - min) / (max - min)));
}

export function heatmapFill(t: number, dark: boolean): string {
    const x = Math.max(0, Math.min(1, t));
    if (dark) {
        const r = Math.round(30 + x * 90);
        const g = Math.round(64 + x * 110);
        const b = Math.round(110 + x * 120);
        return `rgba(${r}, ${g}, ${b}, ${0.4 + x * 0.4})`;
    }
    const r = Math.round(239 - x * 185);
    const g = Math.round(246 - x * 150);
    const b = Math.round(255 - x * 50);
    return `rgb(${r}, ${g}, ${b})`;
}

export function formatPercent(value: number): string {
    return `${(value * 100).toLocaleString(undefined, { maximumFractionDigits: 1 })}%`;
}

export function percentBasePaths(
    leftPath: IPivotTablePath,
    topPath: IPivotTablePath,
    mode: PivotPercentMode
): { left: IPivotTablePath; top: IPivotTablePath } | null {
    if (mode === 'none') {
        return null;
    }
    if (mode === 'grand') {
        return { left: [], top: [] };
    }
    if (mode === 'row') {
        return { left: leftPath, top: [] };
    }
    return { left: [], top: topPath };
}

export function percentShare(
    cube: IPivotCube,
    leftPath: IPivotTablePath,
    topPath: IPivotTablePath,
    measure: Pick<IField, 'fid' | 'aggName'>,
    aggregated: boolean,
    mode: PivotPercentMode,
    value: number
): number | undefined {
    const basePath = percentBasePaths(leftPath, topPath, mode);
    if (!basePath) {
        return undefined;
    }
    const base = readNumericCell(getCubeCell(cube, basePath.left, basePath.top), measure, aggregated);
    if (base === undefined || base === 0) {
        return undefined;
    }
    return value / base;
}

export function isSummaryLeaf(node: INestNode): boolean {
    return node.kind === 'summary';
}

export function collectMeasureExtent(
    cube: IPivotCube,
    leftLeaves: readonly INestNode[],
    topLeaves: readonly INestNode[],
    measure: Pick<IField, 'fid' | 'aggName'>,
    aggregated: boolean,
    valueOf: (left: INestNode, top: INestNode) => number | undefined
): { min: number; max: number } | undefined {
    let min = Infinity;
    let max = -Infinity;
    for (const left of leftLeaves) {
        if (isSummaryLeaf(left)) continue;
        for (const top of topLeaves) {
            if (isSummaryLeaf(top)) continue;
            const value = valueOf(left, top);
            if (value === undefined) continue;
            if (value < min) min = value;
            if (value > max) max = value;
        }
    }
    if (!Number.isFinite(min) || !Number.isFinite(max)) {
        return undefined;
    }
    return { min, max };
}

export function sortMark(fid: string | undefined, activeFid?: string, dir?: string): string {
    if (!fid || fid !== activeFid) {
        return '';
    }
    if (dir === 'ascending') return ' ↑';
    if (dir === 'descending') return ' ↓';
    return '';
}

export function nextSortMode(current?: string): 'ascending' | 'descending' | 'none' {
    if (current === 'ascending') return 'descending';
    if (current === 'descending') return 'none';
    return 'ascending';
}

export function filterablePathItems(path: IPivotTablePath): IPivotTablePath {
    return path.filter((item) => item.key.length > 0 && item.key !== PIVOT_SUMMARY_KEY && item.key !== 'root');
}

export function cellDisplayValue(
    value: number | undefined,
    share: number | undefined,
    percentMode: PivotPercentMode,
    formatNumber: (value: number) => string
): { text: string; absText: string; percentText?: string; missing: boolean } {
    if (value === undefined) {
        return { text: '—', absText: '—', missing: true };
    }
    const absText = formatNumber(value);
    if (percentMode === 'none') {
        return { text: absText, absText, missing: false };
    }
    if (share === undefined) {
        return { text: '—', absText, missing: true };
    }
    const percentText = formatPercent(share);
    return { text: percentText, absText, percentText, missing: false };
}
