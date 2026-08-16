import type { IAggregator, IRow, IViewField } from '../../interfaces';
import type { INestNode, IPivotCube, IPivotTablePath, PivotTableValue } from './interface';
import { createCubeCellKey } from './pathKey';
import { collectVisibleLeaves } from './treeWalk';

function meaAggKey(fid: string, agg?: string): string {
    if (!agg || agg === 'expr') return fid;
    return `${fid}_${agg}`;
}

export interface IPivotRollupMeasure {
    field: string;
    agg: IAggregator;
    asFieldKey: string;
}

/** Cuboid rollup: count of groups becomes a sum of already-counted leaves. */
export function cuboidRollupAggregator(agg: IAggregator | undefined): IAggregator {
    if (agg === 'count') return 'sum';
    return agg ?? 'sum';
}

export function toRollupMeasures(measures: readonly IViewField[], defaultAggregated: boolean): IPivotRollupMeasure[] {
    return measures.map((measure) => {
        const asFieldKey = defaultAggregated ? meaAggKey(measure.fid, measure.aggName) : measure.fid;
        return {
            field: asFieldKey,
            agg: defaultAggregated ? cuboidRollupAggregator(measure.aggName as IAggregator | undefined) : (measure.aggName as IAggregator) ?? 'sum',
            asFieldKey,
        };
    });
}

export function inferRollupMeasures(rows: readonly IRow[], dimensionIds: readonly string[]): IPivotRollupMeasure[] {
    const dimSet = new Set(dimensionIds);
    const seen = new Set<string>();
    const measures: IPivotRollupMeasure[] = [];
    for (const row of rows) {
        for (const key of Object.keys(row)) {
            if (dimSet.has(key) || seen.has(key)) continue;
            seen.add(key);
            measures.push({ field: key, agg: 'sum', asFieldKey: key });
        }
    }
    return measures;
}

export function getAllPivotGroupingSets(dimsInRow: readonly IViewField[], dimsInColumn: readonly IViewField[]): string[][] {
    const rowPrefixes = dimsInRow.map((_, index) => dimsInRow.slice(0, index).map((field) => field.fid));
    const columnPrefixes = dimsInColumn.map((_, index) => dimsInColumn.slice(0, index).map((field) => field.fid));
    rowPrefixes.push(dimsInRow.map((field) => field.fid));
    columnPrefixes.push(dimsInColumn.map((field) => field.fid));
    const combinations = columnPrefixes.flatMap((columnFields) => rowPrefixes.map((rowFields) => [...columnFields, ...rowFields]));
    return combinations.slice(0, -1);
}

export function indexRowsIntoCube(data: readonly IRow[], dimensionKeys: readonly string[]): IPivotCube {
    const cells: Record<string, IRow> = Object.create(null) as Record<string, IRow>;
    for (const row of data) {
        const path: IPivotTablePath = dimensionKeys
            .filter((key) => Object.prototype.hasOwnProperty.call(row, key))
            .map((key) => ({ key, value: row[key] as PivotTableValue }));
        const key = createCubeCellKey(path);
        const existing = cells[key];
        if (!existing || Object.keys(row).length <= Object.keys(existing).length) {
            cells[key] = row;
        }
    }
    return { cells };
}

export function mergeCubes(...cubes: IPivotCube[]): IPivotCube {
    const cells: Record<string, IRow> = Object.create(null) as Record<string, IRow>;
    for (const cube of cubes) {
        Object.assign(cells, cube.cells);
    }
    return { cells };
}

function aggregateCuboid(leafRows: readonly IRow[], groupBy: readonly string[], measures: readonly IPivotRollupMeasure[]): IRow[] {
    const groups = new Map<string, IRow[]>();
    for (const row of leafRows) {
        const gk = groupBy.map((key) => row[key]).join('\0');
        const group = groups.get(gk);
        if (group) {
            group.push(row);
        } else {
            groups.set(gk, [row]);
        }
    }
    const result: IRow[] = [];
    for (const subGroup of groups.values()) {
        if (subGroup.length === 0) continue;
        const aggRow: IRow = {};
        for (const key of groupBy) {
            aggRow[key] = subGroup[0][key];
        }
        for (const measure of measures) {
            const values = subGroup.map((row) => row[measure.field]);
            aggRow[measure.asFieldKey] = reduceMeasure(values, measure.agg);
        }
        result.push(aggRow);
    }
    return result;
}

function reduceMeasure(values: unknown[], agg: IAggregator): number {
    const nums = values.map((value) => Number(value));
    switch (agg) {
        case 'count':
            return values.length;
        case 'min': {
            let min = Infinity;
            for (const value of nums) if (value < min) min = value;
            return min;
        }
        case 'max': {
            let max = -Infinity;
            for (const value of nums) if (value > max) max = value;
            return max;
        }
        case 'mean':
            return nums.reduce((sum, value) => sum + value, 0) / nums.length;
        case 'median': {
            const sorted = [...nums].sort((left, right) => left - right);
            const mid = Math.floor(sorted.length / 2);
            return sorted.length % 2 === 0 ? (sorted[mid] + sorted[mid - 1]) / 2 : sorted[mid];
        }
        case 'variance': {
            const mean = nums.reduce((sum, value) => sum + value, 0) / nums.length;
            return nums.reduce((sum, value) => sum + (value - mean) ** 2, 0) / nums.length;
        }
        case 'stdev': {
            const mean = nums.reduce((sum, value) => sum + value, 0) / nums.length;
            return Math.sqrt(nums.reduce((sum, value) => sum + (value - mean) ** 2, 0) / nums.length);
        }
        case 'distinctCount':
            return new Set(values).size;
        case 'sum':
        default:
            return nums.reduce((sum, value) => sum + value, 0);
    }
}

export function rollupCuboid(leafRows: readonly IRow[], groupingSets: readonly string[][], measures: readonly IPivotRollupMeasure[]): IRow[] {
    if (leafRows.length === 0 || measures.length === 0 || groupingSets.length === 0) {
        return [];
    }
    const rolled: IRow[] = [];
    for (const groupBy of groupingSets) {
        rolled.push(...aggregateCuboid(leafRows, groupBy, measures));
    }
    return rolled;
}

export function buildPivotCube(
    leafRows: readonly IRow[],
    extraRows: readonly IRow[],
    dimensionKeys: readonly string[],
    groupingSets: readonly string[][],
    measures: readonly IPivotRollupMeasure[]
): IPivotCube {
    const rolled = rollupCuboid(leafRows, groupingSets, measures);
    return mergeCubes(indexRowsIntoCube(leafRows, dimensionKeys), indexRowsIntoCube(rolled, dimensionKeys), indexRowsIntoCube(extraRows, dimensionKeys));
}

export function getCubeCell(cube: IPivotCube, leftPath: IPivotTablePath, topPath: IPivotTablePath): IRow | undefined {
    return cube.cells[createCubeCellKey([...leftPath, ...topPath])];
}

export function leafValuePath(node: INestNode): IPivotTablePath {
    return node.path.filter((item) => item.key.length > 0);
}

export function materializeMetricMatrix(leftTree: INestNode, topTree: INestNode, cube: IPivotCube): (IRow | undefined)[][] {
    const leftLeaves = collectVisibleLeaves(leftTree);
    const topLeaves = collectVisibleLeaves(topTree);
    return leftLeaves.map((left) => topLeaves.map((top) => getCubeCell(cube, leafValuePath(left), leafValuePath(top))));
}
