/**
 * Checks whether saved Graphic Walker chart specs can run on a new field set.
 * @module canReuseWalkerSpecs
 */

import type { WalkerField } from './contract';

const EMPTY_SPECS = '[]';

/** Built-in Graphic Walker field ids that are not part of the dataset schema */
const BUILTIN_FIDS = new Set(['gw_count_fid', 'gw_mea_key_fid', 'gw_mea_val_fid', 'gw_paint_fid']);

function collectFids(value: unknown, fids: Set<string>): void {
    if (Array.isArray(value)) {
        for (const item of value) collectFids(item, fids);
        return;
    }
    if (!value || typeof value !== 'object') return;
    const record = value as Record<string, unknown>;
    if (typeof record.fid === 'string' && record.fid) {
        fids.add(record.fid);
    }
    for (const nested of Object.values(record)) {
        collectFids(nested, fids);
    }
}

function encodingFids(specs: unknown): string[] {
    if (!Array.isArray(specs)) return [];
    const fids = new Set<string>();
    for (const chart of specs) {
        if (!chart || typeof chart !== 'object') continue;
        const encodings = (chart as { encodings?: unknown }).encodings;
        if (encodings) collectFids(encodings, fids);
    }
    return [...fids];
}

export function canReuseWalkerSpecs(specsJson: string | undefined, fields: WalkerField[]): boolean {
    const raw = specsJson?.trim() || EMPTY_SPECS;
    if (raw === EMPTY_SPECS) return true;
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return false;
    }
    if (!Array.isArray(parsed) || parsed.length === 0) return true;
    const available = new Set(fields.map((field) => field.fid));
    return encodingFids(parsed).every((fid) => BUILTIN_FIDS.has(fid) || available.has(fid));
}

export function resolveReplaceSpecs(
    inputSpecs: string | undefined,
    previousSpecs: string | undefined,
    fields: WalkerField[]
): { specsJson: string; chartsCleared: boolean } {
    const candidate = (inputSpecs && inputSpecs !== EMPTY_SPECS ? inputSpecs : previousSpecs) ?? EMPTY_SPECS;
    if (candidate === EMPTY_SPECS || canReuseWalkerSpecs(candidate, fields)) {
        return { specsJson: candidate === EMPTY_SPECS ? EMPTY_SPECS : candidate, chartsCleared: false };
    }
    return { specsJson: EMPTY_SPECS, chartsCleared: true };
}
