import { resolveChart } from '@kanaries/graphic-walker';
import type { DatasetRegistry } from './datasetRegistry';
import type { WalkerChartInfo } from './contract';

export interface ParsedWalkerChart {
    visId: string;
    name: string;
    spec: Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isHistoryExport(value: unknown): boolean {
    return isRecord(value) && isRecord(value.base) && Array.isArray(value.timeline);
}

function chartFromHistory(raw: string): Record<string, unknown> | null {
    try {
        return resolveChart(raw) as unknown as Record<string, unknown>;
    } catch {
        return null;
    }
}

/** Graphic Walker persists visDict as exportFullRaw strings, or as IChart-like objects. */
export function chartFromPersistedSpec(item: unknown): Record<string, unknown> | null {
    if (typeof item === 'string') {
        let parsed: unknown;
        try {
            parsed = JSON.parse(item);
        } catch {
            return null;
        }
        if (isHistoryExport(parsed)) {
            return chartFromHistory(item);
        }
        return isRecord(parsed) ? parsed : null;
    }
    if (isHistoryExport(item)) {
        try {
            return chartFromHistory(JSON.stringify(item));
        } catch {
            return null;
        }
    }
    return isRecord(item) ? item : null;
}

export function parseWalkerCharts(specsJson: string): ParsedWalkerChart[] {
    let parsed: unknown;
    try {
        parsed = JSON.parse(specsJson);
    } catch {
        return [];
    }
    if (!Array.isArray(parsed)) {
        return [];
    }
    const charts: ParsedWalkerChart[] = [];
    for (const item of parsed) {
        const record = chartFromPersistedSpec(item);
        if (!record) {
            continue;
        }
        if (typeof record.visId !== 'string' || record.visId.length === 0) {
            continue;
        }
        if (!record.encodings || typeof record.encodings !== 'object') {
            continue;
        }
        if (!record.config || typeof record.config !== 'object') {
            continue;
        }
        const name = typeof record.name === 'string' && record.name.trim() ? record.name.trim() : 'Chart';
        charts.push({ visId: record.visId, name, spec: record });
    }
    return charts;
}

export function listChartsFromRegistry(registry: DatasetRegistry): WalkerChartInfo[] {
    const charts: WalkerChartInfo[] = [];
    for (const info of registry.list()) {
        const record = registry.get(info.id);
        const queryFingerprint =
            typeof record.provenance?.queryFingerprint === 'string' && record.provenance.queryFingerprint
                ? record.provenance.queryFingerprint
                : undefined;
        for (const chart of parseWalkerCharts(record.specsJson)) {
            charts.push({
                datasetId: info.id,
                datasetName: info.name,
                visId: chart.visId,
                name: chart.name,
                queryFingerprint,
            });
        }
    }
    return charts;
}

export function findChartSpec(
    registry: DatasetRegistry,
    datasetId: string,
    visId: string
): ParsedWalkerChart | null {
    try {
        const record = registry.get(datasetId);
        return parseWalkerCharts(record.specsJson).find((chart) => chart.visId === visId) ?? null;
    } catch {
        return null;
    }
}
