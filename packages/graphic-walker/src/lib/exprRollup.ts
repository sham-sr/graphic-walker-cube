import { parseSQLExpr } from './sql';

export type AdditiveAgg = 'sum' | 'count' | 'min' | 'max';

export interface ExprComponent {
    field: string;
    agg: AdditiveAgg;
}

export type ExprRollupPlan = { kind: 'recompute'; sql: string; components: ExprComponent[] } | { kind: 'none' };

const ADDITIVE_AGGS = new Set<string>(['sum', 'count', 'min', 'max']);
const SCALAR_FUNCS = new Set<string>(['nullif', 'coalesce']);

type SqlNode = {
    type?: string;
    name?: string;
    value?: unknown;
    op?: string;
    function?: { name?: string };
    args?: SqlNode[];
    operand?: SqlNode;
    left?: SqlNode;
    right?: SqlNode;
    else?: SqlNode;
    whens?: { when: SqlNode; value: SqlNode }[];
};

function callName(node: SqlNode): string {
    return node.function?.name?.toLowerCase() ?? '';
}

function argField(arg: SqlNode | undefined): string | undefined {
    if (!arg) {
        return '*';
    }
    if (arg.type === 'ref' && typeof arg.name === 'string') {
        return arg.name;
    }
    if (arg.type === 'star') {
        return '*';
    }
    return undefined;
}

function componentKey(agg: AdditiveAgg, field: string): string {
    return `${agg}:${field}`;
}

export function planExprRollup(sql: string): ExprRollupPlan {
    const trimmed = sql.trim();
    if (!trimmed) {
        return { kind: 'none' };
    }
    try {
        const components = new Map<string, ExprComponent>();
        let blocked = false;
        const visit = (node: unknown): void => {
            if (blocked || node === null || typeof node !== 'object') {
                return;
            }
            if (Array.isArray(node)) {
                node.forEach(visit);
                return;
            }
            const rec = node as SqlNode;
            if (rec.type === 'call') {
                const name = callName(rec);
                if (ADDITIVE_AGGS.has(name)) {
                    const field = argField(rec.args?.[0]);
                    if (!field) {
                        blocked = true;
                        return;
                    }
                    const agg = name as AdditiveAgg;
                    components.set(componentKey(agg, field), { agg, field });
                    return;
                }
                if (!SCALAR_FUNCS.has(name)) {
                    blocked = true;
                    return;
                }
                rec.args?.forEach(visit);
                return;
            }
            Object.values(rec).forEach(visit);
        };
        visit(parseSQLExpr(trimmed));
        if (blocked || components.size === 0) {
            return { kind: 'none' };
        }
        return { kind: 'recompute', sql: trimmed, components: [...components.values()] };
    } catch {
        return { kind: 'none' };
    }
}

export function evalExprWithComponents(sql: string, lookup: (agg: AdditiveAgg, field: string) => number | undefined): number | null {
    const evalNode = (node: SqlNode | undefined): number | null => {
        if (!node) {
            return null;
        }
        switch (node.type) {
            case 'integer':
            case 'numeric':
                return typeof node.value === 'number' ? node.value : Number(node.value);
            case 'null':
                return null;
            case 'unary': {
                const value = evalNode(node.operand);
                if (value == null) {
                    return null;
                }
                return node.op === '-' ? -value : +value;
            }
            case 'binary': {
                const left = evalNode(node.left);
                const right = evalNode(node.right);
                if (node.op === '/') {
                    if (left == null || right == null || right === 0) {
                        return null;
                    }
                    return left / right;
                }
                if (left == null || right == null) {
                    return null;
                }
                switch (node.op) {
                    case '+':
                        return left + right;
                    case '-':
                        return left - right;
                    case '*':
                        return left * right;
                    case '%':
                        return left % right;
                    default:
                        return null;
                }
            }
            case 'call': {
                const name = callName(node);
                if (ADDITIVE_AGGS.has(name)) {
                    const field = argField(node.args?.[0]);
                    if (!field) {
                        return null;
                    }
                    const value = lookup(name as AdditiveAgg, field);
                    return value == null || !Number.isFinite(value) ? null : value;
                }
                if (name === 'nullif') {
                    const left = evalNode(node.args?.[0]);
                    const right = evalNode(node.args?.[1]);
                    return left === right ? null : left;
                }
                if (name === 'coalesce') {
                    for (const arg of node.args ?? []) {
                        const value = evalNode(arg);
                        if (value != null) {
                            return value;
                        }
                    }
                    return null;
                }
                return null;
            }
            case 'case': {
                for (const when of node.whens ?? []) {
                    const cond = evalNode(when.when);
                    if (cond) {
                        return evalNode(when.value);
                    }
                }
                return evalNode(node.else);
            }
            default:
                return null;
        }
    };
    try {
        const value = evalNode(parseSQLExpr(sql) as SqlNode);
        return value == null || !Number.isFinite(value) ? null : value;
    } catch {
        return null;
    }
}

export function exprComponentAggKey(field: string, agg: AdditiveAgg): string {
    return `${field}_${agg}`;
}

export function exprComponentAggregates(sql: string): { field: string; agg: AdditiveAgg; asFieldKey: string }[] {
    const plan = planExprRollup(sql);
    if (plan.kind !== 'recompute') {
        return [];
    }
    return plan.components.map((component) => ({
        field: component.field,
        agg: component.agg,
        asFieldKey: exprComponentAggKey(component.field, component.agg),
    }));
}
