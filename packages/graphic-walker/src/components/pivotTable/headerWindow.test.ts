import { buildNestTree, createPivotPathKey } from './utils';
import { collectPivotLeafChains, indexPivotLeafAncestors, windowedHeaderCells } from './headerWindow';

describe('pivot header windowing', () => {
    const rows = [
        { region: 'East', city: 'Boston', sales_sum: 9 },
        { region: 'East', city: 'NYC', sales_sum: 11 },
        { region: 'West', city: 'Seattle', sales_sum: 18 },
        { region: 'West', city: 'SF', sales_sum: 12 },
    ];

    test('builds leaf chains that include each ancestor for nested headers', () => {
        const tree = buildNestTree(['region', 'city'], rows, [], false);
        const leaves = collectPivotLeafChains(tree);
        expect(leaves.map((leaf) => leaf.chain.map((node) => node.value))).toEqual([
            ['East', 'Boston'],
            ['East', 'NYC'],
            ['West', 'Seattle'],
            ['West', 'SF'],
        ]);
    });

    test('treats a collapsed parent as a single visible leaf like Excel outline collapse', () => {
        const tree = buildNestTree(['region', 'city'], rows, [], false);
        const collapsed = new Set([createPivotPathKey([{ key: 'region', value: 'East' }])]);
        const leaves = collectPivotLeafChains(tree, collapsed);
        expect(leaves.map((leaf) => leaf.node.value)).toEqual(['East', 'Seattle', 'SF']);
        expect(leaves[0].chain.map((node) => node.value)).toEqual(['East']);
    });

    test('indexes ancestor ranges once so windowing is O(window) not O(leaves)', () => {
        const tree = buildNestTree(['region', 'city'], rows, [], false);
        const leaves = collectPivotLeafChains(tree);
        const index = indexPivotLeafAncestors(leaves);
        expect(index.first.get(leaves[0].chain[0])).toBe(0);
        expect(index.last.get(leaves[0].chain[0])).toBe(1);
        expect(windowedHeaderCells(leaves, 1, 3, index)).toEqual(windowedHeaderCells(leaves, 1, 3));
    });

    test('treats summary totals as visible leaves without dropping value rows', () => {
        const tree = buildNestTree(['region', 'city'], rows, [], 'all');
        const leaves = collectPivotLeafChains(tree);
        expect(leaves.some((leaf) => leaf.node.kind === 'summary')).toBe(true);
        expect(leaves.filter((leaf) => leaf.node.kind === 'value')).toHaveLength(4);
        const last = leaves[leaves.length - 1];
        expect(last.node.kind).toBe('summary');
        expect(last.node.path).toEqual([]);
    });

    test('clips parent rowspan to the visible window', () => {
        const tree = buildNestTree(['region', 'city'], rows, [], false);
        const leaves = collectPivotLeafChains(tree);
        const window = windowedHeaderCells(leaves, 1, 3);
        expect(window).toHaveLength(2);
        expect(window[0].map((cell) => [cell.node.value, cell.span])).toEqual([
            ['East', 1],
            ['NYC', 1],
        ]);
        expect(window[1].map((cell) => [cell.node.value, cell.span])).toEqual([
            ['West', 1],
            ['Seattle', 1],
        ]);
    });

    test('keeps full parent span when the window covers the whole group', () => {
        const tree = buildNestTree(['region', 'city'], rows, [], false);
        const leaves = collectPivotLeafChains(tree);
        const window = windowedHeaderCells(leaves, 0, 4);
        expect(window[0].map((cell) => [cell.node.value, cell.span])).toEqual([
            ['East', 2],
            ['Boston', 1],
        ]);
        expect(window[2].map((cell) => [cell.node.value, cell.span])).toEqual([
            ['West', 2],
            ['Seattle', 1],
        ]);
    });

    test('repeats ancestor labels on every leaf instead of merging them', () => {
        const tree = buildNestTree(['region', 'city'], rows, [], false);
        const leaves = collectPivotLeafChains(tree);
        const window = windowedHeaderCells(leaves, 0, 4, undefined, { repeatLabels: true, dimCount: 2 });
        expect(window[0].map((cell) => [cell.node.value, cell.span, Boolean(cell.repeated)])).toEqual([
            ['East', 1, false],
            ['Boston', 1, false],
        ]);
        expect(window[1].map((cell) => [cell.node.value, cell.span, Boolean(cell.repeated)])).toEqual([
            ['East', 1, false],
            ['NYC', 1, false],
        ]);
    });

    test('pads a collapsed parent across remaining dim columns when repeating labels', () => {
        const tree = buildNestTree(['region', 'city'], rows, [], false);
        const collapsed = new Set([createPivotPathKey([{ key: 'region', value: 'East' }])]);
        const leaves = collectPivotLeafChains(tree, collapsed);
        const window = windowedHeaderCells(leaves, 0, 1, undefined, { repeatLabels: true, dimCount: 2 });
        expect(window[0]).toHaveLength(2);
        expect(window[0][0].node.value).toBe('East');
        expect(window[0][1].repeated).toBe(true);
    });
});
