import type { IDataQueryPayload, IRow } from '@kanaries/graphic-walker';
import { createQueryCache } from './queryCache';

const payload = (mark: string): IDataQueryPayload => ({
    workflow: [{ type: 'view', query: [{ op: 'raw', fields: [mark] }] }],
});

describe('createQueryCache', () => {
    test('serves a repeated payload without calling the fetcher again', async () => {
        const cache = createQueryCache();
        const fetcher = jest.fn(async (): Promise<IRow[]> => [{ region: 'A' }]);
        const query = payload('region');

        await expect(cache.load('ds', query, fetcher)).resolves.toEqual([{ region: 'A' }]);
        await expect(cache.load('ds', { ...query, workflow: query.workflow }, fetcher)).resolves.toEqual([{ region: 'A' }]);

        expect(fetcher).toHaveBeenCalledTimes(1);
    });

    test('shares one promise between concurrent identical loads', async () => {
        const cache = createQueryCache();
        let finish: (rows: IRow[]) => void = () => undefined;
        const fetcher = jest.fn(
            () =>
                new Promise<IRow[]>((resolve) => {
                    finish = resolve;
                })
        );
        const query = payload('region');
        const first = cache.load('ds', query, fetcher);
        const second = cache.load('ds', query, fetcher);
        expect(fetcher).toHaveBeenCalledTimes(1);
        finish([{ region: 'A' }]);
        await expect(first).resolves.toEqual([{ region: 'A' }]);
        await expect(second).resolves.toBe(await first);
    });

    test('drops a rejected entry so the next load calls the fetcher', async () => {
        const cache = createQueryCache();
        const fetcher = jest
            .fn<Promise<IRow[]>, []>()
            .mockRejectedValueOnce(new Error('boom'))
            .mockResolvedValueOnce([{ ok: 1 }]);
        const query = payload('region');

        await expect(cache.load('ds', query, fetcher)).rejects.toThrow('boom');
        await expect(cache.load('ds', query, fetcher)).resolves.toEqual([{ ok: 1 }]);
        expect(fetcher).toHaveBeenCalledTimes(2);
    });

    test('invalidates one dataset and leaves the other cached', async () => {
        const cache = createQueryCache();
        const fetcher = jest.fn(async (row: IRow): Promise<IRow[]> => [row]);
        const query = payload('region');

        await cache.load('left', query, () => fetcher({ side: 'left' }));
        await cache.load('right', query, () => fetcher({ side: 'right' }));
        cache.invalidate('left');

        await cache.load('left', query, () => fetcher({ side: 'left-again' }));
        await cache.load('right', query, () => fetcher({ side: 'right-again' }));

        expect(fetcher).toHaveBeenCalledTimes(3);
        expect(fetcher).toHaveBeenLastCalledWith({ side: 'left-again' });
    });

    test('evicts the least recently used entry past the limit', async () => {
        const cache = createQueryCache(2);
        const fetcher = jest.fn(async (mark: string): Promise<IRow[]> => [{ mark }]);

        await cache.load('ds', payload('a'), () => fetcher('a'));
        await cache.load('ds', payload('b'), () => fetcher('b'));
        await cache.load('ds', payload('a'), () => fetcher('a-hit'));
        await cache.load('ds', payload('c'), () => fetcher('c'));
        await cache.load('ds', payload('b'), () => fetcher('b-again'));
        await cache.load('ds', payload('a'), () => fetcher('a-still'));

        expect(fetcher.mock.calls.map((call) => call[0])).toEqual(['a', 'b', 'c', 'b-again', 'a-still']);
    });
});
