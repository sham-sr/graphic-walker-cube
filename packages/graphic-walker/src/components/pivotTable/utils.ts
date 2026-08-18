import type { IRow } from '../../interfaces';
import type { INestNode, IPivotTablePath, PivotTableValue } from './interface';
import { buildPivotCube, materializeMetricMatrix } from './cube';
import { coercePivotTotalsMode, type PivotTotalsMode } from './display';
import { createPivotPathKey, createPivotValueKey } from './pathKey';

export { createPivotPathKey, encodePivotTableValue, pivotTableValuesEqual } from './pathKey';
export { applyCollapseFlags, collectCollapsiblePaths, collectVisibleLeaves, getLeafSpan, isPivotNodeCollapsed } from './treeWalk';
export {
    buildPivotCube,
    getCubeCell,
    indexRowsIntoCube,
    leafValuePath,
    materializeMetricMatrix,
    mergeCubes,
    rollupCuboid,
} from './cube';

function insertNode(
    tree: INestNode,
    childIndex: Map<INestNode, Map<string, INestNode>>,
    layerKeys: string[],
    nodeData: IRow,
    depth: number,
    collapsedKeySet: ReadonlySet<string>,
    sort?: {
        fid: string;
        type: 'ascending' | 'descending';
    }
) {
    if (depth >= layerKeys.length) {
        return;
    }
    const key = nodeData[layerKeys[depth]] as PivotTableValue;
    const path: IPivotTablePath = [...tree.path, { key: layerKeys[depth], value: key }];
    const uniqueKey = createPivotPathKey(path);
    const valueKey = createPivotValueKey(key);

    let index = childIndex.get(tree);
    if (!index) {
        index = new Map();
        childIndex.set(tree, index);
    }
    let child = index.get(valueKey);
    if (!child) {
        child = {
            kind: 'value',
            key,
            value: key,
            sort: depth === layerKeys.length - 1 && sort ? nodeData[sort.fid] ?? `_${key}` : key,
            uniqueKey: uniqueKey,
            fieldKey: layerKeys[depth],
            children: [],
            path,
            height: layerKeys.length - depth - 1,
            isCollapsed: collapsedKeySet.has(uniqueKey),
        };
        tree.children.push(child);
        index.set(valueKey, child);
    }
    insertNode(child, childIndex, layerKeys, nodeData, depth + 1, collapsedKeySet, sort);
}

function comparePivotSortValues(left: PivotTableValue, right: PivotTableValue, reverse: boolean): number {
    if (typeof left === 'number' && typeof right === 'number') {
        if (left === right || (Number.isNaN(left) && Number.isNaN(right))) return 0;
        const cmp = left < right ? -1 : 1;
        return reverse ? -cmp : cmp;
    }
    const cmp = String(left).localeCompare(String(right));
    return reverse ? -cmp : cmp;
}

function sortNestTree(
    node: INestNode,
    depth: number,
    layerCount: number,
    sort?: {
        fid: string;
        type: 'ascending' | 'descending';
    }
) {
    if (node.children.length > 1) {
        const reverse = depth === layerCount - 1 && sort?.type === 'descending';
        node.children.sort((left, right) => comparePivotSortValues(left.sort, right.sort, reverse));
    }
    for (const child of node.children) {
        sortNestTree(child, depth + 1, layerCount, sort);
    }
}

const ROOT_KEY = '__pivot_root__';
const SUMMARY_KEY = '__pivot_summary__';

function makeSummaryNode(parent: INestNode): INestNode {
    return {
        kind: 'summary',
        key: SUMMARY_KEY,
        value: SUMMARY_KEY,
        sort: '',
        fieldKey: '',
        uniqueKey: JSON.stringify(['summary', parent.uniqueKey]),
        children: [],
        path: [...parent.path],
        height: parent.children[0].height,
        isCollapsed: true,
    };
}

/** Append Excel-style totals at the end of each group (or only at the root for grand). */
function insertSummaryNodes(node: INestNode, mode: PivotTotalsMode): void {
    if (mode === 'off' || node.children.length === 0) {
        return;
    }
    if (mode === 'grand') {
        if (node.kind === 'root') {
            node.children.push(makeSummaryNode(node));
        }
        return;
    }
    for (const child of node.children) {
        if (child.kind === 'value') {
            insertSummaryNodes(child, 'all');
        }
    }
    node.children.push(makeSummaryNode(node));
}

export function buildNestTree(
    layerKeys: string[],
    data: IRow[],
    collapsedKeyList: string[],
    showSummary: boolean | PivotTotalsMode,
    sort?: {
        fid: string;
        type: 'ascending' | 'descending';
    },
    dataWithoutSort?: IRow[]
): INestNode {
    const collapsedKeySet = new Set(collapsedKeyList);
    const childIndex = new Map<INestNode, Map<string, INestNode>>();
    const tree: INestNode = {
        kind: 'root',
        key: ROOT_KEY,
        value: 'root',
        fieldKey: 'root',
        sort: '',
        uniqueKey: createPivotPathKey([]),
        children: [],
        path: [],
        height: layerKeys.length,
        isCollapsed: false,
    };
    for (const row of data) {
        insertNode(tree, childIndex, layerKeys, row, 0, collapsedKeySet, sort);
    }
    if (dataWithoutSort) {
        for (const row of dataWithoutSort) {
            insertNode(tree, childIndex, layerKeys, row, 0, collapsedKeySet, { fid: '', type: sort?.type ?? 'ascending' });
        }
    }
    sortNestTree(tree, 0, layerKeys.length, sort);
    insertSummaryNodes(tree, coercePivotTotalsMode(showSummary));
    return tree;
}

export function buildMetricTableFromNestTree(leftTree: INestNode, topTree: INestNode, data: IRow[]): (IRow | null | undefined)[][] {
    const dimensionKeys = Array.from(
        new Set(
            [...leftTree.children, ...topTree.children].flatMap(function collectKeys(node: INestNode): string[] {
                return [...(node.kind === 'value' ? [node.fieldKey] : []), ...node.children.flatMap(collectKeys)];
            })
        )
    );
    const cube = buildPivotCube(data, [], dimensionKeys, [], []);
    return materializeMetricMatrix(leftTree, topTree, cube);
}

export function getAllChildrenSize(node: INestNode, depth: number): number {
    if (depth === 0) {
        return node.children.length;
    }
    return node.children.reduce((acc, child) => acc + getAllChildrenSize(child, depth + 1), 0);
}
