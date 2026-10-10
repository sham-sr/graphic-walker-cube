import fs from 'fs';
import path from 'path';
import type { IRow, IViewField } from '../../interfaces';
import { buildPivotTable } from '../../workers/buildPivotTable';
import { getAllPivotGroupingSets, getCubeCell, rollupCuboid, toRollupMeasures } from './cube';
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

function synthesizeTicketRows(): IRow[] {
    const regions = ['Иркутская область', 'Самарская область', 'Москва'];
    const pays = ['Наличные', 'Карта', 'Абонемент'];
    const categories = ['Пригород', 'Дальние', 'Льготный'];
    const rows: IRow[] = [];
    for (let i = 0; i < 3000; i += 1) {
        rows.push({
            [F.date]: '2024-01-01',
            [F.region]: regions[i % regions.length],
            [F.pay]: pays[i % pays.length],
            [F.category]: categories[Math.floor(i / 7) % categories.length],
            [F.cash]: (i % 50) + 0.25,
        });
    }
    return rows;
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
        const raw = fs.existsSync(DATA_PATH)
            ? (JSON.parse(fs.readFileSync(DATA_PATH, 'utf8')) as IRow[])
            : synthesizeTicketRows();
        source = raw.map((row) => ({
            ...row,
            [F.cash]: Number(row[F.cash]),
        }));
        leafRows = toLeafCuboid(source, [F.region, F.pay, F.category]);
    });

    test('loads the ticket extract', () => {
        expect(source.length).toBe(fs.existsSync(DATA_PATH) ? 33093 : 3000);
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

    test('every grouping set sum equals an independent group-by of the source', () => {
        const region = dimension(F.region);
        const pay = dimension(F.pay);
        const category = dimension(F.category);
        const sets = getAllPivotGroupingSets([region, pay], [category]);
        const cashKey = `${F.cash}_sum`;
        const rolled = rollupCuboid(leafRows, sets, toRollupMeasures([cashMeasure], true));
        const dimNames = [F.region, F.pay, F.category];
        for (const groupBy of sets) {
            const fromCube = new Map<string, number>();
            for (const row of rolled) {
                const sameGrain = dimNames.every((name) => (groupBy.includes(name) ? name in row : !(name in row)));
                if (!sameGrain) continue;
                fromCube.set(groupBy.map((key) => String(row[key])).join('\0'), Number(row[cashKey]));
            }
            const fromSource = groupSum(source, groupBy);
            expect(fromCube.size).toBe(fromSource.size);
            for (const [key, expected] of fromSource) {
                expect(fromCube.get(key)).toBeCloseTo(expected, 5);
            }
        }
    });

    test('visible row and column subtotals equal the source group-by', () => {
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
        const cashKey = `${F.cash}_sum`;
        const cache = new Map<string, Map<string, number>>();
        const expectedFor = (keys: string[]) => {
            const cacheKey = keys.join('\0');
            const cached = cache.get(cacheKey);
            if (cached) return cached;
            const grouped = groupSum(source, keys);
            cache.set(cacheKey, grouped);
            return grouped;
        };
        const left = collectVisibleLeaves(model.lt);
        const top = collectVisibleLeaves(model.tt);
        let checked = 0;
        for (const rowNode of left) {
            for (const colNode of top) {
                if (rowNode.kind !== 'summary' && colNode.kind !== 'summary') continue;
                const path = [...leafValuePath(rowNode), ...leafValuePath(colNode)];
                const keys = path.map((item) => item.key);
                const actual = Number(getCubeCell(model.cube, leafValuePath(rowNode), leafValuePath(colNode))?.[cashKey]);
                const expected = expectedFor(keys).get(path.map((item) => String(item.value)).join('\0'));
                expect(actual).toBeCloseTo(expected ?? Number.NaN, 5);
                checked += 1;
            }
        }
        expect(checked).toBeGreaterThan(0);
    });
});
