import React, { useMemo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { IViewField } from '../../interfaces';
import { buildWindowedLeftTreeRows } from './leftTree';
import MetricTable from './metricTable';
import TopTree from './topTree';
import { collectPivotLeafChains } from './headerWindow';
import type { INestNode, IPivotTableModel } from './interface';

export interface VirtualizedPivotViewProps {
    model: IPivotTableModel;
    leftLeaves: INestNode[];
    topLeaves: INestNode[];
    dimsInRow: IViewField[];
    dimsInColumn: IViewField[];
    measInRow: IViewField[];
    measInColumn: IViewField[];
    defaultAggregated: boolean;
    numberFormat: string;
    timezoneDisplayOffset?: number;
    enableCollapse: boolean;
    onHeaderCollapse: (node: INestNode) => void;
    collapsedKeySet: ReadonlySet<string>;
}

const ROW_HEIGHT = 32;

export const VirtualizedPivotView: React.FC<VirtualizedPivotViewProps> = ({
    model,
    topLeaves,
    dimsInRow,
    dimsInColumn,
    measInRow,
    measInColumn,
    defaultAggregated,
    numberFormat,
    timezoneDisplayOffset,
    enableCollapse,
    onHeaderCollapse,
    collapsedKeySet,
}) => {
    const parentRef = useRef<HTMLDivElement>(null);
    const leftChains = useMemo(() => collectPivotLeafChains(model.leftTree, collapsedKeySet), [model.leftTree, collapsedKeySet]);
    const measureCount = Math.max(measInRow.length, 1);
    const headerColumnCount = dimsInRow.length + (measInRow.length > 0 ? 1 : 0);
    const metricCols = Math.max(topLeaves.length * Math.max(measInColumn.length, 1), 1);

    const rowVirtualizer = useVirtualizer({
        count: leftChains.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => ROW_HEIGHT * measureCount,
        overscan: 8,
    });

    const virtualRows = rowVirtualizer.getVirtualItems();
    const rowStart = virtualRows[0]?.index ?? 0;
    const rowEnd = virtualRows.length > 0 ? virtualRows[virtualRows.length - 1].index + 1 : 0;
    const paddingTop = virtualRows[0]?.start ?? 0;
    const paddingBottom = Math.max(0, rowVirtualizer.getTotalSize() - (virtualRows[virtualRows.length - 1]?.end ?? 0));

    const windowedLeaves = leftChains.slice(rowStart, rowEnd).map((leaf) => leaf.node);
    const rowHeaders = useMemo(
        () =>
            buildWindowedLeftTreeRows(
                {
                    data: model.leftTree,
                    dimsInRow,
                    measInRow,
                    onHeaderCollapse,
                    enableCollapse,
                    defaultAggregated,
                    displayOffset: timezoneDisplayOffset,
                    collapsedKeySet,
                },
                rowStart,
                rowEnd
            ),
        [
            model.leftTree,
            dimsInRow,
            measInRow,
            onHeaderCollapse,
            enableCollapse,
            defaultAggregated,
            timezoneDisplayOffset,
            collapsedKeySet,
            rowStart,
            rowEnd,
        ]
    );

    return (
        <div
            ref={parentRef}
            className="relative h-full min-h-[12rem] max-h-[70vh] overflow-auto"
            data-testid="pivot-table-view"
            data-virtualized="true"
        >
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
                    leftLeaves={windowedLeaves}
                    topLeaves={topLeaves}
                    rowHeaders={rowHeaders}
                    meaInColumns={measInColumn}
                    meaInRows={measInRow}
                    defaultAggregated={defaultAggregated}
                    numberFormat={numberFormat}
                    paddingTop={paddingTop}
                    paddingBottom={paddingBottom}
                    spacerColumnCount={headerColumnCount + metricCols}
                />
            </table>
        </div>
    );
};
