import type { IViewField } from '../../interfaces';
import { channelEncode } from './encode';
import { NULL_FIELD } from './field';

const quiet = {
    color: NULL_FIELD,
    opacity: NULL_FIELD,
    size: NULL_FIELD,
    shape: NULL_FIELD,
    xOffset: NULL_FIELD,
    yOffset: NULL_FIELD,
    row: NULL_FIELD,
    column: NULL_FIELD,
    theta: NULL_FIELD,
    radius: NULL_FIELD,
    details: [] as IViewField[],
    text: NULL_FIELD,
};

describe('channelEncode category order', () => {
    test('sets a nominal axis sort to the detected domain', () => {
        const hour: IViewField = { fid: 'hour', name: 'Час', analyticType: 'dimension', semanticType: 'nominal' };
        const encoding = channelEncode({
            geomType: 'bar',
            x: hour,
            y: NULL_FIELD,
            ...quiet,
            locale: 'ru-RU',
            dataSource: [{ hour: '17' }, { hour: '7' }, { hour: '0' }],
        });
        expect(encoding.x.sort).toEqual(['0', '7', '17']);
    });

    test('keeps measure sort when the shelf field asks for it', () => {
        const hour: IViewField = { fid: 'hour', name: 'Час', analyticType: 'dimension', semanticType: 'nominal', sort: 'ascending' };
        const load: IViewField = { fid: 'load', name: 'Нагрузка', analyticType: 'measure', semanticType: 'quantitative', aggName: 'sum' };
        const encoding = channelEncode({
            geomType: 'bar',
            x: hour,
            y: load,
            ...quiet,
            locale: 'ru-RU',
            dataSource: [{ hour: '17' }, { hour: '0' }],
        });
        expect(encoding.x.sort).toEqual({ encoding: 'y', order: 'ascending' });
    });

    test('sets a temporal weekday axis to the calendar domain', () => {
        const weekday: IViewField = { fid: 'weekday', name: 'День', analyticType: 'dimension', semanticType: 'temporal' };
        const encoding = channelEncode({
            geomType: 'bar',
            x: weekday,
            y: NULL_FIELD,
            ...quiet,
            locale: 'ru-RU',
            dataSource: [{ weekday: 'Воскресенье' }, { weekday: 'Понедельник' }, { weekday: 'Среда' }],
        });
        expect(encoding.x.sort).toEqual(['Понедельник', 'Среда', 'Воскресенье']);
    });
});
