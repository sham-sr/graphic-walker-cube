import { classifySqlSyntaxError, expressionSql, inferComputedFieldStatus, insertAtOffset, nextComputedFieldName, quoteFieldName } from './utils';
import { parseErrorMessage } from '../../utils';
import { parseSQLExpr } from '../../lib/sql';

const fields = [
    { fid: 'sales', name: 'Sales', semanticType: 'quantitative' as const, analyticType: 'measure' as const },
    { fid: 'status', name: 'status', semanticType: 'nominal' as const, analyticType: 'dimension' as const },
    { fid: 'cash', name: 'Tickets.amount', semanticType: 'quantitative' as const, analyticType: 'measure' as const },
];

describe('computed field helpers', () => {
    test('quotes identifiers and escapes embedded quotes', () => {
        expect(quoteFieldName('Sales')).toBe('"Sales"');
        expect(quoteFieldName('Tickets.amount')).toBe('"Tickets.amount"');
        expect(quoteFieldName('say "hi"')).toBe('"say ""hi"""');
    });

    test('allocates the next localized default name', () => {
        expect(nextComputedFieldName(['Sales'], (idx) => `Computed ${idx}`)).toBe('Computed 1');
        expect(nextComputedFieldName(['Computed 1', 'Computed 2'], (idx) => `Computed ${idx}`)).toBe('Computed 3');
        expect(nextComputedFieldName(['Вычисляемое 1'], (idx) => `Вычисляемое ${idx}`)).toBe('Вычисляемое 2');
    });

    test('reads SQL from an expr expression', () => {
        expect(expressionSql({ op: 'bin', as: 'x', params: [] })).toBeUndefined();
        expect(
            expressionSql({
                op: 'expr',
                as: 'x',
                params: [{ type: 'sql', value: '"Sales" * 2' }],
            })
        ).toBe('"Sales" * 2');
    });

    test('infers empty, select, and syntax states', () => {
        expect(inferComputedFieldStatus('  ', fields)).toEqual({ kind: 'empty' });
        expect(inferComputedFieldStatus('SELECT * FROM t', fields)).toEqual({ kind: 'select' });
        expect(inferComputedFieldStatus('sum"Sales"', fields)).toEqual(
            expect.objectContaining({ kind: 'syntax', code: 'missing_call_paren' })
        );
    });

    test('inserts a field name at the caret, not only at the end', () => {
        expect(insertAtOffset('sum()', '"Sales"', 4)).toEqual({ next: 'sum("Sales")', caret: 11 });
        expect(insertAtOffset('ab', '"x"', 0)).toEqual({ next: '"x"ab', caret: 3 });
        expect(insertAtOffset('ab', '"x"', 99)).toEqual({ next: 'ab"x"', caret: 5 });
    });

    test('classifies parser traces into short syntax codes', () => {
        let missingParen: unknown;
        try {
            parseSQLExpr('sum"Sales"');
        } catch (error) {
            missingParen = error;
        }
        expect(classifySqlSyntaxError(missingParen)).toMatchObject({ code: 'missing_call_paren' });
        expect(parseErrorMessage(missingParen)).toMatch(/Instead, I was expecting/);

        let unfinished: unknown;
        try {
            parseSQLExpr('"Sales" *');
        } catch (error) {
            unfinished = error;
        }
        const unfinishedClass = classifySqlSyntaxError(unfinished);
        expect(['unfinished', 'generic']).toContain(unfinishedClass.code);
    });

    test('infers row-level measures and aggregated expressions', () => {
        expect(inferComputedFieldStatus('"Sales" * 1.2', fields)).toEqual({
            kind: 'ok',
            semanticType: 'quantitative',
            analyticType: 'measure',
            aggregated: false,
        });
        expect(inferComputedFieldStatus('sum("Sales")', fields)).toEqual({
            kind: 'ok',
            semanticType: 'quantitative',
            analyticType: 'measure',
            aggregated: true,
        });
    });

    test('accepts quoted dotted Cube-style names', () => {
        expect(inferComputedFieldStatus('"Tickets.amount" * 1.2', fields)).toEqual({
            kind: 'ok',
            semanticType: 'quantitative',
            analyticType: 'measure',
            aggregated: false,
        });
    });

    test('warns about unknown field refs', () => {
        expect(inferComputedFieldStatus('"Missing" + 1', fields)).toEqual({ kind: 'unknown_field', name: 'Missing' });
    });
});
