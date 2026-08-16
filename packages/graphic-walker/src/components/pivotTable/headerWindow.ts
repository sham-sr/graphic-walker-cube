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
export function windowedHeaderCells(leaves: readonly IPivotLeafChain[], start: number, end: number): IWindowedHeaderCell[][] {
    const lo = Math.max(0, start);
    const hi = Math.min(leaves.length, end);
    const first = new Map<INestNode, number>();
    const last = new Map<INestNode, number>();
    for (let i = 0; i < leaves.length; i++) {
        for (const node of leaves[i].chain) {
            if (!first.has(node)) first.set(node, i);
            last.set(node, i);
        }
    }
    const rows: IWindowedHeaderCell[][] = [];
    for (let i = lo; i < hi; i++) {
        const cells: IWindowedHeaderCell[] = [];
        for (const node of leaves[i].chain) {
            const groupStart = first.get(node) ?? i;
            const emitAt = Math.max(groupStart, lo);
            if (i !== emitAt) continue;
            const groupEnd = (last.get(node) ?? i) + 1;
            cells.push({ node, span: Math.min(groupEnd, hi) - emitAt });
        }
        rows.push(cells);
    }
    return rows;
}
