import type { IViewField } from '../../interfaces';

export const TIME_GRAINS = ['year', 'quarter', 'month', 'week', 'day', 'hour', 'minute', 'second', 'iso_year', 'iso_week'] as const;
export type TimeGrain = (typeof TIME_GRAINS)[number];

const GRAIN_SET = new Set<string>(TIME_GRAINS);
const FID_GRAIN = /\.(year|quarter|month|week|day|hour|minute|second|iso_year|iso_week)$/i;
const MS_THRESHOLD = 1e12;

export function toBcp47Locale(locale?: string): string {
    if (!locale) return 'en-US';
    if (locale.startsWith('ru')) return 'ru-RU';
    if (locale.startsWith('zh')) return 'zh-CN';
    if (locale.startsWith('ja')) return 'ja-JP';
    if (locale.startsWith('en')) return 'en-US';
    return locale;
}

export function resolveTimeGrain(field: Pick<IViewField, 'fid' | 'timeUnit' | 'expression'>): TimeGrain | undefined {
    if (field.timeUnit && GRAIN_SET.has(field.timeUnit)) {
        return field.timeUnit;
    }
    if (field.expression?.op === 'dateTimeDrill') {
        const value = field.expression.params.find((param) => param.type === 'value')?.value;
        if (typeof value === 'string' && GRAIN_SET.has(value)) {
            return value as TimeGrain;
        }
    }
    const match = field.fid.match(FID_GRAIN);
    if (match) {
        return match[1].toLowerCase() as TimeGrain;
    }
    return undefined;
}

export function isDiscreteTimeGrain(grain: TimeGrain | undefined): boolean {
    return grain === 'year' || grain === 'iso_year' || grain === 'quarter' || grain === 'month' || grain === 'week' || grain === 'iso_week' || grain === 'day';
}

export function parseTemporal(value: unknown): Date | undefined {
    if (value instanceof Date) {
        return Number.isFinite(value.getTime()) ? value : undefined;
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
        const ms = Math.abs(value) < MS_THRESHOLD ? value * 1000 : value;
        const date = new Date(ms);
        return Number.isFinite(date.getTime()) ? date : undefined;
    }
    if (typeof value !== 'string' || value.length === 0) {
        return undefined;
    }
    const trimmed = value.trim();
    if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
        return parseTemporal(Number(trimmed));
    }
    const date = new Date(trimmed);
    return Number.isFinite(date.getTime()) ? date : undefined;
}

function utcWeek(date: Date): { year: number; week: number } {
    const utc = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const day = utc.getUTCDay() || 7;
    utc.setUTCDate(utc.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
    const week = Math.ceil(((utc.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
    return { year: utc.getUTCFullYear(), week };
}

function formatQuarter(year: number, quarter: number, locale: string): string {
    const lang = toBcp47Locale(locale).slice(0, 2);
    if (lang === 'ru') return `${quarter} кв. ${year}`;
    if (lang === 'zh') return `${year}年第${quarter}季度`;
    if (lang === 'ja') return `${year}年第${quarter}四半期`;
    return `Q${quarter} ${year}`;
}

function formatWeek(year: number, week: number, locale: string): string {
    const lang = toBcp47Locale(locale).slice(0, 2);
    const padded = String(week).padStart(2, '0');
    if (lang === 'ru') return `${padded} нед. ${year}`;
    if (lang === 'zh') return `${year}年第${week}周`;
    if (lang === 'ja') return `${year}年第${week}週`;
    return `W${padded} ${year}`;
}

function intl(locale: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
    return new Intl.DateTimeFormat(toBcp47Locale(locale), { timeZone: 'UTC', ...options });
}

export function formatTemporalDate(date: Date, grain: TimeGrain | undefined, locale?: string): string {
    const loc = toBcp47Locale(locale);
    const year = date.getUTCFullYear();
    switch (grain) {
        case 'year':
        case 'iso_year':
            return String(year);
        case 'quarter':
            return formatQuarter(year, Math.floor(date.getUTCMonth() / 3) + 1, loc);
        case 'month':
            return intl(loc, { month: 'short', year: 'numeric' }).format(date);
        case 'week':
        case 'iso_week': {
            const week = utcWeek(date);
            return formatWeek(week.year, week.week, loc);
        }
        case 'hour':
            return intl(loc, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(date);
        case 'minute':
            return intl(loc, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(date);
        case 'second':
            return intl(loc, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(date);
        case 'day':
        default:
            return intl(loc, { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
    }
}

export function formatTemporalLabel(value: unknown, field: Pick<IViewField, 'fid' | 'timeUnit' | 'expression' | 'semanticType'>, locale?: string): string {
    const date = parseTemporal(value);
    if (!date) {
        return value == null ? '' : String(value);
    }
    const grain = field.semanticType === 'temporal' || field.timeUnit || field.expression?.op === 'dateTimeDrill' ? resolveTimeGrain(field) : undefined;
    return formatTemporalDate(date, grain, locale);
}

export function timeAxisMinInterval(grain: TimeGrain | undefined): number | undefined {
    switch (grain) {
        case 'year':
        case 'iso_year':
            return 365 * 24 * 3600 * 1000;
        case 'quarter':
            return 90 * 24 * 3600 * 1000;
        case 'month':
            return 28 * 24 * 3600 * 1000;
        case 'week':
        case 'iso_week':
            return 7 * 24 * 3600 * 1000;
        case 'day':
            return 24 * 3600 * 1000;
        case 'hour':
            return 3600 * 1000;
        case 'minute':
            return 60 * 1000;
        case 'second':
            return 1000;
        default:
            return undefined;
    }
}
