import fs from 'fs';
import path from 'path';
import type { IRow, IViewField } from '../../interfaces';
import { buildPivotTable } from '../../workers/buildPivotTable';
import { getCubeCell, rollupCuboid, toRollupMeasures } from './cube';
import { collectVisibleLeaves, createPivotPathKey, leafValuePath } from './utils';

const DATA_PATH = path.join(__dirname, '../../../../../table_data_2026-08-12_10-24-26.json');

const F = {
    date: 'micro_complex_tickets_with_trips.sell_date.day',
    pay: 'micro_complex_tickets_with_trips.pay_kind',
    region: 'micro_complex_tickets_with_trips.region_name',
    category: 'micro_complex_tickets_with_trips.transfer_category',
    cash: 'micro_complex_tickets_with_trips.cash',
} as const;

const dimension = (fid: string): IViewField => ({
    fid,
    name: fid,
    analyticType: 'dimension',
    semanticType: 'nominal',
});

const cashMeasure: IViewField = {
    fid: F.cash,
    name: 'cash',
    analyticType: 'measure',
    semanticType: 'quantitative',
    aggName: 'sum',
};

function groupSum(rows: IRow[], keys: string[]): Map<string, number> {
    const totals = new Map<string, number>();
    for (const row of rows) {
        const key = keys.map((item) => String(row[item])).join('\0');
        totals.set(key, (totals.get(key) ?? 0) + Number(row[F.cash]));
    }
    return totals;
}

function toLeafCuboid(rows: IRow[], keys: string[]): IRow[] {
    const leaves = new Map<string, IRow>();
    for (const row of rows) {
        const key = keys.map((item) => String(row[item])).join('\0');
        const current = leaves.get(key);
        if (!current) {
            leaves.set(key, {
                ...Object.fromEntries(keys.map((item) => [item, row[item]])),
                [`${F.cash}_sum`]: Number(row[F.cash]),
            });
        } else {
            current[`${F.cash}_sum`] = Number(current[`${F.cash}_sum`]) + Number(row[F.cash]);
        }
    }
    return [...leaves.values()];
}

describe('pivot cube vs source groupings on table_data_2026-08-12', () => {
    let source: IRow[];
    let leafRows: IRow[];

    beforeAll(() => {
        const raw = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8')) as IRow[];
        source = raw.map((row) => ({
            ...row,
            [F.cash]: Number(row[F.cash]),
        }));
        leafRows = toLeafCuboid(source, [F.region, F.pay, F.category]);
    });

    test('loads the ticket extract', () => {
        expect(source.length).toBe(33093);
        expect(leafRows.length).toBeGreaterThan(0);
        expect(leafRows.length).toBeLessThanOrEqual(source.length);
    });

    test('region and grand totals from the cube equal source group-by', () => {
        const region = dimension(F.region);
        const pay = dimension(F.pay);
        const category = dimension(F.category);
        const model = buildPivotTable(
            [region, pay],
            [category],
            leafRows,
            [],
            [],
            true,
            undefined,
            toRollupMeasures([cashMeasure], true)
        );
        const sourceByRegion = groupSum(source, [F.region]);
        const sourceGrand = groupSum(source, []).get('') ?? 0;
        for (const [regionName, expected] of sourceByRegion) {
            const cell = getCubeCell(model.cube, [{ key: F.region, value: regionName }], []);
            expect(cell?.[`${F.cash}_sum`]).toBeCloseTo(expected, 5);
        }
        expect(getCubeCell(model.cube, [], [])?.[`${F.cash}_sum`]).toBeCloseTo(sourceGrand, 5);
    });

    test('pay-kind rollup of leaf cells equals a direct group-by on source', () => {
        const rolled = rollupCuboid(leafRows, [[F.region, F.pay]], toRollupMeasures([cashMeasure], true));
        const fromLeaves = new Map<string, number>();
        for (const row of rolled) {
            fromLeaves.set(`${row[F.region]}\0${row[F.pay]}`, Number(row[`${F.cash}_sum`]));
        }
        const fromSource = groupSum(source, [F.region, F.pay]);
        expect(fromLeaves.size).toBe(fromSource.size);
        for (const [key, expected] of fromSource) {
            expect(fromLeaves.get(key)).toBeCloseTo(expected, 5);
        }
    });

    test('collapse does not change the region subtotal', () => {
        const region = dimension(F.region);
        const pay = dimension(F.pay);
        const regionPayLeaves = toLeafCuboid(source, [F.region, F.pay]);
        const expanded = buildPivotTable(
            [region, pay],
            [],
            regionPayLeaves,
            [],
            [],
            false,
            undefined,
            toRollupMeasures([cashMeasure], true)
        );
        const irkutsk = expanded.lt.children.find((node) => node.value === 'Иркутская область');
        expect(irkutsk).toBeDefined();
        const collapsed = buildPivotTable(
            [region, pay],
            [],
            regionPayLeaves,
            [],
            [createPivotPathKey(irkutsk!.path)],
            false,
            undefined,
            toRollupMeasures([cashMeasure], true)
        );
        const expandedLeaves = collectVisibleLeaves(expanded.lt).filter(
            (node) => node.path[0]?.value === 'Иркутская область' && node.path.length === 2
        );
        const expandedSum = expandedLeaves.reduce((sum, node) => {
            const cell = getCubeCell(expanded.cube, leafValuePath(node), []);
            return sum + Number(cell?.[`${F.cash}_sum`] ?? 0);
        }, 0);
        const collapsedLeaf = collectVisibleLeaves(collapsed.lt).find((node) => node.value === 'Иркутская область');
        const collapsedSum = Number(getCubeCell(collapsed.cube, leafValuePath(collapsedLeaf!), [])?.[`${F.cash}_sum`] ?? 0);
        expect(collapsedSum).toBeCloseTo(expandedSum, 5);
        expect(collapsedSum).toBeCloseTo(groupSum(source, [F.region]).get('Иркутская область') ?? 0, 5);
    });
});
