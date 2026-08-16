import React, { ReactNode } from 'react';
import { INestNode } from './interface';
import { IField } from '../../interfaces';
import { MinusCircleIcon, PlusCircleIcon } from '@heroicons/react/24/outline';
import { formatDate, getMeaAggName } from '@/utils';
import { parsedOffsetDate } from '@/lib/op/offset';
import { collectPivotLeafChains, windowedHeaderCells } from './headerWindow';
import { isPivotNodeCollapsed } from './treeWalk';

function formatHeaderValue(node: INestNode, field: IField | undefined, displayOffset?: number): string {
    const formatter =
        node.kind === 'value' && field?.semanticType === 'temporal'
            ? (x) => formatDate(parsedOffsetDate(displayOffset, field.offset)(x))
            : (x) => `${x}`;
    return formatter(node.value);
}

function LeftHeaderCell({
    node,
    field,
    rowSpan,
    colSpan,
    enableCollapse,
    isCollapsed,
    displayOffset,
    onHeaderCollapse,
}: {
    node: INestNode;
    field: IField | undefined;
    rowSpan: number;
    colSpan: number;
    enableCollapse: boolean;
    isCollapsed: boolean;
    displayOffset?: number;
    onHeaderCollapse: (node: INestNode) => void;
}) {
    const label = formatHeaderValue(node, field, displayOffset);
    return (
        <th
            key={node.uniqueKey}
            scope="row"
            className="bg-secondary text-secondary-foreground align-top whitespace-nowrap p-2 text-xs m-1 border font-normal text-left"
            colSpan={colSpan}
            rowSpan={rowSpan}
        >
            <div className="flex">
                <div>{label}</div>
                {node.kind === 'value' && node.height > 0 && enableCollapse && (
                    <button
                        type="button"
                        className="ml-1 self-center cursor-pointer"
                        aria-label={`${isCollapsed ? 'Expand' : 'Collapse'} ${label}`}
                        aria-expanded={!isCollapsed}
                        onClick={() => onHeaderCollapse(node)}
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
}

export function buildWindowedLeftTreeRows(
    props: TreeProps,
    start: number,
    end: number
): ReactNode[][] {
    const leaves = collectPivotLeafChains(props.data, props.collapsedKeySet);
    const windowCells = windowedHeaderCells(leaves, start, end);
    const meaNumber = Math.max(props.measInRow.length, 1);
    const cellRows: ReactNode[][] = windowCells.map((cells) =>
        cells.map((cell) => {
            const isCollapsed = isPivotNodeCollapsed(cell.node, props.collapsedKeySet);
            const depth = cell.node.path.length;
            const field = depth > 0 ? props.dimsInRow[depth - 1] : undefined;
            return (
                <LeftHeaderCell
                    key={cell.node.uniqueKey}
                    node={cell.node}
                    field={field}
                    colSpan={isCollapsed ? cell.node.height + 1 : 1}
                    rowSpan={isCollapsed ? meaNumber : cell.span * meaNumber}
                    enableCollapse={props.enableCollapse}
                    isCollapsed={isCollapsed}
                    displayOffset={props.displayOffset}
                    onHeaderCollapse={props.onHeaderCollapse}
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
                    ...(index === 0 ? row : []),
                    <th
                        key={`${index}-${measure.fid}-${measure.aggName}`}
                        scope="row"
                        className="bg-secondary text-secondary-foreground whitespace-nowrap p-2 text-xs m-1 border font-normal text-left"
                    >
                        {props.defaultAggregated ? getMeaAggName(measure.name, measure.aggName) : measure.name}
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
