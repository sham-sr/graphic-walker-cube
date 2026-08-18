declare module '@kanaries/graphic-walker' {
    import type { ReactNode } from 'react';

    export type IRow = Record<string, unknown>;

    export interface IMutField {
        fid: string;
        name?: string;
        basename?: string;
        semanticType?: string;
        analyticType?: string;
        offset?: number;
        [key: string]: unknown;
    }

    export type IDataSourceListener = (event: number, datasetId: string) => void;

    export interface IDataQueryPayload {
        workflow: unknown[];
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

    export const GraphicWalker: (props: Record<string, unknown>) => ReactNode;
    export const DataSourceSegmentComponent: (props: {
        provider: IDataSourceProvider;
        hideCreateDataset?: boolean;
        hideDatasetToolbar?: boolean;
        appearance?: 'light' | 'dark';
        children: (slot: {
            meta: IMutField[];
            onMetaChange: (fid: string, meta: Partial<IMutField>) => void;
            computation: (payload: unknown) => Promise<IRow[]>;
            storeRef: unknown;
            datasetName: string;
            datasetId: string;
            syncSpecs: () => void;
        }) => ReactNode;
    }) => ReactNode;
}

declare module '@kanaries/duckdb-computation' {
    import type { IDataSourceProvider } from '@kanaries/graphic-walker';
    export function getMemoryProvider(): Promise<IDataSourceProvider>;
}
