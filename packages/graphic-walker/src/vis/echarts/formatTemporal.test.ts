import { formatTemporalIso, formatTemporalLabel, formatTemporalValue, parseTemporal, resolveTimeGrain } from './formatTemporal';
import type { IViewField } from '../../interfaces';

const monthField: IViewField = {
    fid: 'tickets.sell_date.month',
    name: 'Дата продажи (месяц)',
    analyticType: 'dimension',
    semanticType: 'temporal',
};

describe('formatTemporal', () => {
    test('reads Cube fid granularity', () => {
        expect(resolveTimeGrain(monthField)).toBe('month');
        expect(resolveTimeGrain({ fid: 'tickets.sell_date.year', timeUnit: undefined })).toBe('year');
        expect(resolveTimeGrain({ fid: 'd', timeUnit: 'quarter' })).toBe('quarter');
    });

    test('parses ISO, unix ms and unix seconds', () => {
        expect(parseTemporal('2025-02-01T00:00:00.000Z')?.toISOString()).toBe('2025-02-01T00:00:00.000Z');
        expect(parseTemporal(Date.UTC(2025, 1, 1))?.toISOString()).toBe('2025-02-01T00:00:00.000Z');
        expect(parseTemporal(1738368000)?.toISOString()).toBe('2025-02-01T00:00:00.000Z');
    });

    test('formats month in ru and en without unix numbers', () => {
        const iso = '2025-02-15T00:00:00.000Z';
        const ru = formatTemporalLabel(iso, monthField, 'ru-RU');
        const en = formatTemporalLabel(iso, monthField, 'en-US');
        expect(ru).toMatch(/2025/);
        expect(ru.toLowerCase()).toMatch(/фев/);
        expect(en).toMatch(/2025/);
        expect(en.toLowerCase()).toMatch(/feb/);
        expect(ru).not.toMatch(/^[0-9.e+-]+$/);
        expect(formatTemporalLabel(1739577600000, monthField, 'en-US')).toMatch(/2025/);
    });

    test('formats year, quarter and week by locale', () => {
        const yearField = { ...monthField, fid: 'tickets.sell_date.year' };
        const quarterField = { ...monthField, fid: 'tickets.sell_date.quarter' };
        const weekField = { ...monthField, fid: 'tickets.sell_date.week' };
        const iso = '2025-02-15T00:00:00.000Z';
        expect(formatTemporalLabel(iso, yearField, 'ru-RU')).toBe('2025');
        expect(formatTemporalLabel(iso, quarterField, 'ru-RU')).toBe('1 кв. 2025');
        expect(formatTemporalLabel(iso, quarterField, 'en-US')).toBe('Q1 2025');
        expect(formatTemporalLabel(iso, weekField, 'en-US')).toMatch(/^W0?\d+ 2025$/);
        expect(formatTemporalLabel(iso, weekField, 'ru-RU')).toMatch(/нед/);
    });

    test('formats truncated ISO by grain for technical pivot headers', () => {
        const iso = '2025-02-15T00:00:00.000Z';
        const date = parseTemporal(iso)!;
        expect(formatTemporalIso(date, 'year')).toBe('2025');
        expect(formatTemporalIso(date, 'quarter')).toBe('2025-Q1');
        expect(formatTemporalIso(date, 'month')).toBe('2025-02');
        expect(formatTemporalIso(date, 'day')).toBe('2025-02-15');
        expect(formatTemporalValue(iso, monthField, 'technical')).toBe('2025-02');
        expect(formatTemporalValue(iso, monthField, 'human', 'en-US').toLowerCase()).toMatch(/feb/);
        expect(formatTemporalValue('2024-01-01T12:00:00.000Z', { ...monthField, fid: 'occurredAt' }, 'technical')).toBe('2024-01-01 12:00');
        expect(formatTemporalValue('2024-01-01T12:00:00.000Z', { ...monthField, fid: 'occurredAt' }, 'human', 'en-US')).toMatch(/2024/);
    });
});
