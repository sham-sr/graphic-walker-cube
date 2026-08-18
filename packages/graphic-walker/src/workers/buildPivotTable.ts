import { INestNode, IPivotCube } from '../components/pivotTable/interface';
import { buildNestTree, createPivotPathKey, pivotTableValuesEqual } from '../components/pivotTable/utils';
import {
    buildPivotCube,
    getAllPivotGroupingSets,
    inferRollupMeasures,
    type IPivotRollupMeasure,
} from '../components/pivotTable/cube';
import { pivotTotalsFromInput, type PivotTableTotalsArg } from '../components/pivotTable/display';
import { IViewField, IRow } from '../interfaces';

const getFirstVisibleValuePath = (item: INestNode): INestNode[] => {
    const child = item.children.find((node) => node.kind === 'value');
    if (child) {
        return child.isCollapsed ? [child] : [child, ...getFirstVisibleValuePath(child)];
    }
    return [];
};

function getVisibleSlice(
    data: IRow[],
    visiblePrimaryData: IRow[],
    primaryDimensions: IViewField[],
    oppositeDimensions: IViewField[],
    oppositePath: INestNode[]
): IRow[] {
    const visibleDimensions = oppositeDimensions.slice(0, oppositePath.length);
    const hiddenDimensions = oppositeDimensions.slice(oppositePath.length);
    const visiblePrimaryKeys = new Set(
        visiblePrimaryData
            .filter((row) => primaryDimensions.every((field) => Object.prototype.hasOwnProperty.call(row, field.fid)))
            .map((row) => createPivotPathKey(primaryDimensions.map((field) => ({ key: field.fid, value: row[field.fid] }))))
    );
    return data.filter(
        (row) =>
            primaryDimensions.every((field) => Object.prototype.hasOwnProperty.call(row, field.fid)) &&
            visiblePrimaryKeys.has(createPivotPathKey(primaryDimensions.map((field) => ({ key: field.fid, value: row[field.fid] })))) &&
            visibleDimensions.every(
                (field, index) =>
                    Object.prototype.hasOwnProperty.call(row, field.fid) && pivotTableValuesEqual(row[field.fid], oppositePath[index].value)
            ) &&
            hiddenDimensions.every((field) => !Object.prototype.hasOwnProperty.call(row, field.fid))
    );
}

export interface IBuildPivotTableResult {
    lt: INestNode;
    tt: INestNode;
    cube: IPivotCube;
}

export function buildPivotTable(
    dimsInRow: IViewField[],
    dimsInColumn: IViewField[],
    allData: IRow[],
    aggData: IRow[],
    collapsedKeyList: string[],
    showTableSummary: PivotTableTotalsArg = false,
    sort?: {
        fid: string;
        type: 'ascending' | 'descending';
        mode: 'row' | 'column';
    },
    rollupMeasures?: IPivotRollupMeasure[]
): IBuildPivotTableResult {
    const totals = pivotTotalsFromInput(showTableSummary);
    const dimensionKeys = [...dimsInRow, ...dimsInColumn].map((field) => field.fid);
    const measures = rollupMeasures && rollupMeasures.length > 0 ? rollupMeasures : inferRollupMeasures(allData, dimensionKeys);
    const groupingSets = getAllPivotGroupingSets(dimsInRow, dimsInColumn);
    const cube = buildPivotCube(allData, aggData, dimensionKeys, groupingSets, measures);
    const cubeRows = sort ? [...allData, ...aggData, ...Object.values(cube.cells)] : allData;

    let lt: INestNode;
    let tt: INestNode;
    if (sort?.mode === 'row') {
        tt = buildNestTree(
            dimsInColumn.map((d) => d.fid),
            allData,
            collapsedKeyList,
            totals.columns
        );
        const firstColumnPath = getFirstVisibleValuePath(tt);
        if (dimsInColumn.length > 0 && firstColumnPath.length > 0) {
            const mentioned = getVisibleSlice(cubeRows, allData, dimsInRow, dimsInColumn, firstColumnPath);
            const mentionedSet = new Set(mentioned);
            const rest = allData.filter((row) => !mentionedSet.has(row));
            lt = buildNestTree(
                dimsInRow.map((d) => d.fid),
                mentioned,
                collapsedKeyList,
                totals.rows,
                sort,
                rest
            );
        } else {
            lt = buildNestTree(
                dimsInRow.map((d) => d.fid),
                allData,
                collapsedKeyList,
                totals.rows,
                sort
            );
        }
    } else {
        lt = buildNestTree(
            dimsInRow.map((d) => d.fid),
            allData,
            collapsedKeyList,
            totals.rows
        );
        const firstRowPath = getFirstVisibleValuePath(lt);
        if (sort && dimsInRow.length > 0 && firstRowPath.length > 0) {
            const mentioned = getVisibleSlice(cubeRows, allData, dimsInColumn, dimsInRow, firstRowPath);
            const mentionedSet = new Set(mentioned);
            const rest = allData.filter((row) => !mentionedSet.has(row));
            tt = buildNestTree(
                dimsInColumn.map((d) => d.fid),
                mentioned,
                collapsedKeyList,
                totals.columns,
                sort,
                rest
            );
        } else {
            tt = buildNestTree(
                dimsInColumn.map((d) => d.fid),
                allData,
                collapsedKeyList,
                totals.columns,
                sort
            );
        }
    }

    return { lt, tt, cube };
}
