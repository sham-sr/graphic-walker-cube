import type { IDataQueryPayload, IRow } from '@kanaries/graphic-walker';

/** Сколько ответов queryData держать на один хост. */
export const QUERY_CACHE_LIMIT = 200;

interface CacheEntry {
    datasetId: string;
    promise: Promise<IRow[]>;
}

export interface QueryCache {
    /**
     * Возвращает уже идущий или сохранённый Promise.
     * Одинаковые одновременные запросы делят один Promise.
     * Отклонённый Promise из карты удаляется.
     */
    load(datasetId: string, payload: IDataQueryPayload, fetcher: () => Promise<IRow[]>): Promise<IRow[]>;
    invalidate(datasetId: string): void;
    clear(): void;
}

/**
 * Ключ кэша. JSON.stringify сохраняет порядок ключей объекта;
 * другой порядок полей при том же смысле даст промах, а не чужой результат.
 */
function queryCacheKey(datasetId: string, payload: IDataQueryPayload): string {
    return `${datasetId}|${JSON.stringify(payload)}`;
}

export function createQueryCache(limit: number = QUERY_CACHE_LIMIT): QueryCache {
    const entries = new Map<string, CacheEntry>();

    function remember(key: string, entry: CacheEntry): void {
        if (limit < 1) {
            return;
        }
        entries.delete(key);
        entries.set(key, entry);
        while (entries.size > limit) {
            const oldest = entries.keys().next().value;
            if (oldest === undefined || oldest === key) {
                break;
            }
            entries.delete(oldest);
        }
    }

    return {
        load(datasetId, payload, fetcher) {
            let key: string;
            try {
                key = queryCacheKey(datasetId, payload);
            } catch {
                return fetcher();
            }
            const hit = entries.get(key);
            if (hit) {
                remember(key, hit);
                return hit.promise;
            }
            if (limit < 1) {
                return fetcher();
            }
            let promise!: Promise<IRow[]>;
            promise = fetcher().then(
                (rows) => rows,
                (error: unknown) => {
                    const current = entries.get(key);
                    if (current?.promise === promise) {
                        entries.delete(key);
                    }
                    throw error;
                }
            );
            remember(key, { datasetId, promise });
            return promise;
        },
        invalidate(datasetId) {
            for (const [key, entry] of entries) {
                if (entry.datasetId === datasetId) {
                    entries.delete(key);
                }
            }
        },
        clear() {
            entries.clear();
        },
    };
}
