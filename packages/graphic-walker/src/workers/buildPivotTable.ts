import { INestNode, IPivotCube } from '../components/pivotTable/interface';
import { buildNestTree, createPivotPathKey, pivotTableValuesEqual } from '../components/pivotTable/utils';
import {
    buildPivotCube,
    getAllPivotGroupingSets,
    inferRollupMeasures,
    type IPivotRollupMeasure,
} from '../components/pivotTable/cube';
import { pivotTotalsFromInput, type PivotTableTotalsArg } from '../components/pivotTable/display';
import { IField, IViewField, IRow } from '../interfaces';
import { datasetCategoryOrder, resolveCategoryDomain } from '../sort/categoryOrder';

export interface PivotCategoryContext {
    locale?: string;
    datasetFields?: readonly Pick<IField, 'fid' | 'categoryOrder'>[];
}

function categoryDomains(
    fields: readonly IViewField[],
    rows: readonly IRow[],
    context?: PivotCategoryContext
): Record<string, readonly string[]> {
    const locale = context?.locale || 'en-US';
    const domains: Record<string, readonly string[]> = {};
    for (const field of fields) {
        if (!field.fid || field.analyticType === 'measure') continue;
        const seen = new Set<string>();
        const values: unknown[] = [];
        for (const row of rows) {
            if (!Object.prototype.hasOwnProperty.call(row, field.fid)) continue;
            const label = row[field.fid] === null || row[field.fid] === undefined ? '' : String(row[field.fid]);
            if (seen.has(label)) continue;
            seen.add(label);
            values.push(row[field.fid]);
        }
        const datasetOrder = datasetCategoryOrder(field, context?.datasetFields);
        domains[field.fid] = resolveCategoryDomain({
            field,
            values,
            rows,
            locale,
            sheetOrder: field.categoryOrder,
            datasetOrder,
        }).values;
    }
    return domains;
}

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
    rollupMeasures?: IPivotRollupMeasure[],
    categoryContext?: PivotCategoryContext
): IBuildPivotTableResult {
    const totals = pivotTotalsFromInput(showTableSummary);
    const dimensionKeys = [...dimsInRow, ...dimsInColumn].map((field) => field.fid);
    const measures = rollupMeasures && rollupMeasures.length > 0 ? rollupMeasures : inferRollupMeasures(allData, dimensionKeys);
    const groupingSets = getAllPivotGroupingSets(dimsInRow, dimsInColumn);
    const cube = buildPivotCube(allData, aggData, dimensionKeys, groupingSets, measures);
    const cubeRows = sort ? [...allData, ...aggData, ...Object.values(cube.cells)] : allData;
    const domains = categoryDomains([...dimsInRow, ...dimsInColumn], allData, categoryContext);
    const locale = categoryContext?.locale || 'en-US';

    let lt: INestNode;
    let tt: INestNode;
    if (sort?.mode === 'row') {
        tt = buildNestTree(
            dimsInColumn.map((d) => d.fid),
            allData,
            collapsedKeyList,
            totals.columns,
            undefined,
            undefined,
            domains,
            locale
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
                rest,
                domains,
                locale
            );
        } else {
            lt = buildNestTree(
                dimsInRow.map((d) => d.fid),
                allData,
                collapsedKeyList,
                totals.rows,
                sort,
                undefined,
                domains,
                locale
            );
        }
    } else {
        lt = buildNestTree(
            dimsInRow.map((d) => d.fid),
            allData,
            collapsedKeyList,
            totals.rows,
            undefined,
            undefined,
            domains,
            locale
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
                rest,
                domains,
                locale
            );
        } else {
            tt = buildNestTree(
                dimsInColumn.map((d) => d.fid),
                allData,
                collapsedKeyList,
                totals.columns,
                sort,
                undefined,
                domains,
                locale
            );
        }
    }

    return { lt, tt, cube };
}
