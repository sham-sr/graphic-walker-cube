import { Vector } from 'apache-arrow';
import { bigNumToString } from 'apache-arrow/util/bn';

interface ArrowTypeLike {
    scale?: number;
}

const numberOrExactString = (value: string): number | string => {
    const number = Number(value);
    return Number.isSafeInteger(number) ? number : value;
};

function toFiniteNumber(value: unknown): number | undefined {
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

/** Aggregate/measure columns from DuckDB often use these key patterns. */
function shouldCoerceNumericKey(key: string): boolean {
    if (key === 'count') {
        return true;
    }
    if (key.startsWith('count_') || key.startsWith('total_distinct_')) {
        return true;
    }
    return /_(sum|min|max|avg|count)$/.test(key);
}

function isNumericArrowType(type?: ArrowTypeLike): boolean {
    if (!type) {
        return false;
    }
    const typeId = (type as { typeId?: number }).typeId;
    if (typeof typeId === 'number') {
        return typeId >= 2 && typeId <= 11;
    }
    const name = String(type);
    return /Int|UInt|Float|Decimal|Double/i.test(name);
}

function coerceComputationValue(key: string, value: unknown, numericColumn: boolean): unknown {
    if (typeof value === 'bigint') {
        const n = Number(value);
        return Number.isFinite(n) ? n : value.toString();
    }
    if (!numericColumn && !shouldCoerceNumericKey(key)) {
        return value;
    }
    const n = toFiniteNumber(value);
    return n === undefined ? value : n;
}

const scaledIntegerToDecimalString = (value: string, scale: number): string => {
    const sign = value.startsWith('-') ? '-' : '';
    const digits = sign ? value.slice(1) : value;
    const padded = digits.padStart(scale + 1, '0');
    return `${sign}${padded.slice(0, -scale)}.${padded.slice(-scale)}`;
};

function isArrowVector(value: object): value is Iterable<unknown> {
    if (value instanceof Vector) {
        return typeof value[Symbol.iterator] === 'function';
    }
    const candidate = value as {
        toArray?: unknown;
        get?: unknown;
        length?: unknown;
        [Symbol.iterator]?: unknown;
    };
    return (
        typeof candidate.toArray === 'function' &&
        typeof candidate.get === 'function' &&
        typeof candidate.length === 'number' &&
        typeof candidate[Symbol.iterator] === 'function'
    );
}

function isArrowBigNum(value: object): boolean {
    return ArrayBuffer.isView(value) && Symbol.toPrimitive in value;
}

export const arrowToJSON = (value: any, type?: ArrowTypeLike): any => {
    if (value === null || value === undefined) return value;
    if (value instanceof Date) return value.getTime();
    if (typeof value === 'bigint') return Number.isSafeInteger(Number(value)) ? Number(value) : value.toString();
    if (Array.isArray(value)) return value.map((item) => arrowToJSON(item));

    if (typeof value === 'object') {
        if (isArrowVector(value)) {
            return Array.from(value).map((item) => arrowToJSON(item));
        }
        if (isArrowBigNum(value)) {
            const integer = bigNumToString(value);
            if (type?.scale) {
                const decimal = Number(integer) / 10 ** type.scale;
                return Number.isSafeInteger(Number(integer)) ? decimal : scaledIntegerToDecimalString(integer, type.scale);
            }
            return numberOrExactString(integer);
        }
        return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, arrowToJSON(item)]));
    }

    return value;
};

interface ArrowTableLike {
    schema?: { fields?: Array<{ name: string; type?: ArrowTypeLike }> };
    toArray(): Array<{ toJSON(): Record<string, unknown> }>;
}

export const transformData = (table: ArrowTableLike) => {
    const fieldTypes = new Map(table.schema?.fields?.map((field) => [field.name, field.type]) ?? []);
    return table
        .toArray()
        .map((row) =>
            Object.fromEntries(
                Object.entries(row.toJSON()).map(([key, value]) => {
                    const fieldType = fieldTypes.get(key);
                    const decoded = arrowToJSON(value, fieldType);
                    return [key, coerceComputationValue(key, decoded, isNumericArrowType(fieldType))];
                })
            )
        );
};
