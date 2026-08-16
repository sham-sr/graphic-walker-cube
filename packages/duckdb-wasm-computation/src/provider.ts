import type { IDataQueryPayload, IDataSourceListener, IDataSourceProvider, IMutField, IRow } from '@kanaries/graphic-walker';
import { nanoid } from 'nanoid';
import { createListenerRegistry, loadJSONTable } from './runtime';
import { transformData } from './result';

/** DuckDB dateTime SQL expects epoch ms numbers; JSON date strings become VARCHAR otherwise. */
function coerceTemporalValue(value: unknown): number | null {
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

function coerceQuantitativeValue(value: unknown): number | null {
    if (value === null || value === undefined || value === '') {
        return null;
    }
    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : null;
    }
    if (typeof value === 'boolean') {
        return value ? 1 : 0;
    }
    if (typeof value === 'string') {
        const normalized = value.replace(/\s/g, '').replace(',', '.');
        const parsed = Number(normalized);
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
}

function normalizeDataForDuckDB(data: IRow[], meta: IMutField[]): IRow[] {
    const temporalFids = meta.filter((field) => field.semanticType === 'temporal').map((field) => field.fid);
    const quantitativeFids = meta
        .filter((field) => field.semanticType === 'quantitative' || field.analyticType === 'measure')
        .map((field) => field.fid);
    if (temporalFids.length === 0 && quantitativeFids.length === 0) {
        return data;
    }
    return data.map((row) => {
        const next: IRow = { ...row };
        for (const fid of temporalFids) {
            next[fid] = coerceTemporalValue(row[fid]);
        }
        for (const fid of quantitativeFids) {
            next[fid] = coerceQuantitativeValue(row[fid]);
        }
        return next;
    });
}

interface ProviderDatabase {
    registerFileText(fileName: string, content: string): Promise<unknown>;
    dropFile(fileName: string): Promise<unknown>;
}

interface ProviderConnection {
    insertJSONFromPath(fileName: string, options: { name: string }): Promise<unknown>;
    query(sql: string): Promise<any>;
    close(): Promise<void>;
}

interface ProviderDependencies {
    database: ProviderDatabase;
    connection: ProviderConnection;
    compileQuery(tableName: string, query: IDataQueryPayload): string;
    createInitialSpecs(meta: IMutField[]): string;
    eventTypes?: {
        updateList?: number;
        updateMeta?: number;
        updateSpec?: number;
        updateData?: number;
    };
}

export function createDuckDBMemoryProvider({ database, connection, compileQuery, createInitialSpecs, eventTypes }: ProviderDependencies): IDataSourceProvider {
    const datasets: { name: string; id: string }[] = [];
    const metaDict = new Map<string, IMutField[]>();
    const specDict = new Map<string, string>();
    const listeners = createListenerRegistry<IDataSourceListener>();

    return {
        async getDataSourceList() {
            return datasets;
        },
        async addDataSource(data: IRow[], meta: IMutField[], name: string) {
            const id = nanoid().replace('-', '');
            const fileName = `${id}.json`;
            await loadJSONTable(connection, database, fileName, id, normalizeDataForDuckDB(data, meta), false);
            datasets.push({ id, name });
            metaDict.set(id, meta);
            specDict.set(id, createInitialSpecs(meta));
            listeners.emit(eventTypes?.updateList ?? 1, '');
            return id;
        },
        async getMeta(datasetId) {
            const meta = metaDict.get(datasetId);
            if (!meta) throw new Error('cannot find meta');
            return meta;
        },
        async setMeta(datasetId, meta) {
            metaDict.set(datasetId, meta);
            listeners.emit(eventTypes?.updateMeta ?? 2, datasetId);
        },
        async getSpecs(datasetId) {
            const specs = specDict.get(datasetId);
            if (!specs) throw new Error('cannot find specs');
            return specs;
        },
        async saveSpecs(datasetId, value) {
            specDict.set(datasetId, value);
            listeners.emit(eventTypes?.updateSpec ?? 4, datasetId);
        },
        async removeDataSource(datasetId) {
            const index = datasets.findIndex((dataset) => dataset.id === datasetId);
            if (index < 0) {
                throw new Error('cannot find dataset');
            }
            const fileName = `${datasetId}.json`;
            const quotedId = `"${datasetId.replace(/"/g, '""')}"`;
            await connection.query(`DROP TABLE IF EXISTS ${quotedId}`).catch(() => undefined);
            await database.dropFile(fileName).catch(() => undefined);
            datasets.splice(index, 1);
            metaDict.delete(datasetId);
            specDict.delete(datasetId);
            listeners.emit(eventTypes?.updateList ?? 1, '');
        },
        async queryData(query, datasetIds) {
            const sql = compileQuery(datasetIds[0], query);
            if (process.env.NODE_ENV !== 'production') console.log(query, sql);
            return connection.query(sql).then(transformData);
        },
        registerCallback(callback) {
            return listeners.add(callback);
        },
    };
}
