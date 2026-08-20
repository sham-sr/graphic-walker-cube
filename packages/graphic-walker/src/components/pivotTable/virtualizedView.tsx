import React, { useMemo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { IViewField } from '../../interfaces';
import { buildWindowedLeftTreeRows } from './leftTree';
import MetricTable from './metricTable';
import TopTree from './topTree';
import { collectPivotLeafChains, indexPivotLeafAncestors } from './headerWindow';
import type { INestNode, IPivotTableModel, IPivotTablePath } from './interface';
import type { PivotColorMode, PivotDateFormat, PivotPercentMode, PivotSummaryLabels } from './display';
import { PIVOT_ROW_HEIGHT_PX, PIVOT_TABLE_CLASS } from './scrollport';
import { PivotScrollViewport } from './scrollArea';

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
    colorMode?: PivotColorMode;
    percentMode?: PivotPercentMode;
    dark?: boolean;
    onHeaderSort?: (fid: string) => void;
    sortedFid?: string;
    sortedDir?: string;
    onKeepPath?: (path: IPivotTablePath) => void;
    summaryLabels?: PivotSummaryLabels;
    repeatLabels?: boolean;
    dateFormat?: PivotDateFormat;
    locale?: string;
}

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
    colorMode = 'none',
    percentMode = 'none',
    dark = false,
    onHeaderSort,
    sortedFid,
    sortedDir,
    onKeepPath,
    summaryLabels,
    repeatLabels,
    dateFormat,
    locale,
}) => {
    const parentRef = useRef<HTMLDivElement>(null);
    const leftChains = useMemo(() => collectPivotLeafChains(model.leftTree, collapsedKeySet), [model.leftTree, collapsedKeySet]);
    const ancestorIndex = useMemo(() => indexPivotLeafAncestors(leftChains), [leftChains]);
    const measureCount = Math.max(measInRow.length, 1);
    const headerColumnCount = dimsInRow.length + (measInRow.length > 0 ? 1 : 0);
    const metricCols = Math.max(topLeaves.length * Math.max(measInColumn.length, 1), 1);

    const rowVirtualizer = useVirtualizer({
        count: leftChains.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => PIVOT_ROW_HEIGHT_PX * measureCount,
        overscan: 6,
        getItemKey: (index) => leftChains[index]?.node.uniqueKey ?? index,
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
                    onHeaderSort,
                    sortedFid,
                    sortedDir,
                    summaryLabels,
                    leaves: leftChains,
                    ancestorIndex,
                    repeatLabels,
                    dateFormat,
                    locale,
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
            onHeaderSort,
            sortedFid,
            sortedDir,
            summaryLabels,
            leftChains,
            ancestorIndex,
            repeatLabels,
            dateFormat,
            locale,
            rowStart,
            rowEnd,
        ]
    );

    return (
        <PivotScrollViewport ref={parentRef} virtualized>
            <table className={PIVOT_TABLE_CLASS}>
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
                    onHeaderSort={onHeaderSort}
                    sortedFid={sortedFid}
                    sortedDir={sortedDir}
                    summaryLabels={summaryLabels}
                    repeatLabels={repeatLabels}
                    dateFormat={dateFormat}
                    locale={locale}
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
                    colorMode={colorMode}
                    percentMode={percentMode}
                    dark={dark}
                    onKeepPath={onKeepPath}
                />
            </table>
        </PivotScrollViewport>
    );
};
