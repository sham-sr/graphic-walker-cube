import type { IDataSourceProvider } from '../interfaces';

interface SpecStoreLike {
    importRaw(specs: unknown): void;
    exportAllCharts(): unknown;
}

interface SpecStoreRefLike {
    current: Pick<SpecStoreLike, 'importRaw'> | null;
}

/**
 * Persist charts belonging to `datasetId`.
 * Callers must pass that dataset's store — never a store already swapped to another dataset.
 */
export function persistDatasetSpecs(
    provider: Pick<IDataSourceProvider, 'saveSpecs'>,
    datasetId: string,
    store: Pick<SpecStoreLike, 'exportAllCharts'> | null | undefined
): void {
    if (!datasetId || !store) return;
    const charts = store.exportAllCharts();
    if (charts === undefined || charts === null) return;
    void provider.saveSpecs(datasetId, JSON.stringify(charts));
}

export async function syncProviderSpecs(
    provider: Pick<IDataSourceProvider, 'getSpecs'>,
    datasetId: string,
    storeRef: SpecStoreRefLike,
    isCurrent: () => boolean = () => true
): Promise<void> {
    const specs = await provider.getSpecs(datasetId);
    if (!isCurrent()) return;
    storeRef.current?.importRaw(JSON.parse(specs));
}
