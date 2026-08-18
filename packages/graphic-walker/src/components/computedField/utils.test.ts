import { expressionSql, inferComputedFieldStatus, nextComputedFieldName, quoteFieldName } from './utils';

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
        expect(inferComputedFieldStatus('"Sales" *', fields).kind).toBe('syntax');
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
