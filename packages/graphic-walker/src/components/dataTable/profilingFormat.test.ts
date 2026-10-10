import { formatNumber } from './profilingFormat';

describe('profilingFormat', () => {
    describe('SI scale (|x| >= 1e5)', () => {
        it.each(['en', 'en-US', 'zh-CN', 'ja-JP'])('uses English SI for %s', (language) => {
            expect(formatNumber(100_000, language)).toMatch(/k/i);
            expect(formatNumber(100_000, language)).not.toContain('тыс');
            expect(formatNumber(1_500_000, language)).toContain('M');
            expect(formatNumber(2_300_000_000, language)).toMatch(/G/i);
        });

        it.each(['ru', 'ru-RU'])('uses Russian SI suffixes for %s', (language) => {
            expect(formatNumber(100_000, language)).toBe('100 тыс');
            expect(formatNumber(1_500_000, language)).toBe('1,5 млн');
            expect(formatNumber(2_300_000_000, language)).toBe('2,3 млрд');
            expect(formatNumber(1e12, language)).toBe('1 трлн');
        });

        it('formats negative large ru values with minus and млн', () => {
            const s = formatNumber(-1_500_000, 'ru-RU');
            expect(s.startsWith('-')).toBe(true);
            expect(s).toContain('млн');
        });
    });

    describe('|x| < 1e5', () => {
        it('does not use SI in English', () => {
            const s = formatNumber(99_999, 'en-US');
            expect(s).not.toMatch(/[kMG]/);
            expect(s).not.toContain('тыс');
        });

        it('uses Russian grouping without SI', () => {
            const s = formatNumber(99_999, 'ru-RU');
            expect(s).not.toContain('млн');
            expect(s).not.toMatch(/[kMG]/);
            expect(s).toContain('\u00a0');
            expect(formatNumber(12_345.6, 'ru-RU')).toContain(',');
        });
    });

    describe('edge cases', () => {
        it('handles zero', () => {
            expect(formatNumber(0, 'en-US')).toBeTruthy();
            expect(formatNumber(0, 'ru-RU')).toBeTruthy();
        });

        it('stringifies non-finite values', () => {
            expect(formatNumber(Number.NaN, 'en')).toBe('NaN');
            expect(formatNumber(Number.POSITIVE_INFINITY, 'ru')).toBe('Infinity');
        });
    });
});
