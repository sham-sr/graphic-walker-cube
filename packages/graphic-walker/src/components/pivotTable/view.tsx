import React, { useMemo } from 'react';
import type { IViewField } from '../../interfaces';
import { buildLeftTreeRows } from './leftTree';
import MetricTable from './metricTable';
import TopTree from './topTree';
import type { INestNode, IPivotTableModel, PivotTableValue } from './interface';
import { getPivotTableFields } from './query';
import { collectVisibleLeaves } from './treeWalk';
import { createPivotPathKey } from './pathKey';
import { VirtualizedPivotView } from './virtualizedView';

/** Below this visible leaf count the classic HTML table is cheaper than a virtualizer. */
const PIVOT_TABLE_VIRTUALIZE_AFTER = 64;

export interface PivotTableViewProps {
    model: IPivotTableModel;
    rows: readonly IViewField[];
    columns: readonly IViewField[];
    defaultAggregated?: boolean;
    numberFormat?: string;
    timezoneDisplayOffset?: number;
    enableCollapse: boolean;
    onHeaderCollapse: (node: INestNode) => void;
    collapsedPaths?: readonly { key: string; value: unknown }[][];
}

export const PivotTableView: React.FC<PivotTableViewProps> = ({
    model,
    rows,
    columns,
    defaultAggregated = true,
    numberFormat = '',
    timezoneDisplayOffset,
    enableCollapse,
    onHeaderCollapse,
    collapsedPaths,
}) => {
    const { dimsInRow, dimsInColumn, measInRow, measInColumn } = useMemo(() => getPivotTableFields(rows, columns), [rows, columns]);
    const collapsedKeySet = useMemo(
        () => new Set((collapsedPaths ?? []).map((path) => createPivotPathKey(path as { key: string; value: PivotTableValue }[]))),
        [collapsedPaths]
    );
    const leftLeaves = useMemo(() => collectVisibleLeaves(model.leftTree, collapsedKeySet), [model.leftTree, collapsedKeySet]);
    const topLeaves = useMemo(() => collectVisibleLeaves(model.topTree, collapsedKeySet), [model.topTree, collapsedKeySet]);
    const bodyRowCount = Math.max(leftLeaves.length * Math.max(measInRow.length, 1), 0);
    const shouldVirtualize = bodyRowCount > PIVOT_TABLE_VIRTUALIZE_AFTER || topLeaves.length > PIVOT_TABLE_VIRTUALIZE_AFTER;

    const rowHeaders = useMemo(
        () =>
            shouldVirtualize
                ? []
                : buildLeftTreeRows({
                      data: model.leftTree,
                      dimsInRow,
                      measInRow,
                      onHeaderCollapse,
                      enableCollapse,
                      defaultAggregated,
                      displayOffset: timezoneDisplayOffset,
                      collapsedKeySet,
                  }),
        [shouldVirtualize, model.leftTree, dimsInRow, measInRow, onHeaderCollapse, enableCollapse, defaultAggregated, timezoneDisplayOffset, collapsedKeySet]
    );

    if (shouldVirtualize) {
        return (
            <VirtualizedPivotView
                model={model}
                leftLeaves={leftLeaves}
                topLeaves={topLeaves}
                dimsInRow={dimsInRow}
                dimsInColumn={dimsInColumn}
                measInRow={measInRow}
                measInColumn={measInColumn}
                defaultAggregated={defaultAggregated}
                numberFormat={numberFormat}
                timezoneDisplayOffset={timezoneDisplayOffset}
                enableCollapse={enableCollapse}
                onHeaderCollapse={onHeaderCollapse}
                collapsedKeySet={collapsedKeySet}
            />
        );
    }

    return (
        <div className="min-w-max" data-testid="pivot-table-view">
            <table className="border border-collapse">
                <TopTree
                    data={model.topTree}
                    dimsInCol={dimsInColumn}
                    measInCol={measInColumn}
                    dimsInRow={dimsInRow}
                    measInRow={measInRow}
                    onHeaderCollapse={onHeaderCollapse}
                    enableCollapse={enableCollapse}
                    defaultAggregated={defaultAggregated}
                    displayOffset={timezoneDisplayOffset}
                    collapsedKeySet={collapsedKeySet}
                />
                <MetricTable
                    cube={model.cube}
                    leftLeaves={leftLeaves}
                    topLeaves={topLeaves}
                    rowHeaders={rowHeaders}
                    meaInColumns={measInColumn}
                    meaInRows={measInRow}
                    defaultAggregated={defaultAggregated}
                    numberFormat={numberFormat}
                />
            </table>
        </div>
    );
};
