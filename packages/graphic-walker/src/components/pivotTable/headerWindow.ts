import type { INestNode } from './interface';
import { isPivotNodeCollapsed } from './treeWalk';

export interface IPivotLeafChain {
    node: INestNode;
    /** Ancestors from the first row/column dimension through this visible node (root excluded). */
    chain: INestNode[];
}

export interface IWindowedHeaderCell {
    node: INestNode;
    span: number;
    /** Ancestor copied onto a deeper dim column when groups are collapsed or labels are repeated. */
    repeated?: boolean;
}

export interface IPivotLeafAncestorIndex {
    first: Map<INestNode, number>;
    last: Map<INestNode, number>;
}

/** Build once per tree/collapse change. Do not recompute on every virtual window. */
export function indexPivotLeafAncestors(leaves: readonly IPivotLeafChain[]): IPivotLeafAncestorIndex {
    const first = new Map<INestNode, number>();
    const last = new Map<INestNode, number>();
    for (let i = 0; i < leaves.length; i++) {
        for (const node of leaves[i].chain) {
            if (!first.has(node)) first.set(node, i);
            last.set(node, i);
        }
    }
    return { first, last };
}

export function collectPivotLeafChains(tree: INestNode, collapsedKeySet?: ReadonlySet<string>): IPivotLeafChain[] {
    const leaves: IPivotLeafChain[] = [];
    const walk = (node: INestNode, chain: INestNode[]) => {
        if (isPivotNodeCollapsed(node, collapsedKeySet)) {
            leaves.push({
                node,
                chain: node.kind === 'root' ? [] : [...chain, node],
            });
            return;
        }
        const nextChain = node.kind === 'root' ? chain : [...chain, node];
        for (const child of node.children) {
            walk(child, nextChain);
        }
    };
    walk(tree, []);
    return leaves;
}

/**
 * Excel-style nested headers for a visible leaf window: a parent cell is emitted
 * once, with rowspan/colspan clipped to the window.
 */
export function windowedHeaderCells(
    leaves: readonly IPivotLeafChain[],
    start: number,
    end: number,
    ancestorIndex?: IPivotLeafAncestorIndex,
    options?: { repeatLabels?: boolean; dimCount?: number }
): IWindowedHeaderCell[][] {
    const lo = Math.max(0, start);
    const hi = Math.min(leaves.length, end);
    const { first, last } = ancestorIndex ?? indexPivotLeafAncestors(leaves);
    const repeatLabels = Boolean(options?.repeatLabels);
    const dimCount = options?.dimCount;
    const rows: IWindowedHeaderCell[][] = [];
    for (let i = lo; i < hi; i++) {
        const cells: IWindowedHeaderCell[] = [];
        if (repeatLabels) {
            for (const node of leaves[i].chain) {
                cells.push({ node, span: 1 });
            }
            const leaf = leaves[i].node;
            const target = dimCount ?? cells.length;
            while (cells.length < target) {
                cells.push({ node: leaf, span: 1, repeated: true });
            }
        } else {
            for (const node of leaves[i].chain) {
                const groupStart = first.get(node) ?? i;
                const emitAt = Math.max(groupStart, lo);
                if (i !== emitAt) continue;
                const groupEnd = (last.get(node) ?? i) + 1;
                cells.push({ node, span: Math.min(groupEnd, hi) - emitAt });
            }
        }
        rows.push(cells);
    }
    return rows;
}
