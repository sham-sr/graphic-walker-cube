import type { IRow, IViewField } from '../../interfaces';
import { buildPivotTable } from '../../workers/buildPivotTable';
import { queryPivotTable, type PivotTableModelBuilder } from './query';

const buildModel: PivotTableModelBuilder = async (...args) => buildPivotTable(...args);

const weekdayField: IViewField = {
    fid: 'weekday',
    name: 'weekday',
    analyticType: 'dimension',
    semanticType: 'nominal',
};

const amountField: IViewField = {
    fid: 'amount',
    name: 'amount',
    analyticType: 'measure',
    semanticType: 'quantitative',
    aggName: 'sum',
};

/** Cube-style capitalized Russian weekday labels in arbitrary row order. */
const capitalizedWeekdayRows: IRow[] = [
    { weekday: 'Суббота', amount_sum: 1 },
    { weekday: 'Четверг', amount_sum: 1 },
    { weekday: 'Пятница', amount_sum: 1 },
    { weekday: 'Вторник', amount_sum: 1 },
    { weekday: 'Среда', amount_sum: 1 },
    { weekday: 'Понедельник', amount_sum: 1 },
    { weekday: 'Воскресенье', amount_sum: 1 },
];

const expectedWeekdayOrder = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];

describe('pivot table calendar sort (product path)', () => {
    test('queryPivotTable orders capitalized Russian weekdays when locale is ru-RU', async () => {
        const result = await queryPivotTable(
            {
                computation: async () => capitalizedWeekdayRows,
                fields: [weekdayField, amountField],
                rows: [weekdayField],
                columns: [amountField],
                defaultAggregated: true,
                limit: -1,
                showTableSummary: false,
                collapsedPaths: [],
                viewData: capitalizedWeekdayRows,
                locale: 'ru-RU',
            },
            buildModel
        );

        expect(result.leftTree.children.map((node) => node.value)).toEqual(expectedWeekdayOrder);
    });

    test('queryPivotTable calendar-sorts when Cube mixes full names, Пн., and null', async () => {
        const rows: IRow[] = [
            { weekday: 'Суббота', amount_sum: 1 },
            { weekday: 'Пн.', amount_sum: 2 },
            { weekday: 'Понедельник', amount_sum: 3 },
            { weekday: 'Вторник', amount_sum: 4 },
            { weekday: null, amount_sum: 0 },
        ];
        const result = await queryPivotTable(
            {
                computation: async () => rows,
                fields: [weekdayField, amountField],
                rows: [weekdayField],
                columns: [amountField],
                defaultAggregated: true,
                limit: -1,
                showTableSummary: false,
                collapsedPaths: [],
                viewData: rows,
                locale: 'ru-RU',
            },
            buildModel
        );

        expect(result.leftTree.children.map((node) => node.value)).toEqual(['Понедельник', 'Пн.', 'Вторник', 'Суббота', null]);
    });

    test('queryPivotTable keeps calendar order when a null weekday row is present', async () => {
        const rows: IRow[] = [...capitalizedWeekdayRows, { weekday: null, amount_sum: 0 }];
        const result = await queryPivotTable(
            {
                computation: async () => rows,
                fields: [weekdayField, amountField],
                rows: [weekdayField],
                columns: [amountField],
                defaultAggregated: true,
                limit: -1,
                showTableSummary: false,
                collapsedPaths: [],
                viewData: rows,
                locale: 'ru-RU',
            },
            buildModel
        );

        expect(result.leftTree.children.map((node) => node.value)).toEqual([...expectedWeekdayOrder, null]);
    });
});
