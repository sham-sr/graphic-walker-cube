import * as duckdb from '@duckdb/duckdb-wasm';
import duckdb_wasm from '@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url';
import mvp_worker from '@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url';
import duckdb_wasm_eh from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url';
import eh_worker from '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url';
import initWasm, { parser_dsl_with_table } from '@kanaries/gw-dsl-parser';
import dslWasm from '@kanaries/gw-dsl-parser/gw_dsl_parser_bg.wasm?url';
import { nanoid } from 'nanoid';
import { IDataSourceEventType, exportFullRaw, fromFields } from '@kanaries/graphic-walker';
import type { IDataQueryPayload, IDataSourceProvider, IRow } from '@kanaries/graphic-walker';
import { cleanupComputation, createInitializer, loadJSONTable } from './runtime';
import { transformData } from './result';
import { compileWorkflowToSQL } from './compile';
import { createDuckDBMemoryProvider } from './provider';

const MANUAL_BUNDLES: duckdb.DuckDBBundles = {
    mvp: {
        mainModule: duckdb_wasm,
        mainWorker: mvp_worker,
    },
    eh: {
        mainModule: duckdb_wasm_eh,
        mainWorker: eh_worker,
    },
};

let db: duckdb.AsyncDuckDB;

/** Vite may emit `/@fs/C:/...` for assets outside the app root; blob workers cannot parse those as relative URLs. */
function toAbsoluteAssetUrl(assetPath: string): string {
    if (/^(?:https?:|blob:|data:)/i.test(assetPath)) {
        return assetPath;
    }
    return new URL(assetPath, globalThis.location?.href ?? 'http://localhost/').href;
}

function isWindowsViteFsUrl(assetUrl: string): boolean {
    return assetUrl.includes('/@fs/') && /\/[A-Za-z]:\//.test(assetUrl);
}

/**
 * Resolve an asset URL that DuckDB's blob worker can fetch.
 * On Windows Vite, `/@fs/C:/...` breaks `new Request()` inside workers, so materialize as a blob URL.
 */
async function toWorkerSafeAssetUrl(assetPath: string, mimeType: string): Promise<string> {
    const absoluteUrl = toAbsoluteAssetUrl(assetPath);
    if (!isWindowsViteFsUrl(absoluteUrl)) {
        return absoluteUrl;
    }

    const response = await fetch(absoluteUrl);
    if (!response.ok) {
        throw new Error(`Failed to load DuckDB asset: ${response.status} ${absoluteUrl}`);
    }
    const buffer = await response.arrayBuffer();
    return URL.createObjectURL(new Blob([buffer], { type: mimeType }));
}

async function createDuckDBWorker(mainWorker: string): Promise<Worker> {
    // Main-thread fetch can load /@fs URLs; inline into a blob Worker to avoid importScripts(/@fs/C:...).
    const absoluteWorkerUrl = toAbsoluteAssetUrl(mainWorker);
    const script = await fetch(absoluteWorkerUrl).then((response) => {
        if (!response.ok) {
            throw new Error(`Failed to load DuckDB worker: ${response.status} ${absoluteWorkerUrl}`);
        }
        return response.text();
    });
    return new Worker(URL.createObjectURL(new Blob([script], { type: 'text/javascript' })));
}

const initialize = createInitializer(async () => {
    // Select a bundle based on browser checks
    const bundle = await duckdb.selectBundle(MANUAL_BUNDLES);

    let worker: Worker | undefined;
    let nextDatabase: duckdb.AsyncDuckDB | undefined;
    try {
        worker = await createDuckDBWorker(bundle.mainWorker!);
        const mainModule = await toWorkerSafeAssetUrl(bundle.mainModule, 'application/wasm');
        const pthreadWorker = bundle.pthreadWorker
            ? await toWorkerSafeAssetUrl(bundle.pthreadWorker, 'text/javascript')
            : undefined;
        const dslModule = await toWorkerSafeAssetUrl(dslWasm, 'application/wasm');

        // Instantiate the asynchronous version of DuckDB-Wasm.
        nextDatabase = new duckdb.AsyncDuckDB(new duckdb.ConsoleLogger(), worker);
        await nextDatabase.instantiate(mainModule, pthreadWorker);
        await initWasm(dslModule);
        db = nextDatabase;
    } catch (error) {
        if (nextDatabase) {
            await nextDatabase.terminate().catch(() => undefined);
        } else {
            worker?.terminate();
        }
        throw error;
    }
});

export async function init() {
    await initialize();
}

export async function getMemoryProvider(): Promise<IDataSourceProvider> {
    await init();
    return createDuckDBMemoryProvider({
        database: db,
        connection: await db.connect(),
        compileQuery: (tableName, query) => compileWorkflowToSQL(parser_dsl_with_table, tableName, query),
        createInitialSpecs: (meta) => JSON.stringify([exportFullRaw(fromFields(meta, 'Chart 1'))]),
        eventTypes: IDataSourceEventType,
    });
}

export async function getComputation(data: IRow[]) {
    if (data.length === 0) {
        return {
            close: async () => {},
            computation: async () => [],
        };
    }
    await init();
    const tableName = nanoid().replace('-', '');
    const fileName = `${tableName}.json`;
    const conn = await db.connect();
    await loadJSONTable(conn, db, fileName, tableName, data, true);
    return {
        close: (() => {
            let closePromise: Promise<void> | undefined;
            return () => (closePromise ??= cleanupComputation(conn, db, fileName, tableName));
        })(),
        computation: async (query: IDataQueryPayload) => {
            const sql = compileWorkflowToSQL(parser_dsl_with_table, tableName, query);
            if (process.env.NODE_ENV !== 'production') {
                console.log(query, sql);
            }
            const res = await conn.query(sql).then(transformData);
            return res;
        },
    };
}
