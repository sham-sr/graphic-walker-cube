import { chartFromPersistedSpec } from './chartSpecs';

/** Visual channels of a sheet. Dataset shelves `dimensions` / `measures` are the full field list. */
const SHEET_CHANNELS = [
    'rows',
    'columns',
    'color',
    'opacity',
    'size',
    'shape',
    'theta',
    'radius',
    'longitude',
    'latitude',
    'geoId',
    'details',
    'text',
    'filters',
] as const;

const HIDDEN_FIDS = new Set(['gw_count_fid', 'gw_mea_key_fid', 'gw_mea_val_fid']);

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** Fids already placed on the sheet. The filter editor dropdown is limited to this list. */
export function sheetFilterAllowlist(spec: Record<string, unknown>): string[] {
    const encodings = spec.encodings;
    if (!isRecord(encodings)) {
        return [];
    }
    const seen = new Set<string>();
    const allow: string[] = [];
    for (const channel of SHEET_CHANNELS) {
        const fields = encodings[channel];
        if (!Array.isArray(fields)) {
            continue;
        }
        for (const field of fields) {
            if (!isRecord(field) || typeof field.fid !== 'string' || !field.fid || HIDDEN_FIDS.has(field.fid)) {
                continue;
            }
            if (seen.has(field.fid)) {
                continue;
            }
            seen.add(field.fid);
            allow.push(field.fid);
        }
    }
    return allow;
}

/** Original persisted item for one visId, as a string `importRaw` / `importCode` can read. */
export function persistedChartRaw(specsJson: string, visId: string): string | null {
    let parsed: unknown;
    try {
        parsed = JSON.parse(specsJson);
    } catch {
        return null;
    }
    if (!Array.isArray(parsed)) {
        return null;
    }
    for (const item of parsed) {
        const chart = chartFromPersistedSpec(item);
        if (chart?.visId !== visId) {
            continue;
        }
        return typeof item === 'string' ? item : JSON.stringify(item);
    }
    return null;
}

/** Replace one sheet with a Graphic Walker `exportFullRaw` string. */
export function replacePersistedChart(specsJson: string, visId: string, nextRaw: string): string | null {
    let parsed: unknown;
    try {
        parsed = JSON.parse(specsJson);
    } catch {
        return null;
    }
    if (!Array.isArray(parsed)) {
        return null;
    }
    let touched = false;
    const next = parsed.map((item) => {
        const chart = chartFromPersistedSpec(item);
        if (chart?.visId !== visId) {
            return item;
        }
        touched = true;
        return nextRaw;
    });
    return touched ? JSON.stringify(next) : null;
}
