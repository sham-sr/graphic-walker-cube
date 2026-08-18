import type { IAnalyticType, IExpression, IMutField, ISemanticType } from '../../interfaces';
import { getSQLItemAnalyticType, parseSQLExpr } from '../../lib/sql';
import { parseErrorMessage } from '../../utils';

export function quoteFieldName(name: string): string {
    return `"${name.replace(/"/g, '""')}"`;
}

export function nextComputedFieldName(existingNames: Iterable<string | undefined>, labelForIndex: (idx: number) => string): string {
    const taken = new Set(Array.from(existingNames).filter((name): name is string => Boolean(name)));
    let idx = 1;
    let name = labelForIndex(idx);
    while (taken.has(name)) {
        idx += 1;
        name = labelForIndex(idx);
    }
    return name;
}

export function expressionSql(expression?: IExpression): string | undefined {
    if (expression?.op !== 'expr') {
        return undefined;
    }
    const sql = expression.params.find((param) => param.type === 'sql');
    return sql && typeof sql.value === 'string' ? sql.value : undefined;
}

type FieldRef = Pick<IMutField, 'fid' | 'name' | 'semanticType' | 'analyticType'>;

export type ComputedFieldStatus =
    | { kind: 'empty' }
    | { kind: 'select' }
    | { kind: 'syntax'; detail: string }
    | { kind: 'unknown_field'; name: string }
    | { kind: 'ok'; semanticType: ISemanticType; analyticType: IAnalyticType; aggregated: boolean };

function collectRefNames(node: unknown, names: Set<string>): void {
    if (node === null || typeof node !== 'object') {
        return;
    }
    if (Array.isArray(node)) {
        node.forEach((item) => collectRefNames(item, names));
        return;
    }
    const record = node as { type?: string; name?: string };
    if (record.type === 'ref' && typeof record.name === 'string') {
        names.add(record.name);
        return;
    }
    Object.values(record).forEach((value) => collectRefNames(value, names));
}

export function inferComputedFieldStatus(sql: string, fields: readonly FieldRef[]): ComputedFieldStatus {
    const trimmed = sql.trim();
    if (!trimmed) {
        return { kind: 'empty' };
    }
    if (/^select\b/i.test(trimmed)) {
        return { kind: 'select' };
    }
    try {
        const ast = parseSQLExpr(sql);
        const known = new Map<string, string>();
        for (const field of fields) {
            const name = field.name ?? field.fid;
            known.set(name.toLowerCase(), name);
        }
        const refs = new Set<string>();
        collectRefNames(ast, refs);
        for (const ref of refs) {
            if (!known.has(ref.toLowerCase())) {
                return { kind: 'unknown_field', name: ref };
            }
        }
        const [semanticType, aggregated] = getSQLItemAnalyticType(ast, fields as IMutField[]);
        const analyticType: IAnalyticType = semanticType === 'quantitative' ? 'measure' : 'dimension';
        return { kind: 'ok', semanticType, analyticType, aggregated };
    } catch (error) {
        return { kind: 'syntax', detail: parseErrorMessage(error) };
    }
}

export function insertTextAtCaret(el: HTMLElement, text: string): string {
    el.focus();
    const selection = typeof window !== 'undefined' ? window.getSelection() : null;
    if (!selection || selection.rangeCount === 0 || !el.contains(selection.anchorNode)) {
        const next = `${el.textContent ?? ''}${text}`;
        el.textContent = next;
        return next;
    }
    const range = selection.getRangeAt(0);
    range.deleteContents();
    const node = document.createTextNode(text);
    range.insertNode(node);
    range.setStartAfter(node);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    return el.textContent ?? '';
}
