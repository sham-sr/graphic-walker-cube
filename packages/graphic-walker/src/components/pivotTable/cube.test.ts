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

describe('pivot cube expr rollup', () => {
    const region = dimension('region');
    const sales = measure('sales');
    const prev = measure('prev');
    const yoySql = '(sum("sales") - sum("prev")) / nullif(sum("prev"), 0)';
    const yoy: IViewField = {
        fid: 'yoy',
        name: 'yoy',
        analyticType: 'measure',
        semanticType: 'quantitative',
        aggName: 'expr',
        computed: true,
        expression: { op: 'expr', as: 'yoy', params: [{ type: 'sql', value: yoySql }] },
    };
    const catalog = [region, sales, prev, yoy];
    const leaves: IRow[] = [
        { region: 'East', sales_sum: 210, prev_sum: 100, yoy: 1.1 },
        { region: 'West', sales_sum: 200, prev_sum: 100, yoy: 1.0 },
    ];

    test('plans component sums beside the expr measure', () => {
        const planned = toRollupMeasures([yoy], true, catalog);
        expect(planned).toEqual(
            expect.arrayContaining([
                { field: 'sales_sum', agg: 'sum', asFieldKey: 'sales_sum' },
                { field: 'prev_sum', agg: 'sum', asFieldKey: 'prev_sum' },
                expect.objectContaining({ field: 'yoy', agg: 'expr', asFieldKey: 'yoy' }),
            ])
        );
    });

    test('grand total recomputes YoY from rolled sums instead of summing ratios', () => {
        const rolled = rollupCuboid(leaves, [[]], toRollupMeasures([yoy], true, catalog));
        expect(rolled).toHaveLength(1);
        expect(rolled[0].yoy).toBeCloseTo(1.05);
        expect(rolled[0].yoy).not.toBeCloseTo(2.1);
        expect(rolled[0].sales_sum).toBe(410);
        expect(rolled[0].prev_sum).toBe(200);
    });

    test('parent count is the sum of leaf counts, not a count of groups', () => {
        const rateSql = 'sum("sales") / count("id")';
        const rate: IViewField = {
            fid: 'rate',
            name: 'rate',
            analyticType: 'measure',
            semanticType: 'quantitative',
            aggName: 'expr',
            computed: true,
            expression: { op: 'expr', as: 'rate', params: [{ type: 'sql', value: rateSql }] },
        };
        const rateLeaves: IRow[] = [
            { region: 'East', sales_sum: 10, id_count: 2, rate: 5 },
            { region: 'West', sales_sum: 30, id_count: 3, rate: 10 },
        ];
        const rolled = rollupCuboid(rateLeaves, [[]], toRollupMeasures([rate], true, [sales, measure('id', 'count'), rate]));
        expect(rolled[0].rate).toBeCloseTo(8);
        expect(rolled[0].id_count).toBe(5);
    });

    test('omits non-additive expr totals instead of averaging ratios', () => {
        const share: IViewField = {
            fid: 'share',
            name: 'share',
            analyticType: 'measure',
            semanticType: 'quantitative',
            aggName: 'expr',
            computed: true,
            expression: { op: 'expr', as: 'share', params: [{ type: 'sql', value: 'avg("sales") / avg("prev")' }] },
        };
        const planned = toRollupMeasures([share, sales], true, catalog);
        expect(planned.some((item) => item.asFieldKey === 'share')).toBe(false);
        const rolled = rollupCuboid(leaves, [[]], planned);
        expect(rolled[0].share).toBeUndefined();
        expect(rolled[0].sales_sum).toBe(410);
    });
});
