import React, { ReactNode, useMemo } from 'react';
import { INestNode } from './interface';
import { IField } from '../../interfaces';
import { MinusCircleIcon, PlusCircleIcon } from '@heroicons/react/24/outline';
import { cn, getMeaAggName } from '@/utils';
import { collectPivotLeafChains } from './headerWindow';
import { getLeafSpan, isPivotNodeCollapsed } from './treeWalk';
import { formatPivotHeaderValue, sortMark, type PivotSummaryLabels } from './display';

const headerClass = (extra?: string) =>
    cn('sticky top-0 z-20 bg-secondary text-secondary-foreground align-top whitespace-nowrap p-2 text-xs border font-normal text-left', extra);

function TopHeaderCell({
    node,
    field,
    dimsInCol,
    colSpan,
    rowSpan,
    enableCollapse,
    isCollapsed,
    displayOffset,
    onHeaderCollapse,
    onHeaderSort,
    sortedFid,
    sortedDir,
    summaryLabels,
    hideCollapse,
    cellKey,
}: {
    node: INestNode;
    field: IField | undefined;
    dimsInCol: IField[];
    colSpan: number;
    rowSpan: number;
    enableCollapse: boolean;
    isCollapsed: boolean;
    displayOffset?: number;
    onHeaderCollapse: (node: INestNode) => void;
    onHeaderSort?: (fid: string) => void;
    sortedFid?: string;
    sortedDir?: string;
    summaryLabels?: PivotSummaryLabels;
    hideCollapse?: boolean;
    cellKey: string;
}) {
    const label = formatPivotHeaderValue(node, field, dimsInCol, displayOffset, summaryLabels);
    return (
        <th
            key={cellKey}
            scope="col"
            className={headerClass(cn(node.kind === 'summary' && 'bg-muted font-medium', onHeaderSort && field && 'cursor-pointer'))}
            colSpan={colSpan}
            rowSpan={rowSpan}
            onClick={() => field && onHeaderSort?.(field.fid)}
        >
            <div className="flex">
                <div>
                    {label}
                    {sortMark(field?.fid, sortedFid, sortedDir)}
                </div>
                {node.kind === 'value' && node.height > 0 && enableCollapse && !hideCollapse && (
                    <button
                        type="button"
                        className="ml-1 self-center cursor-pointer"
                        aria-label={`${isCollapsed ? 'Expand' : 'Collapse'} ${label}`}
                        aria-expanded={!isCollapsed}
                        onClick={(event) => {
                            event.stopPropagation();
                            onHeaderCollapse(node);
                        }}
                    >
                        {isCollapsed ? <PlusCircleIcon className="w-3" /> : <MinusCircleIcon className="w-3" />}
                    </button>
                )}
            </div>
        </th>
    );
}

/**
 * render pivot table left tree table
 * @param node
 * @param dimsInCol
 * @param depth
 * @param cellRows
 * @returns
 */
function renderTree(
    node: INestNode,
    dimsInCol: IField[],
    depth: number,
    cellRows: ReactNode[][],
    meaNumber: number,
    onHeaderCollapse: (node: INestNode) => void,
    enableCollapse: boolean,
    displayOffset?: number,
    collapsedKeySet?: ReadonlySet<string>,
    onHeaderSort?: (fid: string) => void,
    sortedFid?: string,
    sortedDir?: string,
    summaryLabels?: PivotSummaryLabels
) {
    const childrenSize = getLeafSpan(node, collapsedKeySet);
    const isCollapsed = isPivotNodeCollapsed(node, collapsedKeySet);
    if (depth > dimsInCol.length) {
        return;
    }
    const field = depth > 0 ? dimsInCol[depth - 1] : undefined;
    cellRows[depth].push(
        <TopHeaderCell
            key={`${depth}-${node.uniqueKey}-${cellRows[depth].length}`}
            cellKey={`${depth}-${node.uniqueKey}-${cellRows[depth].length}`}
            node={node}
            field={field}
            dimsInCol={dimsInCol}
            colSpan={isCollapsed ? Math.max(meaNumber, 1) : childrenSize * Math.max(meaNumber, 1)}
            rowSpan={isCollapsed ? node.height + 1 : 1}
            enableCollapse={enableCollapse}
            isCollapsed={isCollapsed}
            displayOffset={displayOffset}
            onHeaderCollapse={onHeaderCollapse}
            onHeaderSort={onHeaderSort}
            sortedFid={sortedFid}
            sortedDir={sortedDir}
            summaryLabels={summaryLabels}
        />
    );
    if (isCollapsed) return;
    for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        renderTree(
            child,
            dimsInCol,
            depth + 1,
            cellRows,
            meaNumber,
            onHeaderCollapse,
            enableCollapse,
            displayOffset,
            collapsedKeySet,
            onHeaderSort,
            sortedFid,
            sortedDir,
            summaryLabels
        );
    }
}

function renderRepeatedTree(
    data: INestNode,
    dimsInCol: IField[],
    measInCol: IField[],
    collapsedKeySet: ReadonlySet<string> | undefined,
    onHeaderCollapse: (node: INestNode) => void,
    enableCollapse: boolean,
    displayOffset: number | undefined,
    onHeaderSort: ((fid: string) => void) | undefined,
    sortedFid: string | undefined,
    sortedDir: string | undefined,
    summaryLabels: PivotSummaryLabels | undefined
): ReactNode[][] {
    const leaves = collectPivotLeafChains(data, collapsedKeySet);
    const copies = Math.max(measInCol.length, 1);
    const cellRows: ReactNode[][] = Array.from({ length: dimsInCol.length }, () => []);
    const seenCollapse = new Set<string>();
    leaves.forEach((leaf, leafIndex) => {
        for (let depth = 0; depth < dimsInCol.length; depth++) {
            const node = leaf.chain[depth] ?? leaf.node;
            const isPad = leaf.chain[depth] === undefined;
            const field = dimsInCol[depth];
            const isCollapsed = isPivotNodeCollapsed(node, collapsedKeySet);
            for (let copy = 0; copy < copies; copy++) {
                const showCollapse = !isPad && copy === 0 && !seenCollapse.has(node.uniqueKey);
                if (showCollapse) {
                    seenCollapse.add(node.uniqueKey);
                }
                cellRows[depth].push(
                    <TopHeaderCell
                        key={`${depth}-${node.uniqueKey}-${leafIndex}-${copy}`}
                        cellKey={`${depth}-${node.uniqueKey}-${leafIndex}-${copy}`}
                        node={node}
                        field={field}
                        dimsInCol={dimsInCol}
                        colSpan={1}
                        rowSpan={1}
                        enableCollapse={enableCollapse}
                        isCollapsed={isCollapsed}
                        displayOffset={displayOffset}
                        onHeaderCollapse={onHeaderCollapse}
                        onHeaderSort={onHeaderSort}
                        sortedFid={sortedFid}
                        sortedDir={sortedDir}
                        summaryLabels={summaryLabels}
                        hideCollapse={!showCollapse}
                    />
                );
            }
        }
    });
    return cellRows;
}

export interface TreeProps {
    data: INestNode;
    dimsInCol: IField[];
    measInCol: IField[];
    dimsInRow: IField[];
    measInRow: IField[];
    onHeaderCollapse: (node: INestNode) => void;
    enableCollapse: boolean;
    defaultAggregated: boolean;
    displayOffset?: number;
    collapsedKeySet?: ReadonlySet<string>;
    onHeaderSort?: (fid: string) => void;
    sortedFid?: string;
    sortedDir?: string;
    summaryLabels?: PivotSummaryLabels;
    repeatLabels?: boolean;
}
const TopTree: React.FC<TreeProps> = (props) => {
    const { data, dimsInCol, measInCol, dimsInRow, measInRow, onHeaderCollapse, onHeaderSort, sortedFid, sortedDir, summaryLabels } = props;
    const nodeCells: ReactNode[][] = useMemo(() => {
        const meaNumber = Math.max(measInCol.length, 1);
        let cellRows: ReactNode[][];
        if (props.repeatLabels && dimsInCol.length > 0) {
            cellRows = renderRepeatedTree(
                data,
                dimsInCol,
                measInCol,
                props.collapsedKeySet,
                onHeaderCollapse,
                props.enableCollapse,
                props.displayOffset,
                onHeaderSort,
                sortedFid,
                sortedDir,
                summaryLabels
            );
            if (measInCol.length > 0) {
                const leaves = collectPivotLeafChains(data, props.collapsedKeySet);
                cellRows.push(
                    leaves.flatMap((leaf, idx) =>
                        measInCol.map((m) => (
                            <th
                                key={`${cellRows.length}-${m.fid}-${m.aggName}-${leaf.node.uniqueKey}-${idx}`}
                                scope="col"
                                className={headerClass(onHeaderSort && 'cursor-pointer')}
                                onClick={() => onHeaderSort?.(m.fid)}
                            >
                                {props.defaultAggregated ? getMeaAggName(m.name, m.aggName) : m.name}
                                {sortMark(m.fid, sortedFid, sortedDir)}
                            </th>
                        ))
                    )
                );
            }
        } else {
            cellRows = new Array(dimsInCol.length + 1).fill(0).map(() => []);
            renderTree(
                data,
                dimsInCol,
                0,
                cellRows,
                meaNumber,
                onHeaderCollapse,
                props.enableCollapse,
                props.displayOffset,
                props.collapsedKeySet,
                onHeaderSort,
                sortedFid,
                sortedDir,
                summaryLabels
            );
            const totalChildrenSize = getLeafSpan(data, props.collapsedKeySet);

            cellRows.forEach((row: ReactNode[], rowIdx: number) => {
                const rowSpanArr = row.map((child) => (React.isValidElement(child) ? (child.props as { rowSpan: number }).rowSpan : 0));
                if (rowSpanArr.length > 0 && rowSpanArr[0] > 1 && rowSpanArr.every((v) => v === rowSpanArr[0])) {
                    row.forEach((childObj, childIdx) => {
                        if (React.isValidElement(childObj)) {
                            const newChild = React.cloneElement(childObj as React.ReactElement<{ rowSpan?: number }>, { rowSpan: 1 });
                            cellRows[rowIdx][childIdx] = newChild;
                        }
                    });
                }
            });

            cellRows.push(
                new Array(totalChildrenSize).fill(0).flatMap((ele, idx) =>
                    measInCol.map((m) => (
                        <th
                            key={`${cellRows.length}-${m.fid}-${m.aggName}-${idx}`}
                            scope="col"
                            className={headerClass(onHeaderSort && 'cursor-pointer')}
                            onClick={() => onHeaderSort?.(m.fid)}
                        >
                            {props.defaultAggregated ? getMeaAggName(m.name, m.aggName) : m.name}
                            {sortMark(m.fid, sortedFid, sortedDir)}
                        </th>
                    ))
                )
            );
            cellRows.shift();
        }
        const visibleRows = cellRows.filter((row) => row.length > 0);
        if (visibleRows.length === 0) {
            visibleRows.push([
                <th key="value" scope="col" className={headerClass()}>
                    Value
                </th>,
            ]);
        }
        const rowHeaderColumnCount = dimsInRow.length + (measInRow.length > 0 ? 1 : 0);
        return visibleRows.map((row, rowIndex) => {
            if (rowHeaderColumnCount === 0) {
                return row;
            }
            if (rowIndex < visibleRows.length - 1) {
                return [
                    <th
                        key={`corner-${rowIndex}`}
                        aria-hidden="true"
                        colSpan={rowHeaderColumnCount}
                        className="sticky left-0 top-0 z-30 bg-secondary p-2 text-xs border"
                    />,
                    ...row,
                ];
            }
            return [
                ...dimsInRow.map((field, fieldIndex) => (
                    <th
                        key={`row-field-${field.fid}`}
                        scope="col"
                        className={headerClass(cn(fieldIndex === 0 && 'sticky left-0 z-30', onHeaderSort && 'cursor-pointer'))}
                        onClick={() => onHeaderSort?.(field.fid)}
                    >
                        {field.name}
                        {sortMark(field.fid, sortedFid, sortedDir)}
                    </th>
                )),
                ...(measInRow.length > 0
                    ? [
                          <th
                              key="row-measure"
                              scope="col"
                              className={headerClass(dimsInRow.length === 0 ? 'sticky left-0 z-30' : undefined)}
                          >
                              Measure
                          </th>,
                      ]
                    : []),
                ...row,
            ];
        });
    }, [
        data,
        dimsInCol,
        measInCol,
        dimsInRow,
        measInRow,
        onHeaderCollapse,
        onHeaderSort,
        sortedFid,
        sortedDir,
        props.defaultAggregated,
        props.enableCollapse,
        props.displayOffset,
        props.collapsedKeySet,
        props.repeatLabels,
        summaryLabels,
    ]);

    return (
        <thead className="border bg-secondary">
            {nodeCells.map((row, rIndex) => (
                <tr className="border" key={rIndex}>
                    {row}
                </tr>
            ))}
        </thead>
    );
};

export default TopTree;
