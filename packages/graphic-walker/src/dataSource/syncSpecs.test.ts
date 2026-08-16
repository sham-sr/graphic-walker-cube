import { persistDatasetSpecs, syncProviderSpecs } from './syncSpecs';

describe('persistDatasetSpecs', () => {
    test('saves the given dataset store and skips a missing store', () => {
        const saveSpecs = jest.fn().mockResolvedValue(undefined);
        persistDatasetSpecs({ saveSpecs }, 'dataset-a', { exportAllCharts: () => ['chart-a'] });
        persistDatasetSpecs({ saveSpecs }, 'dataset-a', null);

        expect(saveSpecs).toHaveBeenCalledTimes(1);
        expect(saveSpecs).toHaveBeenCalledWith('dataset-a', JSON.stringify(['chart-a']));
    });
});

describe('syncProviderSpecs', () => {
    test('loads and imports the latest serialized specs', async () => {
        const getSpecs = jest.fn().mockResolvedValue('[{"visId":"chart-1"}]');
        const importRaw = jest.fn();

        await syncProviderSpecs({ getSpecs }, 'dataset-1', { current: { importRaw } });

        expect(getSpecs).toHaveBeenCalledWith('dataset-1');
        expect(importRaw).toHaveBeenCalledWith([{ visId: 'chart-1' }]);
    });

    test('reads the store ref after the asynchronous provider call resolves', async () => {
        let resolveSpecs!: (value: string) => void;
        const getSpecs = jest.fn(() => new Promise<string>((resolve) => (resolveSpecs = resolve)));
        const importRaw = jest.fn();
        const storeRef: { current: { importRaw: typeof importRaw } | null } = { current: null };

        const syncing = syncProviderSpecs({ getSpecs }, 'dataset-1', storeRef);
        storeRef.current = { importRaw };
        resolveSpecs('[]');
        await syncing;

        expect(importRaw).toHaveBeenCalledWith([]);
    });

    test('does not import into a store that no longer belongs to the dataset', async () => {
        let resolveSpecs!: (value: string) => void;
        const getSpecs = jest.fn(() => new Promise<string>((resolve) => (resolveSpecs = resolve)));
        const importRaw = jest.fn();
        let current = true;

        const syncing = syncProviderSpecs({ getSpecs }, 'dataset-a', { current: { importRaw } }, () => current);
        current = false;
        resolveSpecs('[{"visId":"stale"}]');
        await syncing;

        expect(importRaw).not.toHaveBeenCalled();
    });
});
