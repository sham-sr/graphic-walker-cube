import { listCategoryCalendars, registerCategoryCalendar, unregisterCategoryCalendar } from './calendars';
import { resolveCategoryDomain } from './categoryOrder';

const nominal = { fid: 'label', semanticType: 'nominal' as const };
const temporal = { fid: 'when', semanticType: 'temporal' as const };

function domain(values: unknown[], extra?: Partial<Omit<Parameters<typeof resolveCategoryDomain>[0], 'values'>>) {
    return resolveCategoryDomain({ field: nominal, values, locale: 'ru-RU', ...extra }).values;
}

describe('resolveCategoryDomain', () => {
    test('sorts numeric strings as numbers', () => {
        expect(domain(['17', '7', '6', '18', '0', '3', '1', '2'])).toEqual(['0', '1', '2', '3', '6', '7', '17', '18']);
    });

    test('orders Russian and English month names and keeps the original label', () => {
        expect(domain(['март', 'январь', 'Декабрь'])).toEqual(['январь', 'март', 'Декабрь']);
        expect(domain(['Mar', 'January', 'dec'], { locale: 'en-US' })).toEqual(['January', 'Mar', 'dec']);
    });

    test('starts Russian weeks on Monday and English weeks on Sunday', () => {
        expect(domain(['суббота', 'четверг', 'пятница', 'вторник', 'среда', 'понедельник', 'воскресенье'])).toEqual([
            'понедельник',
            'вторник',
            'среда',
            'четверг',
            'пятница',
            'суббота',
            'воскресенье',
        ]);
        expect(domain(['Saturday', 'Thursday', 'Friday', 'Tuesday', 'Wednesday', 'Monday', 'Sunday'], { locale: 'en-US' })).toEqual([
            'Sunday',
            'Monday',
            'Tuesday',
            'Wednesday',
            'Thursday',
            'Friday',
            'Saturday',
        ]);
    });

    test('orders quarter labels from one language', () => {
        expect(domain(['3 кв', '1 кв', 'кв. 4', 'кв. 2'])).toEqual(['1 кв', 'кв. 2', '3 кв', 'кв. 4']);
        expect(domain(['3 квартал', '1 квартал', '4 квартал'], { locale: 'ru-RU' })).toEqual(['1 квартал', '3 квартал', '4 квартал']);
        expect(domain(['Q3', 'Q1', 'q4'], { locale: 'en-US' })).toEqual(['Q1', 'Q3', 'q4']);
    });

    test('calendar-sorts known weekdays when abbreviations or empty labels are mixed in', () => {
        expect(domain(['Понедельник', 'Пн.', 'Вторник', ''])).toEqual(['Понедельник', 'Пн.', 'Вторник', '']);
        expect(domain(['понедельник', 'вторник', 'пн', 'ср'])).toEqual(['понедельник', 'пн', 'вторник', 'ср']);
    });

    test('rejects a dictionary when one value is foreign', () => {
        expect(domain(['март', 'январь', 'Итого'])).toEqual(['Итого', 'март', 'январь']);
        expect(domain(['March', 'март'])).toEqual(['март', 'March']);
    });

    test('keeps temporal values in chronological order', () => {
        expect(domain(['2025-03-01', '2025-01-15', '2024-12-01'], { field: temporal })).toEqual(['2024-12-01', '2025-01-15', '2025-03-01']);
    });

    test('appends unknown station labels and sorts that tail naturally', () => {
        const values = resolveCategoryDomain({
            field: nominal,
            values: ['Южная', 'Северная', 'Новая', 'Центральная'],
            locale: 'ru-RU',
            datasetOrder: { order: ['Северная', 'Центральная', 'Южная'] },
        }).values;
        expect(values).toEqual(['Северная', 'Центральная', 'Южная', 'Новая']);
    });

    test('a conflicting rank falls through to the calendar', () => {
        const values = resolveCategoryDomain({
            field: nominal,
            values: ['Март', 'Январь'],
            rows: [
                { label: 'Март', rank: 1 },
                { label: 'Март', rank: 2 },
                { label: 'Январь', rank: 0 },
            ],
            locale: 'ru-RU',
            datasetOrder: { by: 'rank' },
        }).values;
        expect(values).toEqual(['Январь', 'Март']);
    });

    test('a trailing NUL does not cancel a month calendar', () => {
        expect(domain(['Март\u0000', 'Январь'])).toEqual(['Январь', 'Март\u0000']);
    });

    test('drops a rank key when one label has two ranks', () => {
        const values = resolveCategoryDomain({
            field: nominal,
            values: ['А', 'Б'],
            rows: [
                { label: 'А', rank: 2 },
                { label: 'А', rank: 1 },
                { label: 'Б', rank: 0 },
            ],
            locale: 'ru-RU',
            datasetOrder: { by: 'rank' },
        }).values;
        expect(values).toEqual(['А', 'Б']);
    });

    test('sorts by a single rank and lets a sheet list win', () => {
        const ranked = resolveCategoryDomain({
            field: nominal,
            values: ['А', 'Б', 'В'],
            rows: [
                { label: 'А', rank: 2 },
                { label: 'Б', rank: 0 },
                { label: 'В', rank: 1 },
            ],
            locale: 'ru-RU',
            datasetOrder: { by: 'rank' },
        }).values;
        expect(ranked).toEqual(['Б', 'В', 'А']);

        const sheet = resolveCategoryDomain({
            field: nominal,
            values: ['А', 'Б', 'В'],
            rows: [
                { label: 'А', rank: 2 },
                { label: 'Б', rank: 0 },
            ],
            locale: 'ru-RU',
            datasetOrder: { by: 'rank' },
            sheetOrder: { order: ['В', 'А'] },
        }).values;
        expect(sheet).toEqual(['В', 'А', 'Б']);
    });

    test('orders Intl ru-RU short month names in calendar order', () => {
        const shuffled = ['дек.', 'нояб.', 'окт.', 'сент.', 'авг.', 'июль', 'июнь', 'май', 'апр.', 'март', 'февр.', 'янв.'];
        const expected = ['янв.', 'февр.', 'март', 'апр.', 'май', 'июнь', 'июль', 'авг.', 'сент.', 'окт.', 'нояб.', 'дек.'];
        expect(domain(shuffled)).toEqual(expected);
    });

    test('orders genitive Russian month names', () => {
        expect(domain(['марта', 'января', 'декабря'])).toEqual(['января', 'марта', 'декабря']);
    });

    test('orders three-letter Russian weekday abbreviations', () => {
        expect(domain(['вск', 'сбт', 'птн', 'чтв', 'срд', 'втр', 'пнд'])).toEqual(['пнд', 'втр', 'срд', 'чтв', 'птн', 'сбт', 'вск']);
    });

    test('orders Russian and English quarter variants including roman and compact keys', () => {
        expect(domain(['iv кв', 'i кв.', 'кв.3', 'кв 2'])).toEqual(['i кв.', 'кв 2', 'кв.3', 'iv кв']);
        expect(domain(['4th quarter', '1st quarter', 'qtr 2', '1q'], { locale: 'en-US' })).toEqual([
            '1st quarter',
            '1q',
            'qtr 2',
            '4th quarter',
        ]);
    });

    test('orders half-year labels', () => {
        expect(domain(['2 пг', '1 полугодие', 'ii полугодие'])).toEqual(['1 полугодие', 'ii полугодие', '2 пг']);
        expect(domain(['second half', 'h1', '2nd half'], { locale: 'en-US' })).toEqual(['h1', '2nd half', 'second half']);
    });

    test('orders month-year and quarter-year composites chronologically', () => {
        expect(domain(['март 2024', 'янв. 2024 г.', 'март 2023', 'Январь 2024'])).toEqual(['март 2023', 'янв. 2024 г.', 'Январь 2024', 'март 2024']);
        expect(domain(['2024 Jan', 'Jan 2024', 'January 2024', 'Jan-24'], { locale: 'en-US' })).toEqual([
            '2024 Jan',
            'Jan 2024',
            'Jan-24',
            'January 2024',
        ]);
        expect(domain(['2024 Q1', 'Q1 2024', '2023 Q4', '2024-Q1'], { locale: 'en-US' })).toEqual(['2023 Q4', '2024 Q1', '2024-Q1', 'Q1 2024']);
        expect(domain(['1 кв. 2024', '3 кв 2023'])).toEqual(['3 кв 2023', '1 кв. 2024']);
        expect(domain(['1 полугодие 2024', '2 полугодие 2023'])).toEqual(['2 полугодие 2023', '1 полугодие 2024']);
        expect(domain(['H1 2024', 'H2 2023'], { locale: 'en-US' })).toEqual(['H2 2023', 'H1 2024']);
    });

    test('orders week labels by year then week number', () => {
        expect(domain(['2024-W05', 'W5 2024', '2024 W6', '2023-W50'], { locale: 'en-US' })).toEqual(['2023-W50', '2024-W05', 'W5 2024', '2024 W6']);
        expect(domain(['Week 5', 'W05', 'W7', 'W6'], { locale: 'en-US' })).toEqual(['W05', 'Week 5', 'W6', 'W7']);
        expect(domain(['5 неделя 2024', '10 неделя 2023'])).toEqual(['10 неделя 2023', '5 неделя 2024']);
        expect(domain(['Неделя 5', 'нед. 10', 'нед. 6'])).toEqual(['Неделя 5', 'нед. 6', 'нед. 10']);
    });

    test('orders ISO month, date, and datetime on nominal fields', () => {
        expect(domain(['2024-03', '2023-12', '2024-01'])).toEqual(['2023-12', '2024-01', '2024-03']);
        expect(domain(['2024-03-15', '2024-03-01', '2024-02-28'])).toEqual(['2024-02-28', '2024-03-01', '2024-03-15']);
        expect(domain(['2024-03-01 10:00', '2024-03-01 08:30', '2024-03-01 09:00'])).toEqual([
            '2024-03-01 08:30',
            '2024-03-01 09:00',
            '2024-03-01 10:00',
        ]);
    });

    test('orders dotted Russian dates with day-month-year semantics', () => {
        expect(domain(['13.03.2024', '01.03.2024', '28.02.2024', '01.03.24'])).toEqual(['28.02.2024', '01.03.24', '01.03.2024', '13.03.2024']);
    });

    test('orders fiscal and suffixed year labels', () => {
        expect(domain(['FY2024', '2024 г.', '2023 год', 'FY24'], { locale: 'en-US' })).toEqual(['2023 год', '2024 г.', 'FY24', 'FY2024']);
    });

    test('orders a full Intl ru-RU month-year list, where alphabetic order would differ', () => {
        const months = ['янв.', 'февр.', 'март', 'апр.', 'май', 'июнь', 'июль', 'авг.', 'сент.', 'окт.', 'нояб.', 'дек.'];
        const expected = months.map((month) => `${month} 2024 г.`);
        expect(domain([...expected].reverse())).toEqual(expected);
        expect(domain(['2 пг 2024', '1 пг 2024'])).toEqual(['1 пг 2024', '2 пг 2024']);
    });

    test('recognizes «год» and week labels without a year, where natural order would differ', () => {
        expect(domain(['2024 год', 'FY2023', '2022 г.'])).toEqual(['2022 г.', 'FY2023', '2024 год']);
        expect(domain(['10 неделя', '5 неделя', 'нед. 7'])).toEqual(['5 неделя', 'нед. 7', '10 неделя']);
    });

    test('does not treat version numbers as dotted dates', () => {
        expect(domain(['1.10.3', '1.2.10', '1.2.9'])).toEqual(['1.2.9', '1.2.10', '1.10.3']);
    });

    test('foreign value cancels composite and week detectors', () => {
        expect(domain(['март 2024', 'Итого'])).toEqual(['Итого', 'март 2024']);
        expect(domain(['2024-W05', 'extra'], { locale: 'en-US' })).toEqual(['2024-W05', 'extra']);
    });

    test('puts ignorable labels last with numeric hours', () => {
        expect(domain(['17', '7', '(пусто)', '3', '—'])).toEqual(['3', '7', '17', '(пусто)', '—']);
    });

    test('accepts a registered calendar without changing the comparator', () => {
        registerCategoryCalendar({
            id: 'de',
            weekStartsOn: 1,
            months: [
                ['januar'],
                ['februar'],
                ['märz'],
                ['april'],
                ['mai'],
                ['juni'],
                ['juli'],
                ['august'],
                ['september'],
                ['oktober'],
                ['november'],
                ['dezember'],
            ],
            weekdays: [['sonntag'], ['montag'], ['dienstag'], ['mittwoch'], ['donnerstag'], ['freitag'], ['samstag']],
            quarters: [['q1'], ['q2'], ['q3'], ['q4']],
        });
        try {
            expect(domain(['März', 'Januar', 'Dezember'], { locale: 'de-DE' })).toEqual(['Januar', 'März', 'Dezember']);
            expect(domain(['март', 'январь'])).toEqual(['январь', 'март']);
        } finally {
            unregisterCategoryCalendar('de');
        }
    });

    test('reseeds builtin calendars after the registry is emptied', () => {
        unregisterCategoryCalendar('ru');
        unregisterCategoryCalendar('en');
        expect(listCategoryCalendars().map((calendar) => calendar.id).sort()).toEqual(['en', 'ru']);
        expect(domain(['пятница', 'понедельник', 'среда'])).toEqual(['понедельник', 'среда', 'пятница']);
    });
});
