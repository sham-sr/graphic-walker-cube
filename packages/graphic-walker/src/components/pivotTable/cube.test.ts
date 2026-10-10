import type { IRow } from '../../interfaces';
import { getAllPivotGroupingSets, getCubeCell, rollupCuboid, toRollupMeasures } from './cube';
import { buildPivotTable } from '../../workers/buildPivotTable';
import { collectVisibleLeaves, createPivotPathKey, leafValuePath, materializeMetricMatrix } from './utils';
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

describe('pivot cube grouping grains', () => {
    const region = dimension('region');
    const city = dimension('city');
    const year = dimension('year');
    const sales = measure('sales');
    const qty = measure('qty', 'count');
    const lo = measure('lo', 'min');
    const hi = measure('hi', 'max');
    const avg = measure('avg', 'mean');
    const mid = measure('mid', 'median');
    const spread = measure('spr', 'variance');
    const deviation = measure('sd', 'stdev');
    const kinds = measure('kind', 'distinctCount');
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
    const catalog = [region, city, year, sales, qty, lo, hi, avg, mid, spread, deviation, kinds, prev, yoy];
    const leaves: IRow[] = [
        {
            region: 'East',
            city: 'Boston',
            year: '2024',
            sales_sum: 10,
            qty_count: 2,
            lo_min: 1,
            hi_max: 8,
            avg_mean: 4,
            mid_median: 3,
            spr_variance: 1,
            sd_stdev: 1,
            kind_distinctCount: 2,
            prev_sum: 8,
        },
        {
            region: 'East',
            city: 'Boston',
            year: '2023',
            sales_sum: 6,
            qty_count: 1,
            lo_min: 6,
            hi_max: 6,
            avg_mean: 6,
            mid_median: 6,
            spr_variance: 0,
            sd_stdev: 0,
            kind_distinctCount: 1,
            prev_sum: 4,
        },
        {
            region: 'East',
            city: '',
            year: '2024',
            sales_sum: 4,
            qty_count: 4,
            lo_min: 0,
            hi_max: 2,
            avg_mean: 1,
            mid_median: 1,
            spr_variance: 0.5,
            sd_stdev: 0.5,
            kind_distinctCount: 1,
            prev_sum: 4,
        },
        {
            region: 'West',
            city: 'Seattle',
            year: '2024',
            sales_sum: 20,
            qty_count: 5,
            lo_min: 2,
            hi_max: 9,
            avg_mean: 4,
            mid_median: 4,
            spr_variance: 4,
            sd_stdev: 2,
            kind_distinctCount: 3,
            prev_sum: 10,
        },
    ];
    const measures = [
        ...toRollupMeasures([sales, qty, lo, hi, avg, mid, spread, deviation, kinds, prev, yoy], true, catalog),
        { field: 'sales_sum', agg: 'count' as const, asFieldKey: 'row_count' },
    ];

    function rolledRow(dims: Partial<Record<'region' | 'city' | 'year', string>>): IRow {
        const sets = getAllPivotGroupingSets([region, city], [year]);
        const rolled = rollupCuboid(leaves, sets, measures);
        const names = ['region', 'city', 'year'] as const;
        const found = rolled.find((row) =>
            names.every((name) => (name in dims ? row[name] === dims[name] : !(name in row)))
        );
        expect(found).toBeDefined();
        return found!;
    }

    test('leaf cell stays the original row', () => {
        const model = buildPivotTable([region, city], [year], leaves, [], [], true, undefined, measures);
        const cell = getCubeCell(
            model.cube,
            [
                { key: 'region', value: 'East' },
                { key: 'city', value: 'Boston' },
                { key: 'year', value: '2024' },
            ],
            []
        );
        expect(cell?.sales_sum).toBe(10);
        expect(cell?.qty_count).toBe(2);
        expect(cell?.yoy).toBeUndefined();
    });

    test('region subtotal, column total and grand total match the leaf formulas', () => {
        const east = rolledRow({ region: 'East' });
        expect(east.sales_sum).toBe(20);
        expect(east.qty_count).toBe(7);
        expect(east.row_count).toBe(3);
        expect(east.lo_min).toBe(0);
        expect(east.hi_max).toBe(8);
        expect(east.avg_mean).toBeCloseTo(11 / 3, 12);
        expect(east.mid_median).toBe(3);
        expect(east.spr_variance).toBeCloseTo(1 / 6, 12);
        expect(east.sd_stdev).toBeCloseTo(Math.sqrt(1 / 6), 12);
        expect(east.kind_distinctCount).toBe(2);
        expect(east.prev_sum).toBe(16);
        expect(east.yoy).toBe(0.25);

        const year2024 = rolledRow({ year: '2024' });
        expect(year2024.sales_sum).toBe(34);
        expect(year2024.qty_count).toBe(11);
        expect(year2024.row_count).toBe(3);
        expect(year2024.lo_min).toBe(0);
        expect(year2024.hi_max).toBe(9);
        expect(year2024.avg_mean).toBe(3);
        expect(year2024.mid_median).toBe(3);
        expect(year2024.spr_variance).toBeCloseTo(43 / 18, 12);
        expect(year2024.sd_stdev).toBeCloseTo(Math.sqrt(7 / 18), 12);
        expect(year2024.kind_distinctCount).toBe(3);
        expect(year2024.prev_sum).toBe(22);
        expect(year2024.yoy).toBeCloseTo(6 / 11, 12);

        const grand = rolledRow({});
        expect(grand.sales_sum).toBe(40);
        expect(grand.qty_count).toBe(12);
        expect(grand.row_count).toBe(4);
        expect(grand.lo_min).toBe(0);
        expect(grand.hi_max).toBe(9);
        expect(grand.avg_mean).toBe(3.75);
        expect(grand.mid_median).toBe(3.5);
        expect(grand.spr_variance).toBe(2.421875);
        expect(grand.sd_stdev).toBeCloseTo(Math.sqrt(0.546875), 12);
        expect(grand.kind_distinctCount).toBe(3);
        expect(grand.prev_sum).toBe(26);
        expect(grand.yoy).toBeCloseTo(7 / 13, 12);
    });

    test('empty city is its own group and keeps the first seen dimension value', () => {
        const blank = rolledRow({ region: 'East', city: '' });
        expect(blank.sales_sum).toBe(4);
        expect(blank.row_count).toBe(1);
        expect(blank.mid_median).toBe(1);
        expect(blank.spr_variance).toBe(0);
        expect(blank.yoy).toBe(0);

        const collided = rollupCuboid(
            [
                { city: null, sales_sum: 1 },
                { city: '', sales_sum: 2 },
            ],
            [['city']],
            [{ field: 'sales_sum', agg: 'sum', asFieldKey: 'sales_sum' }]
        );
        expect(collided).toHaveLength(1);
        expect(collided[0].sales_sum).toBe(3);
        expect(collided[0].city).toBeNull();
    });

    test('min ignores NaN and stays Infinity when every value is NaN', () => {
        const measuresMin = [{ field: 'v_min', agg: 'min' as const, asFieldKey: 'v_min' }];
        expect(rollupCuboid([{ g: 'a', v_min: 3 }, { g: 'a', v_min: 'nope' }], [['g']], measuresMin)[0].v_min).toBe(3);
        expect(rollupCuboid([{ g: 'a', v_min: 'x' }], [['g']], measuresMin)[0].v_min).toBe(Infinity);
    });

    test('visible row and column totals equal the same grains', () => {
        const model = buildPivotTable([region, city], [year], leaves, [], [], true, undefined, measures);
        const left = collectVisibleLeaves(model.lt);
        const top = collectVisibleLeaves(model.tt);
        const east = left.find((node) => node.kind === 'summary' && node.path.length === 1 && node.path[0]?.value === 'East');
        const grandRow = left.find((node) => node.kind === 'summary' && node.path.length === 0);
        const yearCol = top.find((node) => node.kind === 'value' && node.value === '2024');
        const grandCol = top.find((node) => node.kind === 'summary' && node.path.length === 0);
        expect(east && grandRow && yearCol && grandCol).toBeTruthy();
        const read = (rowNode: NonNullable<typeof east>, colNode: NonNullable<typeof yearCol>) =>
            getCubeCell(model.cube, leafValuePath(rowNode), leafValuePath(colNode))?.sales_sum;
        expect(read(east!, grandCol!)).toBe(20);
        expect(read(grandRow!, yearCol!)).toBe(34);
        expect(read(grandRow!, grandCol!)).toBe(40);
        expect(read(east!, yearCol!)).toBe(14);
        expect(materializeMetricMatrix(model.lt, model.tt, model.cube).length).toBe(left.length);
    });
});
