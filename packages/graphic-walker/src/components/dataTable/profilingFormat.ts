import { format, formatLocale } from 'd3-format';
import i18n from 'i18next';
import '../../locales/i18n';

const siFormatterEn = format('.3~s');
const decimalFormatterEn = format(',.2~f');
const smallFormatterEn = format('.3~g');
const approxFormatterEn = format(',.3~r');

const ruLocale = formatLocale({
    decimal: ',',
    thousands: '\u00a0',
    grouping: [3],
    currency: ['', ''],
});

const decimalFormatterRu = ruLocale.format(',.2~f');
const smallFormatterRu = ruLocale.format('.3~g');
const approxFormatterRu = ruLocale.format(',.3~r');

const SI_RU_SUFFIX: Record<string, string> = {
    k: ' тыс',
    M: ' млн',
    G: ' млрд',
    T: ' трлн',
};

function isRussianLanguage(language?: string): boolean {
    const lang = (language ?? i18n.language ?? '').toLowerCase();
    return lang.startsWith('ru');
}

/** Локализует строку d3 `.3~s`: ru — суффиксы тыс/млн/… и запятая в мантиссе; P/E/Z/Y — буква как в en. */
function localizeSiFormatted(s: string, russian: boolean): string {
    if (!russian) return s;
    const match = /^([−-]?)([\d.]+)([kMGTEPZY])$/.exec(s);
    if (!match) return s;
    const [, signRaw, mantissa, suffix] = match;
    const sign = signRaw ? '-' : '';
    const mantissaRu = mantissa.replace('.', ',');
    const ruSuffix = SI_RU_SUFFIX[suffix];
    if (ruSuffix) return `${sign}${mantissaRu}${ruSuffix}`;
    return `${sign}${mantissaRu}${suffix}`;
}

export function formatNumber(x: number, language?: string): string {
    if (!Number.isFinite(x)) return `${x}`;
    const russian = isRussianLanguage(language);
    const abs = Math.abs(x);
    if (abs >= 1e5) return localizeSiFormatted(siFormatterEn(x), russian);
    if (abs >= 1 || x === 0) return russian ? decimalFormatterRu(x) : decimalFormatterEn(x);
    return russian ? smallFormatterRu(x) : smallFormatterEn(x);
}

export function formatApprox(x: number, language?: string): string {
    if (!Number.isFinite(x)) return `${x}`;
    const russian = isRussianLanguage(language);
    return Math.abs(x) >= 1e5
        ? localizeSiFormatted(siFormatterEn(x), russian)
        : russian
          ? approxFormatterRu(x)
          : approxFormatterEn(x);
}
