import { buildNestTree, createPivotPathKey } from './utils';
import { collectPivotLeafChains, windowedHeaderCells } from './headerWindow';

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
});
