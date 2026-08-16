import type { IRow } from '../../interfaces';

export type PivotTableValue = string | number | boolean | null | undefined;

export interface IPivotTablePathItem {
    key: string;
    value: PivotTableValue;
}

export type IPivotTablePath = IPivotTablePathItem[];

export interface INestNode {
    kind: 'root' | 'value' | 'summary';
    key: PivotTableValue;
    value: PivotTableValue;
    sort: PivotTableValue;
    uniqueKey: string;
    fieldKey: string;
    children: INestNode[];
    height: number;
    isCollapsed: boolean;
    path: IPivotTablePath;
}

export interface IPivotCube {
    /** Path-keyed cuboid cells. Missing intersections are absent, not stored. */
    cells: Record<string, IRow>;
}

export interface IPivotTableModel {
    leftTree: INestNode;
    topTree: INestNode;
    cube: IPivotCube;
    isEmpty: boolean;
}
