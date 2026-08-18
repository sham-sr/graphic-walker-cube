import type { INestNode, IPivotTablePath } from './interface';

export function isPivotNodeCollapsed(node: INestNode, collapsedKeySet?: ReadonlySet<string>): boolean {
    if (node.kind === 'summary' || node.children.length === 0) {
        return true;
    }
    if (node.isCollapsed) {
        return true;
    }
    return collapsedKeySet?.has(node.uniqueKey) ?? false;
}

export function collectVisibleLeaves(tree: INestNode, collapsedKeySet?: ReadonlySet<string>): INestNode[] {
    const leaves: INestNode[] = [];
    const stack: INestNode[] = [tree];
    while (stack.length > 0) {
        const node = stack.pop()!;
        if (isPivotNodeCollapsed(node, collapsedKeySet)) {
            leaves.push(node);
            continue;
        }
        for (let i = node.children.length - 1; i >= 0; i--) {
            stack.push(node.children[i]);
        }
    }
    return leaves;
}

export function applyCollapseFlags(tree: INestNode, collapsedKeySet: ReadonlySet<string>): void {
    const stack: INestNode[] = [tree];
    while (stack.length > 0) {
        const node = stack.pop()!;
        if (node.kind === 'value' && node.height > 0) {
            node.isCollapsed = collapsedKeySet.has(node.uniqueKey);
        }
        for (const child of node.children) {
            stack.push(child);
        }
    }
}

export function getLeafSpan(node: INestNode, collapsedKeySet?: ReadonlySet<string>): number {
    if (isPivotNodeCollapsed(node, collapsedKeySet)) {
        return 1;
    }
    let span = 0;
    for (const child of node.children) {
        span += getLeafSpan(child, collapsedKeySet);
    }
    return span;
}

export function collectCollapsiblePaths(tree: INestNode): IPivotTablePath[] {
    const paths: IPivotTablePath[] = [];
    const stack: INestNode[] = [tree];
    while (stack.length > 0) {
        const node = stack.pop()!;
        if (node.kind === 'value' && node.height > 0 && node.children.length > 0) {
            paths.push(node.path.map((item) => ({ ...item })));
        }
        for (const child of node.children) {
            stack.push(child);
        }
    }
    return paths;
}
