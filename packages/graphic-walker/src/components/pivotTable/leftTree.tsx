import React, { ReactNode } from 'react';
import { INestNode } from './interface';
import { IField } from '../../interfaces';
import { MinusCircleIcon, PlusCircleIcon } from '@heroicons/react/24/outline';
import { cn, getMeaAggName } from '@/utils';
import { collectPivotLeafChains, windowedHeaderCells, type IPivotLeafAncestorIndex, type IPivotLeafChain } from './headerWindow';
import { isPivotNodeCollapsed } from './treeWalk';
import { formatPivotHeaderValue, sortMark, type PivotDateFormat, type PivotSummaryLabels } from './display';

function LeftHeaderCell({
    node,
    field,
    dimsInRow,
    rowSpan,
    colSpan,
    enableCollapse,
    isCollapsed,
    displayOffset,
    onHeaderCollapse,
    onHeaderSort,
    sortedFid,
    sortedDir,
    stickyLeft,
    summaryLabels,
    hideCollapse,
    dateFormat,
    locale,
}: {
    node: INestNode;
    field: IField | undefined;
    dimsInRow: IField[];
    rowSpan: number;
    colSpan: number;
    enableCollapse: boolean;
    isCollapsed: boolean;
    displayOffset?: number;
    onHeaderCollapse: (node: INestNode) => void;
    onHeaderSort?: (fid: string) => void;
    sortedFid?: string;
    sortedDir?: string;
    stickyLeft?: boolean;
    summaryLabels?: PivotSummaryLabels;
    hideCollapse?: boolean;
    dateFormat?: PivotDateFormat;
    locale?: string;
}) {
    const label = formatPivotHeaderValue(node, field, dimsInRow, displayOffset, summaryLabels, dateFormat, locale);
    const mark = sortMark(field?.fid, sortedFid, sortedDir);
    return (
        <th
            key={node.uniqueKey}
            scope="row"
            className={cn(
                'bg-secondary text-secondary-foreground align-top whitespace-nowrap text-xs border font-normal text-left',
                rowSpan <= 1 ? 'h-8 max-h-8 px-2 py-0 leading-8' : 'px-2 py-1',
                node.kind === 'summary' && 'bg-muted font-medium',
                stickyLeft && 'sticky left-0 z-10',
                onHeaderSort && field && 'cursor-pointer'
            )}
            colSpan={colSpan}
            rowSpan={rowSpan}
            onClick={() => field && onHeaderSort?.(field.fid)}
        >
            <div className="flex">
                <div>
                    {label}
                    {mark}
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

export interface TreeProps {
    data: INestNode;
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
    leaves?: readonly IPivotLeafChain[];
    ancestorIndex?: IPivotLeafAncestorIndex;
    repeatLabels?: boolean;
    dateFormat?: PivotDateFormat;
    locale?: string;
}

export function buildWindowedLeftTreeRows(props: TreeProps, start: number, end: number): ReactNode[][] {
    const leaves = props.leaves ?? collectPivotLeafChains(props.data, props.collapsedKeySet);
    const windowCells = windowedHeaderCells(leaves, start, end, props.ancestorIndex, {
        repeatLabels: props.repeatLabels,
        dimCount: props.dimsInRow.length,
    });
    const meaNumber = Math.max(props.measInRow.length, 1);
    const repeatLabels = Boolean(props.repeatLabels);
    const cellRows: ReactNode[][] = windowCells.map((cells) =>
        cells.map((cell, dimIndex) => {
            const isCollapsed = isPivotNodeCollapsed(cell.node, props.collapsedKeySet);
            const depth = cell.node.path.length;
            const field = repeatLabels ? props.dimsInRow[dimIndex] : depth > 0 ? props.dimsInRow[depth - 1] : undefined;
            return (
                <LeftHeaderCell
                    key={`${cell.node.uniqueKey}-${dimIndex}`}
                    node={cell.node}
                    field={field}
                    dimsInRow={props.dimsInRow}
                    colSpan={repeatLabels || !isCollapsed ? 1 : cell.node.height + 1}
                    rowSpan={repeatLabels ? 1 : isCollapsed ? meaNumber : cell.span * meaNumber}
                    enableCollapse={props.enableCollapse}
                    isCollapsed={isCollapsed}
                    displayOffset={props.displayOffset}
                    onHeaderCollapse={props.onHeaderCollapse}
                    onHeaderSort={props.onHeaderSort}
                    sortedFid={props.sortedFid}
                    sortedDir={props.sortedDir}
                    stickyLeft={dimIndex === 0}
                    summaryLabels={props.summaryLabels}
                    hideCollapse={cell.repeated}
                    dateFormat={props.dateFormat}
                    locale={props.locale}
                />
            );
        })
    );

    if (props.measInRow.length > 0) {
        const result: ReactNode[][] = [];
        for (const row of cellRows) {
            for (let index = 0; index < props.measInRow.length; index++) {
                const measure = props.measInRow[index];
                result.push([
                    ...(repeatLabels || index === 0 ? row : []),
                    <th
                        key={`${index}-${measure.fid}-${measure.aggName}`}
                        scope="row"
                        className={cn(
                            'bg-secondary text-secondary-foreground h-8 max-h-8 whitespace-nowrap px-2 py-0 text-xs leading-8 border font-normal text-left',
                            props.onHeaderSort && 'cursor-pointer'
                        )}
                        onClick={() => props.onHeaderSort?.(measure.fid)}
                    >
                        {props.defaultAggregated ? getMeaAggName(measure.name, measure.aggName) : measure.name}
                        {sortMark(measure.fid, props.sortedFid, props.sortedDir)}
                    </th>,
                ]);
            }
        }
        return result;
    }
    return cellRows;
}

export function buildLeftTreeRows(props: TreeProps): ReactNode[][] {
    const leafCount = collectPivotLeafChains(props.data, props.collapsedKeySet).length;
    return buildWindowedLeftTreeRows(props, 0, leafCount);
}

export default buildLeftTreeRows;
