/** DuckDB/Arrow often returns counts and aggregates as bigint or numeric strings. */
export function toFiniteNumber(value: unknown): number | undefined {
    if (value === null || value === undefined || value === '') {
        return undefined;
    }
    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : undefined;
    }
    if (typeof value === 'bigint') {
        const n = Number(value);
        return Number.isFinite(n) ? n : undefined;
    }
    if (typeof value === 'boolean') {
        return value ? 1 : 0;
    }
    if (typeof value === 'string') {
        const normalized = value.replace(/\s/g, '').replace(',', '.');
        if (!normalized) {
            return undefined;
        }
        const parsed = Number(normalized);
        return Number.isFinite(parsed) ? parsed : undefined;
    }
    return undefined;
}

export function toCountNumber(value: unknown): number {
    return toFiniteNumber(value) ?? 0;
}
