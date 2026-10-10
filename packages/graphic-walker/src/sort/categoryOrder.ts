import type { CategoryOrder, IField, IRow } from '../interfaces';
import {
    compareIgnorableLabels,
    facetAliasPriority,
    facetIndex,
    isIgnorableCategoryLabel,
    normalizeLabel,
    preferLocaleMatch,
    sortDottedRuDateLabels,
    sortIsoDateLabels,
    sortIsoDateTimeLabels,
    sortIsoMonthLabels,
    sortPeriodYearLabels,
    sortWeekLabels,
    sortYearLabels,
    type CalendarFacet,
} from './periodLabels';
import type { CategoryCalendar } from './calendars';

export interface CategoryDomain {
    values: string[];
    compare: (left: unknown, right: unknown) => number;
}

export interface CategoryDomainInput {
    field: Pick<IField, 'fid' | 'semanticType'>;
    values: readonly unknown[];
    rows?: readonly IRow[];
    locale?: string;
    /** Порядок полки этого листа. Побеждает порядок измерения. */
    sheetOrder?: CategoryOrder;
    /** Порядок измерения, общий для датасета. */
    datasetOrder?: CategoryOrder;
}

function uniqueLabels(values: readonly unknown[]): string[] {
    const seen = new Set<string>();
    const labels: string[] = [];
    for (const value of values) {
        const label = value === null || value === undefined ? '' : String(value);
        if (seen.has(label)) continue;
        seen.add(label);
        labels.push(label);
    }
    return labels;
}

function naturalCompare(locale: string, left: string, right: string): number {
    return left.localeCompare(right, locale, { numeric: true, sensitivity: 'base' });
}

function compareByDomain(domain: readonly string[], locale: string): (left: unknown, right: unknown) => number {
    const index = new Map(domain.map((value, position) => [value, position]));
    return (left, right) => {
        const a = left === null || left === undefined ? '' : String(left);
        const b = right === null || right === undefined ? '' : String(right);
        const ia = index.get(a);
        const ib = index.get(b);
        if (ia !== undefined && ib !== undefined && ia !== ib) return ia - ib;
        if (ia !== undefined && ib === undefined) return -1;
        if (ia === undefined && ib !== undefined) return 1;
        return naturalCompare(locale, a, b);
    };
}

function domainOf(values: string[], locale: string): CategoryDomain {
    return { values, compare: compareByDomain(values, locale) };
}

function numericValue(label: string): number | undefined {
    const trimmed = label.trim();
    if (!/^-?\d+(\.\d+)?$/.test(trimmed)) return undefined;
    const value = Number(trimmed);
    return Number.isFinite(value) ? value : undefined;
}

function parseTime(label: string): number | undefined {
    if (numericValue(label) !== undefined) return undefined;
    const time = new Date(label).getTime();
    return Number.isFinite(time) ? time : undefined;
}

function sortByCalendar(labels: string[], match: { calendar: CategoryCalendar; facet: CalendarFacet }, locale: string): string[] {
    const known: string[] = [];
    const tail: string[] = [];
    for (const label of labels) {
        if (isIgnorableCategoryLabel(label) || facetIndex(match.calendar, match.facet, label) === undefined) {
            tail.push(label);
        } else {
            known.push(label);
        }
    }
    known.sort((left, right) => {
        const a = facetIndex(match.calendar, match.facet, left) ?? 0;
        const b = facetIndex(match.calendar, match.facet, right) ?? 0;
        const rankA = match.facet === 'weekdays' ? (a - match.calendar.weekStartsOn + 7) % 7 : a;
        const rankB = match.facet === 'weekdays' ? (b - match.calendar.weekStartsOn + 7) % 7 : b;
        if (rankA !== rankB) return rankA - rankB;
        const aliasDelta =
            facetAliasPriority(match.calendar, match.facet, left) - facetAliasPriority(match.calendar, match.facet, right);
        if (aliasDelta !== 0) return aliasDelta;
        return naturalCompare(locale, left, right);
    });
    tail.sort((left, right) => naturalCompare(locale, left, right));
    return [...known, ...tail];
}

function sortNatural(labels: string[], locale: string): string[] {
    return [...labels].sort((left, right) => naturalCompare(locale, left, right));
}

function sortNumeric(labels: string[], locale: string): string[] | undefined {
    const eligible = labels.filter((label) => !isIgnorableCategoryLabel(label));
    if (eligible.length === 0 || eligible.some((label) => numericValue(label) === undefined)) return undefined;
    const ignorable = labels.filter(isIgnorableCategoryLabel);
    const known = [...eligible].sort((left, right) => {
        const delta = (numericValue(left) ?? 0) - (numericValue(right) ?? 0);
        return delta !== 0 ? delta : naturalCompare(locale, left, right);
    });
    ignorable.sort((left, right) => compareIgnorableLabels(locale, left, right));
    return [...known, ...ignorable];
}

function sortTemporal(labels: string[], locale: string): string[] | undefined {
    const eligible = labels.filter((label) => !isIgnorableCategoryLabel(label));
    if (eligible.length === 0 || eligible.some((label) => parseTime(label) === undefined)) return undefined;
    const ignorable = labels.filter(isIgnorableCategoryLabel);
    const known = [...eligible].sort((left, right) => (parseTime(left) ?? 0) - (parseTime(right) ?? 0));
    ignorable.sort((left, right) => compareIgnorableLabels(locale, left, right));
    return [...known, ...ignorable];
}

function sortStrictDates(labels: string[], locale: string): string[] | undefined {
    return (
        sortIsoDateTimeLabels(labels, locale) ??
        sortIsoDateLabels(labels, locale) ??
        sortIsoMonthLabels(labels, locale) ??
        sortDottedRuDateLabels(labels, locale) ??
        sortYearLabels(labels, locale)
    );
}

function orderByList(labels: string[], order: readonly string[], locale: string): string[] {
    const rank = new Map<string, number>();
    order.forEach((value, index) => {
        const key = normalizeLabel(value);
        if (!rank.has(key)) rank.set(key, index);
    });
    const known: string[] = [];
    const unknown: string[] = [];
    for (const label of labels) {
        if (label.trim() !== '' && rank.has(normalizeLabel(label))) known.push(label);
        else unknown.push(label);
    }
    known.sort((left, right) => (rank.get(normalizeLabel(left)) ?? 0) - (rank.get(normalizeLabel(right)) ?? 0));
    unknown.sort((left, right) => naturalCompare(locale, left, right));
    return [...known, ...unknown];
}

/** `undefined` — ключ сломан, идём к следующему способу. `null` — ключа нет. */
function orderByRank(labels: string[], rows: readonly IRow[], labelKey: string, rankKey: string, locale: string): string[] | null | undefined {
    const ranks = new Map<string, number>();
    let sawRank = false;
    for (const row of rows) {
        const label = String(row[labelKey] ?? '');
        if (label.trim() === '') continue;
        if (!Object.prototype.hasOwnProperty.call(row, rankKey)) continue;
        const raw = row[rankKey];
        const rank = typeof raw === 'number' ? raw : Number(String(raw).trim());
        if (!Number.isFinite(rank)) continue;
        sawRank = true;
        const previous = ranks.get(label);
        if (previous !== undefined && previous !== rank) return undefined;
        ranks.set(label, rank);
    }
    if (!sawRank) return null;
    const known = labels.filter((label) => label.trim() !== '' && ranks.has(label));
    const unknown = labels.filter((label) => label.trim() === '' || !ranks.has(label));
    known.sort((left, right) => (ranks.get(left) ?? 0) - (ranks.get(right) ?? 0) || naturalCompare(locale, left, right));
    unknown.sort((left, right) => naturalCompare(locale, left, right));
    return [...known, ...unknown];
}

function applyExplicit(
    order: CategoryOrder | undefined,
    labels: string[],
    rows: readonly IRow[] | undefined,
    labelKey: string,
    locale: string
): string[] | null | undefined {
    if (!order) return null;
    if (order.order && order.order.length > 0) return orderByList(labels, order.order, locale);
    if (order.by) return orderByRank(labels, rows ?? [], labelKey, order.by, locale);
    return null;
}

function autodetect(field: Pick<IField, 'semanticType'>, labels: string[], locale: string): string[] {
    const numeric = sortNumeric(labels, locale);
    if (numeric) return numeric;
    const strictDates = sortStrictDates(labels, locale);
    if (strictDates) return strictDates;
    const periodYear = sortPeriodYearLabels(labels, locale);
    if (periodYear) return periodYear;
    const weeks = sortWeekLabels(labels, locale);
    if (weeks) return weeks;
    const match = preferLocaleMatch(labels, locale);
    if (match) return sortByCalendar(labels, match, locale);
    if (field.semanticType === 'temporal') {
        const temporal = sortTemporal(labels, locale);
        if (temporal) return temporal;
    }
    return sortNatural(labels, locale);
}

export function resolveCategoryDomain(input: CategoryDomainInput): CategoryDomain {
    const locale = input.locale || 'en-US';
    const labels = uniqueLabels(input.values);
    const sheet = applyExplicit(input.sheetOrder, labels, input.rows, input.field.fid, locale);
    if (sheet) return domainOf(sheet, locale);
    const dataset = applyExplicit(input.datasetOrder, labels, input.rows, input.field.fid, locale);
    if (dataset) return domainOf(dataset, locale);
    return domainOf(autodetect(input.field, labels, locale), locale);
}

export function datasetCategoryOrder(
    field: Pick<IField, 'fid'>,
    datasetFields: readonly Pick<IField, 'fid' | 'categoryOrder'>[] | undefined
): CategoryOrder | undefined {
    return datasetFields?.find((item) => item.fid === field.fid)?.categoryOrder;
}
