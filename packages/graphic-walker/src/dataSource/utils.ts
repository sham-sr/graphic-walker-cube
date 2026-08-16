import { IRow, IMutField } from '../interfaces';
import { inferMeta } from '../lib/inferMeta';
import { flatKeys, guardDataKeys } from '../utils/dataPrep';

/** Convert temporal cells to epoch milliseconds for DuckDB SQL and client date ops. */
export function coerceTemporalValue(value: unknown): number | null {
    if (value === null || value === undefined || value === '') {
        return null;
    }
    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : null;
    }
    if (value instanceof Date) {
        const timestamp = value.getTime();
        return Number.isFinite(timestamp) ? timestamp : null;
    }
    const timestamp = new Date(value as string | number).getTime();
    return Number.isFinite(timestamp) ? timestamp : null;
}

export function normalizeDataByMeta(dataSource: IRow[], fields: IMutField[]): IRow[] {
    return dataSource.map((record) => {
        const newRecord: IRow = {};
        for (const field of fields) {
            const value = record[field.fid];
            if (field.semanticType === 'quantitative') {
                newRecord[field.fid] = value === null || value === undefined || value === '' ? null : Number(value);
            } else if (field.semanticType === 'temporal') {
                newRecord[field.fid] = coerceTemporalValue(value);
            } else {
                newRecord[field.fid] = value;
            }
        }
        return newRecord;
    });
}

export function transData(dataSource: IRow[]): {
    dataSource: IRow[];
    fields: IMutField[];
} {
    if (dataSource.length === 0) {
        return {
            dataSource: [],
            fields: [],
        };
    }
    const sampleRecord = dataSource[0];
    // const rawKeys = Object.keys(sampleRecord);
    // let flatColKeys: string[] = flatNestKeys(sampleRecord);

    const keys = flatKeys(sampleRecord);
    const metas = inferMeta({
        dataSource,
        fields: keys.map((k) => ({
            fid: k[k.length - 1],
            key: k[k.length - 1],
            analyticType: '?',
            semanticType: '?',
            path: k,
            basename: k[k.length - 1],
            name: k.join('.'),
        })),
    });
    const { safeData, safeMetas } = guardDataKeys(dataSource, metas);
    return {
        dataSource: normalizeDataByMeta(safeData, safeMetas),
        fields: safeMetas,
    };
}
