declare module '@kanaries/graphic-walker' {
    export type IRow = Record<string, unknown>;

    export interface IMutField {
        fid: string;
        semanticType?: string;
        [key: string]: unknown;
    }

    export type IDataSourceListener = (event: number, datasetId: string) => void;

    export interface IDataQueryPayload {
        workflow: any[];
        tag?: string;
        limit?: number;
        offset?: number;
    }

    export interface IDataSourceProvider {
        addDataSource(data: IRow[], meta: IMutField[], name: string): Promise<string>;
        getDataSourceList(): Promise<{ name: string; id: string }[]>;
        getMeta(datasetId: string): Promise<IMutField[]>;
        setMeta(datasetId: string, meta: IMutField[]): Promise<void>;
        getSpecs(datasetId: string): Promise<string>;
        saveSpecs(datasetId: string, value: string): Promise<void>;
        queryData(query: IDataQueryPayload, datasetIds: string[]): Promise<IRow[]>;
        removeDataSource?(datasetId: string): Promise<void>;
        onExportFile?: () => Promise<Blob>;
        onImportFile?: (file: File) => void;
        registerCallback(callback: IDataSourceListener): () => void;
    }

    export const IDataSourceEventType: {
        readonly updateList: number;
        readonly updateMeta: number;
        readonly updateSpec: number;
        readonly updateData: number;
    };

    export function exportFullRaw(...args: unknown[]): string;
    export function fromFields(...args: unknown[]): unknown;
}
