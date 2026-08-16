import type { IRow } from '../../interfaces';
import { getAllPivotGroupingSets, rollupCuboid, toRollupMeasures } from './cube';
import { buildPivotTable } from '../../workers/buildPivotTable';
import { createPivotPathKey, materializeMetricMatrix } from './utils';
import type { IViewField } from '../../interfaces';

const dimension = (fid: string): IViewField => ({
    fid,
    name: fid,
    analyticType: 'dimension',
    semanticType: 'nominal',
});

const measure = (fid: string, aggName = 'sum'): IViewField => ({
    fid,
    name: fid,
    analyticType: 'measure',
    semanticType: 'quantitative',
    aggName,
});

function groupSum(rows: IRow[], keys: string[], valueKey: string): Map<string, number> {
    const totals = new Map<string, number>();
    for (const row of rows) {
        const key = keys.map((item) => String(row[item])).join('\0');
        totals.set(key, (totals.get(key) ?? 0) + Number(row[valueKey]));
    }
    return totals;
}

describe('pivot cube rollup', () => {
    const region = dimension('region');
    const city = dimension('city');
    const year = dimension('year');
    const sales = measure('sales');
    const leaves: IRow[] = [
        { region: 'East', city: 'Boston', year: '2024', sales_sum: 9 },
        { region: 'West', city: 'Seattle', year: '2024', sales_sum: 18 },
        { region: 'West', city: 'San Francisco', year: '2024', sales_sum: 12 },
    ];

    test('region totals equal the sum of city leaves', () => {
        const rolled = rollupCuboid(leaves, [['region']], toRollupMeasures([sales], true));
        const byRegion = groupSum(rolled, ['region'], 'sales_sum');
        const fromLeaves = groupSum(leaves, ['region'], 'sales_sum');
        expect(Object.fromEntries(byRegion)).toEqual(Object.fromEntries(fromLeaves));
        expect(byRegion.get('East')).toBe(9);
        expect(byRegion.get('West')).toBe(30);
    });

    test('grand total equals the sum of every grouping grain', () => {
        const sets = getAllPivotGroupingSets([region, city], [year]);
        const rolled = rollupCuboid(leaves, sets, toRollupMeasures([sales], true));
        const grand = rolled.find((row) => !('region' in row) && !('city' in row) && !('year' in row));
        expect(grand?.sales_sum).toBe(39);
        expect(groupSum(leaves, [], 'sales_sum').get('')).toBe(39);
    });

    test('collapsed subtotal matches the pre-collapse leaf sum', () => {
        const expanded = buildPivotTable([region, city], [year], leaves, [], [], false);
        const collapsed = buildPivotTable(
            [region, city],
            [year],
            leaves,
            [],
            [createPivotPathKey([{ key: 'region', value: 'West' }])],
            false
        );
        const expandedMetric = materializeMetricMatrix(expanded.lt, expanded.tt, expanded.cube);
        const westLeaves = expandedMetric.slice(1).reduce((sum, row) => sum + Number(row[0]?.sales_sum ?? 0), 0);
        const collapsedMetric = materializeMetricMatrix(collapsed.lt, collapsed.tt, collapsed.cube);
        expect(westLeaves).toBe(30);
        expect(collapsedMetric[1][0]?.sales_sum).toBe(30);
    });
});
