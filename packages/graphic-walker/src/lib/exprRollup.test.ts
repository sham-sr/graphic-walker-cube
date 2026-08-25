import { evalExprWithComponents, exprComponentAggregates, planExprRollup } from './exprRollup';

const yoySql = '(sum("sales") - sum("prev")) / nullif(sum("prev"), 0)';

describe('expr rollup plan', () => {
    test('accepts additive YoY and collects sum components', () => {
        const plan = planExprRollup(yoySql);
        expect(plan.kind).toBe('recompute');
        if (plan.kind !== 'recompute') {
            return;
        }
        expect(plan.components).toEqual(
            expect.arrayContaining([
                { agg: 'sum', field: 'sales' },
                { agg: 'sum', field: 'prev' },
            ])
        );
        expect(plan.components).toHaveLength(2);
    });

    test('rejects non-additive aggregates', () => {
        expect(planExprRollup('avg("sales") / avg("prev")').kind).toBe('none');
        expect(planExprRollup('sum("sales") / distinctCount("id")').kind).toBe('none');
        expect(planExprRollup('mean("sales")').kind).toBe('none');
    });

    test('maps additive components to aggregate aliases', () => {
        expect(exprComponentAggregates(yoySql)).toEqual(
            expect.arrayContaining([
                { field: 'sales', agg: 'sum', asFieldKey: 'sales_sum' },
                { field: 'prev', agg: 'sum', asFieldKey: 'prev_sum' },
            ])
        );
        expect(exprComponentAggregates('avg("sales")')).toEqual([]);
    });

    test('rejects unparsable SQL', () => {
        expect(planExprRollup('sum"sales"').kind).toBe('none');
        expect(planExprRollup('').kind).toBe('none');
    });
});

describe('expr rollup evaluation', () => {
    const lookup = (agg: string, field: string) => {
        const values: Record<string, number> = { 'sum:sales': 410, 'sum:prev': 200 };
        return values[`${agg}:${field}`];
    };

    test('recomputes YoY from rolled component sums', () => {
        expect(evalExprWithComponents(yoySql, lookup)).toBeCloseTo(1.05);
    });

    test('returns null when the denominator is zero', () => {
        expect(
            evalExprWithComponents(yoySql, (agg, field) => (field === 'prev' ? 0 : 100))
        ).toBeNull();
    });
});
