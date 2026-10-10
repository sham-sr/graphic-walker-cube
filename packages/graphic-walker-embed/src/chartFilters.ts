import type { WalkerChartFilterPatch, WalkerFilterRuleType } from './contract';
import { chartFromPersistedSpec } from './chartSpecs';

/** Serialized `Methods.writeFilter` in Graphic Walker `exportFullRaw` timelines. */
const WRITE_FILTER = 8;

const RULE_TYPES = new Set<WalkerFilterRuleType>(['one of', 'not in', 'range', 'temporal range', 'regexp']);

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isHistory(value: unknown): value is { base: Record<string, unknown>; timeline: unknown[] } {
    return isRecord(value) && isRecord(value.base) && Array.isArray(value.timeline);
}

function mutableFilters(chart: Record<string, unknown>): Record<string, unknown>[] | null {
    const encodings = chart.encodings;
    if (!isRecord(encodings) || !Array.isArray(encodings.filters)) {
        return null;
    }
    return encodings.filters as Record<string, unknown>[];
}

export function chartFilterFids(spec: Record<string, unknown>): string[] {
    const filters = mutableFilters(spec);
    if (!filters) {
        return [];
    }
    return filters.flatMap((filter) => (isRecord(filter) && typeof filter.fid === 'string' ? [filter.fid] : []));
}

function patchedRule(
    rule: unknown,
    fid: string,
    patches: readonly WalkerChartFilterPatch[]
): Record<string, unknown> | null {
    let current = isRecord(rule) ? { ...rule } : null;
    let applied = false;
    for (const patch of patches) {
        if (patch.fid !== fid || (patch.type === undefined && patch.value === undefined)) {
            continue;
        }
        const type = patch.type ?? (typeof current?.type === 'string' ? current.type : undefined);
        if (typeof type !== 'string' || !RULE_TYPES.has(type as WalkerFilterRuleType)) {
            continue;
        }
        const value = patch.value !== undefined ? patch.value : current && 'value' in current ? current.value : undefined;
        if (value === undefined) {
            continue;
        }
        if (patch.type !== undefined && current && current.type !== patch.type) {
            current = { type: patch.type, value };
        } else {
            current = { ...(current ?? {}), type, value };
        }
        applied = true;
    }
    return applied ? current : null;
}

function applyRulePatches(filters: Record<string, unknown>[], patches: readonly WalkerChartFilterPatch[]): boolean {
    let changed = false;
    for (const filter of filters) {
        if (!isRecord(filter) || typeof filter.fid !== 'string') {
            continue;
        }
        const next = patchedRule(filter.rule, filter.fid, patches);
        if (!next) {
            continue;
        }
        filter.rule = next;
        changed = true;
    }
    return changed;
}

function patchHistory(
    copy: { base: Record<string, unknown>; timeline: unknown[] },
    resolved: Record<string, unknown>,
    patches: readonly WalkerChartFilterPatch[]
): boolean {
    const baseFilters = mutableFilters(copy.base);
    const baseChanged = baseFilters ? applyRulePatches(baseFilters, patches) : false;
    const resolvedFilters = mutableFilters(resolved);
    if (!resolvedFilters) {
        return baseChanged;
    }
    let appended = false;
    resolvedFilters.forEach((filter, index) => {
        if (!isRecord(filter) || typeof filter.fid !== 'string') {
            return;
        }
        const next = patchedRule(filter.rule, filter.fid, patches);
        if (!next) {
            return;
        }
        copy.timeline.push([WRITE_FILTER, index, next]);
        appended = true;
    });
    return baseChanged || appended;
}

function patchParsed(parsed: unknown, resolvable: unknown, visId: string, patches: readonly WalkerChartFilterPatch[]): unknown {
    const resolved = chartFromPersistedSpec(resolvable);
    if (!resolved || resolved.visId !== visId) {
        return parsed;
    }
    if (isHistory(parsed)) {
        const copy = JSON.parse(JSON.stringify(parsed)) as { base: Record<string, unknown>; timeline: unknown[] };
        return patchHistory(copy, resolved, patches) ? copy : parsed;
    }
    if (!isRecord(parsed)) {
        return parsed;
    }
    const copy = JSON.parse(JSON.stringify(parsed)) as Record<string, unknown>;
    const filters = mutableFilters(copy);
    if (!filters || !applyRulePatches(filters, patches)) {
        return parsed;
    }
    return copy;
}

function patchItem(item: unknown, visId: string, patches: readonly WalkerChartFilterPatch[]): unknown {
    if (typeof item === 'string') {
        let parsed: unknown;
        try {
            parsed = JSON.parse(item);
        } catch {
            return item;
        }
        const patched = patchParsed(parsed, item, visId, patches);
        return patched === parsed ? item : JSON.stringify(patched);
    }
    return patchParsed(item, item, visId, patches);
}

export function patchChartFilterSpecs(
    specsJson: string,
    visId: string,
    patches: readonly WalkerChartFilterPatch[]
): { specsJson: string; fids: string[] } {
    let parsed: unknown;
    try {
        parsed = JSON.parse(specsJson);
    } catch {
        return { specsJson, fids: [] };
    }
    if (!Array.isArray(parsed)) {
        return { specsJson, fids: [] };
    }
    let touched = false;
    const nextItems = parsed.map((item) => {
        const patched = patchItem(item, visId, patches);
        if (patched !== item) {
            touched = true;
        }
        return patched;
    });
    const nextJson = touched ? JSON.stringify(nextItems) : specsJson;
    const chart = chartFromPersistedSpec(
        (touched ? nextItems : parsed).find((item) => chartFromPersistedSpec(item)?.visId === visId) ?? null
    );
    return { specsJson: nextJson, fids: chart ? chartFilterFids(chart) : [] };
}

/** Encodings for PureRenderer. Disabled fids keep their filter row and carry `rule: null` only in this copy. */
export function visualEncodings(spec: Record<string, unknown>, disabledFids: ReadonlySet<string>): Record<string, unknown> {
    if (!isRecord(spec.encodings)) {
        return {};
    }
    const encodings = JSON.parse(JSON.stringify(spec.encodings)) as Record<string, unknown>;
    if (!Array.isArray(encodings.filters) || disabledFids.size === 0) {
        return encodings;
    }
    encodings.filters = encodings.filters.map((filter) => {
        if (!isRecord(filter) || typeof filter.fid !== 'string' || !disabledFids.has(filter.fid)) {
            return filter;
        }
        return { ...filter, rule: null };
    });
    return encodings;
}
