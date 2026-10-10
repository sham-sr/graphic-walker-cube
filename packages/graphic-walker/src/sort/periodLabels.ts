import { listCategoryCalendars, type CategoryCalendar } from './calendars';

export type CalendarFacet = 'months' | 'weekdays' | 'quarters' | 'halves';

/** Нулевые и невидимые символы из выгрузки не должны срывать словарь. */
const INVISIBLE = /[\u0000\u00ad\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g;

/** Подпись для сравнения: невидимые символы, регистр, хвостовые точки, лишние пробелы. */
export function normalizeLabel(value: string): string {
    return value.normalize('NFKC').replace(INVISIBLE, '').trim().replace(/\s+/g, ' ').replace(/\.+$/, '').toLowerCase();
}

/** Кварталы и полугодия: дополнительно схлопываем точки между словами и цифрами. */
export function normalizeCompactKey(value: string): string {
    const base = normalizeLabel(value).replace(/\./g, ' ');
    return base.replace(/\s+/g, ' ').trim();
}

const IGNORABLE_RANK: Record<string, number> = {
    '': 0,
    null: 1,
    '(пусто)': 2,
    '-': 3,
    '—': 4,
};

export function isIgnorableCategoryLabel(label: string): boolean {
    const key = normalizeLabel(label);
    return key in IGNORABLE_RANK;
}

export function compareIgnorableLabels(locale: string, left: string, right: string): number {
    const rankLeft = IGNORABLE_RANK[normalizeLabel(left)] ?? 99;
    const rankRight = IGNORABLE_RANK[normalizeLabel(right)] ?? 99;
    if (rankLeft !== rankRight) return rankLeft - rankRight;
    return left.localeCompare(right, locale, { numeric: true, sensitivity: 'base' });
}

function facetGroups(calendar: CategoryCalendar, facet: CalendarFacet): readonly (readonly string[])[] {
    if (facet === 'halves') return calendar.halves ?? [];
    return calendar[facet];
}

export function facetIndex(calendar: CategoryCalendar, facet: CalendarFacet, label: string): number | undefined {
    const key = facet === 'quarters' || facet === 'halves' ? normalizeCompactKey(label) : normalizeLabel(label);
    const groups = facetGroups(calendar, facet);
    for (let index = 0; index < groups.length; index += 1) {
        const matchKey = (alias: string) =>
            facet === 'quarters' || facet === 'halves' ? normalizeCompactKey(alias) === key : normalizeLabel(alias) === key;
        if (groups[index].some(matchKey)) return index;
    }
    return undefined;
}

export function facetAliasPriority(calendar: CategoryCalendar, facet: CalendarFacet, label: string): number {
    const key = facet === 'quarters' || facet === 'halves' ? normalizeCompactKey(label) : normalizeLabel(label);
    const groups = facetGroups(calendar, facet);
    for (const aliases of groups) {
        for (let index = 0; index < aliases.length; index += 1) {
            const aliasKey =
                facet === 'quarters' || facet === 'halves' ? normalizeCompactKey(aliases[index]) : normalizeLabel(aliases[index]);
            if (aliasKey === key) return index;
        }
    }
    return Number.MAX_SAFE_INTEGER;
}

export function languageOf(locale: string): string {
    return locale.toLowerCase().split('-')[0] ?? locale.toLowerCase();
}

const ISO_MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;
const ISO_DATE = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const ISO_DATETIME =
    /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])[ T]([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/;

/** День и месяц всегда двузначные: `1.2.10` — номер версии, а не дата. */
const DOTTED_RU = /^(\d{2})\.(\d{2})\.(\d{2}|\d{4})(?:\s+([01]?\d|2[0-3]):([0-5]\d))?$/;

/** Хвост «г.» / «год» / «года» снимается только после цифры года, иначе «авг» превратится в «ав». */
const YEAR_SUFFIX = /(\d)\s*(?:г\.?|года?)$/i;

function stripYearSuffix(value: string): string {
    return value.trim().replace(YEAR_SUFFIX, '$1').trim();
}
const FY_PREFIX = /^fy\s*/i;

function expandYearTwo(two: number): number {
    return two >= 70 ? 1900 + two : 2000 + two;
}

function validDateParts(year: number, month: number, day: number): boolean {
    if (month < 1 || month > 12 || day < 1) return false;
    const last = new Date(year, month, 0).getDate();
    return day <= last;
}

function utcTime(year: number, month: number, day: number, hour = 0, minute = 0, second = 0): number {
    return Date.UTC(year, month - 1, day, hour, minute, second);
}

export function parseIsoMonth(label: string): number | undefined {
    const m = label.trim().match(ISO_MONTH);
    if (!m) return undefined;
    const year = Number(m[1]);
    const month = Number(m[2]);
    return year * 12 + (month - 1);
}

export function parseIsoDate(label: string): number | undefined {
    const m = label.trim().match(ISO_DATE);
    if (!m) return undefined;
    const year = Number(m[1]);
    const month = Number(m[2]);
    const day = Number(m[3]);
    if (!validDateParts(year, month, day)) return undefined;
    return utcTime(year, month, day);
}

export function parseIsoDateTime(label: string): number | undefined {
    const m = label.trim().match(ISO_DATETIME);
    if (!m) return undefined;
    const year = Number(m[1]);
    const month = Number(m[2]);
    const day = Number(m[3]);
    const hour = Number(m[4]);
    const minute = Number(m[5]);
    const second = m[6] ? Number(m[6]) : 0;
    if (!validDateParts(year, month, day)) return undefined;
    return utcTime(year, month, day, hour, minute, second);
}

export function parseDottedRuDate(label: string): number | undefined {
    const m = label.trim().match(DOTTED_RU);
    if (!m) return undefined;
    const day = Number(m[1]);
    const month = Number(m[2]);
    let year = Number(m[3]);
    if (m[3].length === 2) year = expandYearTwo(year);
    const hour = m[4] !== undefined ? Number(m[4]) : 0;
    const minute = m[5] !== undefined ? Number(m[5]) : 0;
    if (!validDateParts(year, month, day)) return undefined;
    return utcTime(year, month, day, hour, minute);
}

export function parseYearLabel(label: string): number | undefined {
    let rest = label.trim();
    if (/^-?\d+(\.\d+)?$/.test(rest)) return undefined;
    let fy = false;
    if (FY_PREFIX.test(rest)) {
        fy = true;
        rest = rest.replace(FY_PREFIX, '');
    }
    rest = stripYearSuffix(rest);
    const four = rest.match(/^(\d{4})$/);
    if (four) return Number(four[1]);
    const two = rest.match(/^(\d{2})$/);
    if (two && fy) return expandYearTwo(Number(two[1]));
    return undefined;
}

export interface WeekParts {
    year: number;
    week: number;
}

const ISO_WEEK = /^(\d{4})-w(\d{1,2})$/i;

export function parseWeekLabel(label: string): WeekParts | undefined {
    const raw = label.trim();
    const iso = raw.match(ISO_WEEK);
    if (iso) {
        const year = Number(iso[1]);
        const week = Number(iso[2]);
        if (week >= 1 && week <= 53) return { year, week };
        return undefined;
    }
    const wTailYear = raw.match(/^w(\d{1,2})\s+(\d{4})$/i);
    if (wTailYear) {
        const week = Number(wTailYear[1]);
        if (week >= 1 && week <= 53) return { year: Number(wTailYear[2]), week };
    }
    const yearW = raw.match(/^(\d{4})[\s/-]+w(\d{1,2})$/i);
    if (yearW) {
        const week = Number(yearW[2]);
        if (week >= 1 && week <= 53) return { year: Number(yearW[1]), week };
    }
    const weekEn = raw.match(/^(?:(\d{4})\s+)?(?:week|wk)\s*(\d{1,2})$/i);
    if (weekEn) {
        const week = Number(weekEn[2]);
        const year = weekEn[1] ? Number(weekEn[1]) : 0;
        if (week >= 1 && week <= 53) return { year, week };
    }
    const wOnly = raw.match(/^w(\d{1,2})$/i);
    if (wOnly) {
        const week = Number(wOnly[1]);
        if (week >= 1 && week <= 53) return { year: 0, week };
    }
    const ruHead = raw.match(/^(?:(\d{4})\s+)?(?:неделя|нед)\.?\s*(\d{1,2})$/i);
    if (ruHead) {
        const week = Number(ruHead[2]);
        const year = ruHead[1] ? Number(ruHead[1]) : 0;
        if (week >= 1 && week <= 53) return { year, week };
    }
    const ruTail = raw.match(/^(\d{1,2})\s*(?:неделя|нед)\.?(?:\s*(\d{4}))?$/i);
    if (ruTail) {
        const week = Number(ruTail[1]);
        const year = ruTail[2] ? Number(ruTail[2]) : 0;
        if (week >= 1 && week <= 53) return { year, week };
    }
    return undefined;
}

function weekSortKey(parts: WeekParts): number {
    return parts.year * 100 + parts.week;
}

export type PeriodYearFacet = 'months' | 'quarters' | 'halves';

export interface PeriodYearParts {
    facet: PeriodYearFacet;
    periodIndex: number;
    year: number;
    calendarId: string;
}

const ROMANQuarter: Record<string, number> = { i: 0, ii: 1, iii: 2, iv: 3 };

function resolvePeriodToken(token: string, locale: string): Omit<PeriodYearParts, 'year'> | undefined {
    const trimmed = token.trim();
    const language = languageOf(locale);
    const facets: PeriodYearFacet[] = ['months', 'quarters', 'halves'];
    const calendars = listCategoryCalendars();
    const ordered = [...calendars.filter((c) => c.id === language), ...calendars.filter((c) => c.id !== language)];
    for (const calendar of ordered) {
        for (const facet of facets) {
            const idx = facetIndex(calendar, facet, trimmed);
            if (idx !== undefined) return { facet, periodIndex: idx, calendarId: calendar.id };
        }
    }
    const romanQ = trimmed.match(/^(i{1,3}|iv)\s*(?:кв|квартал)?$/i);
    if (romanQ) {
        const key = romanQ[1].toLowerCase();
        const periodIndex = ROMANQuarter[key];
        if (periodIndex !== undefined) {
            return { facet: 'quarters', periodIndex, calendarId: 'ru' };
        }
    }
    const enQ = trimmed.match(/^q(\d)$/i);
    if (enQ) {
        const periodIndex = Number(enQ[1]) - 1;
        if (periodIndex >= 0 && periodIndex <= 3) return { facet: 'quarters', periodIndex, calendarId: 'en' };
    }
    return undefined;
}

/** Метка «период + год» в любом порядке; период — из зарегистрированных календарей. */
export function parsePeriodYearLabel(label: string, locale: string): PeriodYearParts | undefined {
    const rest = stripYearSuffix(label);
    const hyphen = rest.match(/^(.+?)[\-/'’](\d{2})$/i);
    if (hyphen) {
        const period = resolvePeriodToken(hyphen[1], locale);
        const year = expandYearTwo(Number(hyphen[2]));
        if (period) return { ...period, year };
    }
    const yearMatch = rest.match(/\b(\d{4})\b/);
    if (!yearMatch) return undefined;
    const year = Number(yearMatch[1]);
    const idx = yearMatch.index ?? 0;
    const before = rest.slice(0, idx).replace(/[\s\-/.]+$/, '').trim();
    const after = rest.slice(idx + 4).replace(/^[\s\-/.]+/, '').trim();
    const periodRaw = before.length > 0 ? before : after;
    if (!periodRaw) return undefined;
    const period = resolvePeriodToken(periodRaw, locale);
    if (!period) return undefined;
    return { ...period, year };
}

function periodYearKey(p: PeriodYearParts): number {
    return p.year * 100 + p.periodIndex;
}

function sortByParsed<T>(
    labels: string[],
    locale: string,
    parse: (label: string) => T | undefined,
    keyOf: (parsed: T) => number
): string[] | undefined {
    const eligible = labels.filter((l) => !isIgnorableCategoryLabel(l));
    if (eligible.length === 0) return undefined;
    const parsed = new Map<string, T>();
    for (const label of eligible) {
        const p = parse(label);
        if (p === undefined) return undefined;
        parsed.set(label, p);
    }
    const ignorable = labels.filter(isIgnorableCategoryLabel);
    const known = [...eligible].sort((a, b) => {
        const ka = keyOf(parsed.get(a)!);
        const kb = keyOf(parsed.get(b)!);
        if (ka !== kb) return ka - kb;
        return a.localeCompare(b, locale, { numeric: true, sensitivity: 'base' });
    });
    ignorable.sort((a, b) => compareIgnorableLabels(locale, a, b));
    return [...known, ...ignorable];
}

export function sortIsoMonthLabels(labels: string[], locale: string): string[] | undefined {
    return sortByParsed(labels, locale, parseIsoMonth, (k) => k);
}

export function sortIsoDateLabels(labels: string[], locale: string): string[] | undefined {
    return sortByParsed(labels, locale, parseIsoDate, (k) => k);
}

export function sortIsoDateTimeLabels(labels: string[], locale: string): string[] | undefined {
    return sortByParsed(labels, locale, parseIsoDateTime, (k) => k);
}

export function sortDottedRuDateLabels(labels: string[], locale: string): string[] | undefined {
    return sortByParsed(labels, locale, parseDottedRuDate, (k) => k);
}

export function sortYearLabels(labels: string[], locale: string): string[] | undefined {
    return sortByParsed(labels, locale, parseYearLabel, (y) => y);
}

export function sortWeekLabels(labels: string[], locale: string): string[] | undefined {
    const eligible = labels.filter((l) => !isIgnorableCategoryLabel(l));
    if (eligible.length === 0) return undefined;
    const parsed = new Map<string, WeekParts>();
    let hasExplicitYear = false;
    let hasImplicitYear = false;
    for (const label of eligible) {
        const p = parseWeekLabel(label);
        if (!p) return undefined;
        if (p.year === 0) hasImplicitYear = true;
        else hasExplicitYear = true;
        parsed.set(label, p);
    }
    if (hasExplicitYear && hasImplicitYear) return undefined;
    return sortByParsed(labels, locale, parseWeekLabel, weekSortKey);
}

export function sortPeriodYearLabels(labels: string[], locale: string): string[] | undefined {
    const eligible = labels.filter((l) => !isIgnorableCategoryLabel(l));
    if (eligible.length === 0) return undefined;
    const parsed = new Map<string, PeriodYearParts>();
    let facet: PeriodYearFacet | undefined;
    let calendarId: string | undefined;
    for (const label of eligible) {
        const p = parsePeriodYearLabel(label, locale);
        if (!p) return undefined;
        if (facet === undefined) {
            facet = p.facet;
            calendarId = p.calendarId;
        } else if (p.facet !== facet || p.calendarId !== calendarId) return undefined;
        parsed.set(label, p);
    }
    const ignorable = labels.filter(isIgnorableCategoryLabel);
    const known = [...eligible].sort((a, b) => {
        const ka = periodYearKey(parsed.get(a)!);
        const kb = periodYearKey(parsed.get(b)!);
        if (ka !== kb) return ka - kb;
        return a.localeCompare(b, locale, { numeric: true, sensitivity: 'base' });
    });
    ignorable.sort((a, b) => compareIgnorableLabels(locale, a, b));
    return [...known, ...ignorable];
}

export function preferLocaleMatch(
    labels: readonly string[],
    locale: string
): { calendar: CategoryCalendar; facet: CalendarFacet } | undefined {
    const eligible = labels.filter((label) => !isIgnorableCategoryLabel(label));
    if (eligible.length === 0) return undefined;
    const facets: CalendarFacet[] = ['months', 'weekdays', 'quarters', 'halves'];
    const matches: Array<{ calendar: CategoryCalendar; facet: CalendarFacet }> = [];
    for (const calendar of listCategoryCalendars()) {
        for (const facet of facets) {
            if (facet === 'halves' && !calendar.halves?.length) continue;
            if (eligible.every((label) => facetIndex(calendar, facet, label) !== undefined)) {
                matches.push({ calendar, facet });
            }
        }
    }
    if (matches.length === 0) return undefined;
    const language = languageOf(locale);
    const preferred = matches.filter((match) => match.calendar.id === language);
    if (preferred.length === 1) return preferred[0];
    if (matches.length === 1) return matches[0];
    return undefined;
}
