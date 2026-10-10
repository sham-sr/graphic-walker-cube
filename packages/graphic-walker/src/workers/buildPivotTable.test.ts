import type { IViewField } from '../interfaces';
import { buildNestTree, createPivotPathKey, materializeMetricMatrix } from '../components/pivotTable/utils';
import { buildPivotTable } from './buildPivotTable';

const dimension = (fid: string): IViewField => ({
    fid,
    name: fid,
    analyticType: 'dimension',
    semanticType: 'nominal',
});

describe('buildPivotTable', () => {
    test('orders Russian weekdays and numeric hours the same way as a heatmap', () => {
        const data = [
            { weekday: 'суббота', hour: '17', load_sum: 9 },
            { weekday: 'четверг', hour: '7', load_sum: 4 },
            { weekday: 'пятница', hour: '6', load_sum: 3 },
            { weekday: 'вторник', hour: '18', load_sum: 8 },
            { weekday: 'среда', hour: '0', load_sum: 1 },
            { weekday: 'понедельник', hour: '3', load_sum: 2 },
            { weekday: 'воскресенье', hour: '1', load_sum: 5 },
            { weekday: 'понедельник', hour: '2', load_sum: 6 },
        ];
        const result = buildPivotTable([dimension('weekday')], [dimension('hour')], data, [], [], false, undefined, undefined, { locale: 'ru-RU' });
        expect(result.lt.children.map((node) => node.value)).toEqual(['понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье']);
        expect(result.tt.children.map((node) => node.value)).toEqual(['0', '1', '2', '3', '6', '7', '17', '18']);
    });

    test('orders capitalized Cube month and weekday labels on both axes', () => {
        const data = [
            { month: 'Март', weekday: 'Суббота', amount: 1 },
            { month: 'Январь', weekday: 'Четверг', amount: 1 },
            { month: 'Декабрь', weekday: 'Понедельник', amount: 1 },
            { month: 'Февраль', weekday: 'Воскресенье', amount: 1 },
        ];
        const result = buildPivotTable([dimension('month')], [dimension('weekday')], data, [], [], false, undefined, undefined, { locale: 'ru-RU' });
        expect(result.lt.children.map((node) => node.value)).toEqual(['Январь', 'Февраль', 'Март', 'Декабрь']);
        expect(result.tt.children.map((node) => node.value)).toEqual(['Понедельник', 'Четверг', 'Суббота', 'Воскресенье']);
    });

    test('builds row and column trees with collapsed subtotals', () => {
        const data = [
            { region: 'East', city: 'Boston', year: '2024', sales_sum: 9 },
            { region: 'West', city: 'Seattle', year: '2024', sales_sum: 18 },
            { region: 'West', city: 'San Francisco', year: '2024', sales_sum: 12 },
        ];
        const result = buildPivotTable(
            [dimension('region'), dimension('city')],
            [dimension('year')],
            data,
            [{ region: 'West', year: '2024', sales_sum: 30 }],
            [createPivotPathKey([{ key: 'region', value: 'West' }])],
            false
        );

        expect(result.lt.children.find((node) => node.value === 'West')?.isCollapsed).toBe(true);
        expect(result.tt.children.map((node) => node.value)).toEqual(['2024']);
        expect(materializeMetricMatrix(result.lt, result.tt, result.cube).map((row) => row[0]?.sales_sum)).toEqual([9, 30]);
    });

    test('sorts the opposite axis using the selected measure', () => {
        const data = [
            { region: 'East', year: '2024', sales_sum: 9 },
            { region: 'West', year: '2024', sales_sum: 30 },
        ];
        const result = buildPivotTable([dimension('region')], [dimension('year')], data, [], [], false, {
            fid: 'sales_sum',
            mode: 'row',
            type: 'descending',
        });

        expect(result.lt.children.map((node) => node.value)).toEqual(['West', 'East']);
    });

    test.each([
        { mode: 'row' as const, dimsInRow: [dimension('region')], dimsInColumn: [dimension('year')] },
        { mode: 'column' as const, dimsInRow: [dimension('region')], dimsInColumn: [dimension('year')] },
    ])('builds an empty model without throwing when $mode sorting is active', ({ mode, dimsInRow, dimsInColumn }) => {
        const result = buildPivotTable(dimsInRow, dimsInColumn, [], [], [], false, {
            fid: 'sales_sum',
            mode,
            type: 'descending',
        });

        expect(result.lt.children).toEqual([]);
        expect(result.tt.children).toEqual([]);
        expect(materializeMetricMatrix(result.lt, result.tt, result.cube)).toEqual([[undefined]]);
    });
});
