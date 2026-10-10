/** Один язык стандартных категорий. Новая локаль добавляется через registerCategoryCalendar. */
export interface CategoryCalendar {
    /** Короткий код языка, например `ru` или `en`. */
    id: string;
    /** 0 — неделя с воскресенья, 1 — с понедельника. */
    weekStartsOn: 0 | 1;
    /** 12 месяцев, индекс 0 — январь. В каждой группе полные и краткие имена. */
    months: readonly (readonly string[])[];
    /** 7 дней, индекс 0 — воскресенье (`Date#getDay`). */
    weekdays: readonly (readonly string[])[];
    /** 4 квартала, индекс 0 — первый. */
    quarters: readonly (readonly string[])[];
    /** 2 полугодия; поле опционально для обратной совместимости регистрации. */
    halves?: readonly (readonly string[])[];
}

const calendars = new Map<string, CategoryCalendar>();

export function registerCategoryCalendar(calendar: CategoryCalendar): void {
    calendars.set(calendar.id, calendar);
}

export function unregisterCategoryCalendar(id: string): void {
    calendars.delete(id);
}

export function listCategoryCalendars(): readonly CategoryCalendar[] {
    // Воркер сводной собирается отдельным графом: sideEffects:false выкидывает
    // register() внизу файла, и Map остаётся пустой. Сеем при первом чтении.
    if (calendars.size === 0) {
        registerCategoryCalendar(RU);
        registerCategoryCalendar(EN);
    }
    return [...calendars.values()];
}

const RU: CategoryCalendar = {
    id: 'ru',
    weekStartsOn: 1,
    months: [
        ['январь', 'января', 'янв'],
        ['февраль', 'февраля', 'фев', 'февр'],
        ['март', 'марта', 'мар'],
        ['апрель', 'апреля', 'апр'],
        ['май', 'мая'],
        ['июнь', 'июня', 'июн'],
        ['июль', 'июля', 'июл'],
        ['август', 'августа', 'авг'],
        ['сентябрь', 'сентября', 'сен', 'сент'],
        ['октябрь', 'октября', 'окт'],
        ['ноябрь', 'ноября', 'ноя', 'нояб'],
        ['декабрь', 'декабря', 'дек'],
    ],
    weekdays: [
        ['воскресенье', 'вс', 'вск'],
        ['понедельник', 'пн', 'пнд'],
        ['вторник', 'вт', 'втр'],
        ['среда', 'ср', 'срд'],
        ['четверг', 'чт', 'чтв'],
        ['пятница', 'пт', 'птн'],
        ['суббота', 'сб', 'сбт'],
    ],
    quarters: [
        ['1 кв', '1 кв.', 'кв 1', 'кв. 1', 'кв.1', '1 квартал', '1-й квартал', '1й квартал', 'i квартал', 'i кв'],
        ['2 кв', '2 кв.', 'кв 2', 'кв. 2', 'кв.2', '2 квартал', '2-й квартал', '2й квартал', 'ii квартал', 'ii кв'],
        ['3 кв', '3 кв.', 'кв 3', 'кв. 3', 'кв.3', '3 квартал', '3-й квартал', '3й квартал', 'iii квартал', 'iii кв'],
        ['4 кв', '4 кв.', 'кв 4', 'кв. 4', 'кв.4', '4 квартал', '4-й квартал', '4й квартал', 'iv квартал', 'iv кв'],
    ],
    halves: [
        ['1 полугодие', 'i полугодие', '1-е полугодие', '1 пг'],
        ['2 полугодие', 'ii полугодие', '2-е полугодие', '2 пг'],
    ],
};

const EN: CategoryCalendar = {
    id: 'en',
    weekStartsOn: 0,
    months: [
        ['january', 'jan'],
        ['february', 'feb'],
        ['march', 'mar'],
        ['april', 'apr'],
        ['may'],
        ['june', 'jun'],
        ['july', 'jul'],
        ['august', 'aug'],
        ['september', 'sep', 'sept'],
        ['october', 'oct'],
        ['november', 'nov'],
        ['december', 'dec'],
    ],
    weekdays: [
        ['sunday', 'sun'],
        ['monday', 'mon'],
        ['tuesday', 'tue', 'tues'],
        ['wednesday', 'wed'],
        ['thursday', 'thu', 'thur', 'thurs'],
        ['friday', 'fri'],
        ['saturday', 'sat'],
    ],
    quarters: [
        ['q1', 'qtr 1', 'qtr1', 'quarter 1', '1st quarter', '1q'],
        ['q2', 'qtr 2', 'qtr2', 'quarter 2', '2nd quarter', '2q'],
        ['q3', 'qtr 3', 'qtr3', 'quarter 3', '3rd quarter', '3q'],
        ['q4', 'qtr 4', 'qtr4', 'quarter 4', '4th quarter', '4q'],
    ],
    halves: [
        ['h1', '1st half', 'first half'],
        ['h2', '2nd half', 'second half'],
    ],
};

registerCategoryCalendar(RU);
registerCategoryCalendar(EN);
