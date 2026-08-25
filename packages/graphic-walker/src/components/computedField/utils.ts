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

export type SqlSyntaxCode = 'missing_call_paren' | 'unfinished' | 'generic';

export type ComputedFieldStatus =
    | { kind: 'empty' }
    | { kind: 'select' }
    | { kind: 'syntax'; code: SqlSyntaxCode; column?: number }
    | { kind: 'unknown_field'; name: string }
    | { kind: 'ok'; semanticType: ISemanticType; analyticType: IAnalyticType; aggregated: boolean };

type ShadowSelectionRoot = ShadowRoot & { getSelection: () => Selection | null };

function isShadowSelectionRoot(root: Node): root is ShadowSelectionRoot {
    return typeof ShadowRoot !== 'undefined' && root instanceof ShadowRoot && typeof (root as ShadowRoot & { getSelection?: unknown }).getSelection === 'function';
}

export function getSelectionFor(node: Node): Selection | null {
    const root = node.getRootNode();
    if (isShadowSelectionRoot(root)) {
        return root.getSelection();
    }
    return typeof window !== 'undefined' ? window.getSelection() : null;
}

export function insertAtOffset(source: string, text: string, offset: number): { next: string; caret: number } {
    const clamped = Math.max(0, Math.min(offset, source.length));
    return { next: `${source.slice(0, clamped)}${text}${source.slice(clamped)}`, caret: clamped + text.length };
}

export function classifySqlSyntaxError(error: unknown): { code: SqlSyntaxCode; column?: number } {
    const raw = parseErrorMessage(error);
    const colMatch = raw.match(/\bcol(?:umn)?\s+(\d+)/i);
    const column = colMatch ? Number(colMatch[1]) : undefined;
    const unexpectedMatch = raw.match(/Unexpected\s+(\S+)\s+token/i);
    const unexpected = unexpectedMatch?.[1]?.toLowerCase() ?? '';
    const expectsParen = /lparen|"\("/i.test(raw);
    if ((unexpected === 'quoted_word' || unexpected === 'string') && expectsParen) {
        return { code: 'missing_call_paren', column };
    }
    if (/unexpected end|end of input|\beof\b/i.test(raw) || unexpected === 'eof') {
        return { code: 'unfinished', column };
    }
    return { code: 'generic', column };
}

export function getCaretOffset(el: HTMLElement): number | null {
    const selection = getSelectionFor(el);
    if (!selection || selection.rangeCount === 0) {
        return null;
    }
    const range = selection.getRangeAt(0);
    if (!el.contains(range.startContainer) && range.startContainer !== el) {
        return null;
    }
    const pre = range.cloneRange();
    pre.selectNodeContents(el);
    pre.setEnd(range.startContainer, range.startOffset);
    return pre.toString().length;
}

export function setCaretOffset(el: HTMLElement, offset: number): void {
    const selection = getSelectionFor(el) ?? (typeof window !== 'undefined' ? window.getSelection() : null);
    if (!selection) {
        return;
    }
    const total = el.textContent?.length ?? 0;
    const clamped = Math.max(0, Math.min(offset, total));
    const range = document.createRange();
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let remaining = clamped;
    let node = walker.nextNode();
    let last: Node | null = null;
    while (node) {
        last = node;
        const len = node.textContent?.length ?? 0;
        if (remaining <= len) {
            range.setStart(node, remaining);
            range.collapse(true);
            selection.removeAllRanges();
            selection.addRange(range);
            return;
        }
        remaining -= len;
        node = walker.nextNode();
    }
    if (last) {
        range.setStart(last, last.textContent?.length ?? 0);
    } else {
        range.selectNodeContents(el);
    }
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
}

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
        return { kind: 'syntax', ...classifySqlSyntaxError(error) };
    }
}

export function insertTextAtCaret(el: HTMLElement, text: string, fallbackOffset?: number): string {
    const fromSelection = getCaretOffset(el);
    const current = el.textContent ?? '';
    const offset = fromSelection ?? fallbackOffset ?? current.length;
    const { next, caret } = insertAtOffset(current, text, offset);
    el.focus();
    el.textContent = next;
    setCaretOffset(el, caret);
    return next;
}
