import type { IComputationFunction, IFilterField, IRow, IViewField } from '../../interfaces';
import { dataQuery } from '../../computation/dataQuery';
import { fold2 } from '../../lib/op/fold';
import { getMeaAggKey, getSort, getSortedEncoding } from '../../utils';
import { toWorkflow } from '../../utils/workflow';
import type { IPivotRollupMeasure } from './cube';
import { toRollupMeasures } from './cube';
import { pivotTotalsFromInput, resolvePivotTotals, type PivotTableTotalsArg, type PivotTotalsMode } from './display';
import type { IPivotTableModel, IPivotTablePath } from './interface';
import { createPivotPathKey } from './utils';

export interface IPivotTableQueryInput {
    computation: IComputationFunction;
    fields: readonly IViewField[];
    rows: readonly IViewField[];
    columns: readonly IViewField[];
    filters?: readonly IFilterField[];
    defaultAggregated: boolean;
    folds?: readonly string[];
    limit: number;
    timezoneDisplayOffset?: number;
    showTableSummary: boolean;
    /** Independent of `showTableSummary`. When omitted, `showTableSummary` maps to both axes. */
    rowTotals?: PivotTotalsMode;
    columnTotals?: PivotTotalsMode;
    collapsedPaths: readonly IPivotTablePath[];
    /** Aggregated leaf data that has already been queried by a parent renderer. */
    viewData?: readonly IRow[];
}

export interface IPivotTableBuildResult {
    lt: IPivotTableModel['leftTree'];
    tt: IPivotTableModel['topTree'];
    cube: IPivotTableModel['cube'];
}

export type PivotTableModelBuilder = (
    dimsInRow: IViewField[],
    dimsInColumn: IViewField[],
    allData: IRow[],
    aggregatedData: IRow[],
    collapsedKeys: string[],
    showTableSummary: PivotTableTotalsArg,
    sort?: {
        fid: string;
        type: 'ascending' | 'descending';
        mode: 'row' | 'column';
    },
    rollupMeasures?: IPivotRollupMeasure[]
) => Promise<IPivotTableBuildResult>;

const buildPivotTableModelInWorker: PivotTableModelBuilder = async (...args) => {
    const { buildPivotTableService } = await import('../../services');
    return buildPivotTableService(...args);
};

function sameField(left: IViewField, right: IViewField): boolean {
    return left.fid === right.fid && left.aggName === right.aggName && left.computed === right.computed;
}

function uniqueFields(fields: readonly IViewField[]): IViewField[] {
    return fields.reduce<IViewField[]>((result, field) => {
        if (!result.some((existing) => sameField(existing, field))) {
            result.push(field);
        }
        return result;
    }, []);
}

function assertUniqueRawCells(data: readonly IRow[], dimensions: readonly IViewField[]): void {
    const seen = new Set<string>();
    for (const row of data) {
        const key = createPivotPathKey(dimensions.map((field) => ({ key: field.fid, value: row[field.fid] })));
        if (seen.has(key)) {
            throw new Error(
                'PivotTable raw mode requires each row/column dimension tuple to be unique. Add a unique row ID dimension or enable aggregation.'
            );
        }
        seen.add(key);
    }
}

export function getPivotTableFields(rows: readonly IViewField[], columns: readonly IViewField[]) {
    return {
        dimsInRow: rows.filter((field) => field.analyticType === 'dimension'),
        dimsInColumn: columns.filter((field) => field.analyticType === 'dimension'),
        measInRow: rows.filter((field) => field.analyticType === 'measure'),
        measInColumn: columns.filter((field) => field.analyticType === 'measure'),
    };
}

function axisGroupPrefixes(
    dims: readonly IViewField[],
    collapsedPaths: readonly IPivotTablePath[],
    mode: PivotTotalsMode
): IViewField[][] {
    const collapsedFieldKeys = new Set(collapsedPaths.map((path) => path[path.length - 1]?.key).filter(Boolean));
    const collapsedPrefixes = dims
        .filter((field) => collapsedFieldKeys.has(field.fid))
        .map((field) => dims.slice(0, dims.indexOf(field) + 1));
    if (mode === 'all') {
        return dims.map((_, index) => dims.slice(0, index));
    }
    if (mode === 'grand') {
        const prefixes: IViewField[][] = [[]];
        for (const prefix of collapsedPrefixes) {
            if (prefix.length > 0) {
                prefixes.push(prefix);
            }
        }
        return prefixes;
    }
    return collapsedPrefixes;
}

export function getPivotGroupByCombinations(
    dimsInRow: readonly IViewField[],
    dimsInColumn: readonly IViewField[],
    collapsedPaths: readonly IPivotTablePath[],
    showTableSummary: PivotTableTotalsArg
): IViewField[][] {
    const totals = pivotTotalsFromInput(showTableSummary);
    const rowCombinations = axisGroupPrefixes(dimsInRow, collapsedPaths, totals.rows);
    const columnCombinations = axisGroupPrefixes(dimsInColumn, collapsedPaths, totals.columns);

    rowCombinations.push([...dimsInRow]);
    columnCombinations.push([...dimsInColumn]);

    const combinations = columnCombinations.flatMap((columnFields) => rowCombinations.map((rowFields) => [...columnFields, ...rowFields]));
    return combinations.slice(0, -1);
}

export function getPivotSort(rows: readonly IViewField[], columns: readonly IViewField[], defaultAggregated: boolean) {
    const sortedOnRows = rows.find((field) => field.sort && field.sort !== 'none');
    const sortedOnColumns = columns.find((field) => field.sort && field.sort !== 'none');
    const sortedField = sortedOnRows ?? sortedOnColumns;
    if (!sortedField || sortedField.sort === 'none') {
        return undefined;
    }
    const type = sortedField.sort;
    const mode: 'row' | 'column' = sortedOnRows
        ? sortedField.analyticType === 'measure'
            ? 'column'
            : 'row'
        : sortedField.analyticType === 'measure'
          ? 'row'
          : 'column';
    const { measInRow, measInColumn } = getPivotTableFields(rows, columns);
    const clickedMeasure = sortedField.analyticType === 'measure' ? sortedField : undefined;
    const oppositeMeasure = mode === 'row' ? measInColumn[0] : measInRow[0];
    const measure = clickedMeasure ?? oppositeMeasure;
    const sortFieldId = measure
        ? defaultAggregated
            ? getMeaAggKey(measure.fid, measure.aggName)
            : measure.fid
        : sortedField.fid;
    if (!sortFieldId || (type !== 'ascending' && type !== 'descending')) {
        return undefined;
    }

    return {
        fid: sortFieldId,
        mode,
        type,
    } as const;
}

function getSortedDimensionId(rows: readonly IViewField[], columns: readonly IViewField[]): string | undefined {
    const mode = getSortedEncoding({ rows, columns });
    const shelf = mode === 'row' ? rows : mode === 'column' ? columns : undefined;
    const field = shelf?.[shelf.length - 1];
    return field?.analyticType === 'dimension' ? field.fid : undefined;
}

async function queryViewData(
    computation: IComputationFunction,
    fields: IViewField[],
    filters: IFilterField[],
    dimensions: IViewField[],
    measures: IViewField[],
    input: Pick<IPivotTableQueryInput, 'defaultAggregated' | 'folds' | 'limit' | 'timezoneDisplayOffset'>,
    sort: ReturnType<typeof getSort>,
    sortedDimensionId?: string,
    queryLimit = input.limit
): Promise<IRow[]> {
    let workflow = toWorkflow(
        filters,
        fields,
        dimensions,
        measures,
        input.defaultAggregated,
        sort,
        input.folds ? [...input.folds] : [],
        queryLimit > 0 ? queryLimit : undefined,
        input.timezoneDisplayOffset
    );
    if (measures.length === 0) {
        workflow = workflow.filter((step) => step.type !== 'sort' || step.by.length > 0);
        if (sort !== 'none' && queryLimit > 0 && sortedDimensionId && dimensions.some((field) => field.fid === sortedDimensionId)) {
            workflow.push({
                type: 'sort',
                by: [sortedDimensionId],
                sort,
            });
        }
    }
    const result = await dataQuery(computation, workflow, queryLimit > 0 ? queryLimit : undefined);
    return fold2(result, input.defaultAggregated, fields, measures, dimensions, input.folds ? [...input.folds] : undefined);
}

export async function queryPivotTable(
    input: IPivotTableQueryInput,
    buildModel: PivotTableModelBuilder = buildPivotTableModelInWorker
): Promise<IPivotTableModel> {
    const collapsedPaths = input.defaultAggregated ? input.collapsedPaths : [];
    const totals = resolvePivotTotals(
        {
            showTableSummary: input.showTableSummary,
            pivotRowTotals: input.rowTotals,
            pivotColumnTotals: input.columnTotals,
        },
        input.defaultAggregated
    );
    const { dimsInRow, dimsInColumn, measInRow, measInColumn } = getPivotTableFields(input.rows, input.columns);
    const fields = uniqueFields(input.fields);
    const filters = input.filters ? [...input.filters] : [];
    const viewDimensions = uniqueFields([...dimsInRow, ...dimsInColumn]);
    const viewMeasures = uniqueFields([...measInRow, ...measInColumn]);
    if (input.defaultAggregated) {
        const measureWithoutAggregation = viewMeasures.find((field) => !field.aggName);
        if (measureWithoutAggregation) {
            throw new Error(
                `PivotTable aggregated mode requires aggName for measure "${measureWithoutAggregation.name || measureWithoutAggregation.fid}".`
            );
        }
    }
    const sort = getSort({ rows: input.rows, columns: input.columns });
    const sortedDimensionId = getSortedDimensionId(input.rows, input.columns);

    const viewData = input.viewData
        ? [...input.viewData]
        : await queryViewData(input.computation, fields, filters, viewDimensions, viewMeasures, input, sort, sortedDimensionId);
    if (!input.defaultAggregated) {
        assertUniqueRawCells(viewData, viewDimensions);
    }

    const result = await buildModel(
        dimsInRow,
        dimsInColumn,
        viewData,
        [],
        collapsedPaths.map(createPivotPathKey),
        totals,
        getPivotSort(input.rows, input.columns, input.defaultAggregated),
        toRollupMeasures(viewMeasures, input.defaultAggregated, fields)
    );

    return {
        leftTree: result.lt,
        topTree: result.tt,
        cube: result.cube,
        isEmpty: viewData.length === 0,
    };
}
