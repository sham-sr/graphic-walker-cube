import tailwindStyle from 'tailwindcss/tailwind.css?inline';
import style from './index.css?inline';

let tailwindSheet: CSSStyleSheet | null = null;
let indexSheet: CSSStyleSheet | null = null;

/** Inline-содержимое для фолбэка через `<style>`. */
export const shadowTailwindCss = tailwindStyle;
export const shadowIndexCss = style;

/**
 * Поддержка constructable stylesheets в текущем окружении (не jsdom без моков).
 * @module
 */
export function supportsConstructableStylesheets(): boolean {
    if (typeof CSSStyleSheet === 'undefined') {
        return false;
    }
    if (!('adoptedStyleSheets' in Document.prototype)) {
        return false;
    }
    try {
        const probe = new CSSStyleSheet();
        return typeof probe.replaceSync === 'function';
    } catch {
        return false;
    }
}

/**
 * Общие листы Tailwind + index.css: один раз на модуль, переиспользуются всеми ShadowDom.
 * @module
 */
export function getSharedShadowStyleSheets(): CSSStyleSheet[] {
    if (!tailwindSheet) {
        tailwindSheet = new CSSStyleSheet();
        tailwindSheet.replaceSync(shadowTailwindCss);
    }
    if (!indexSheet) {
        indexSheet = new CSSStyleSheet();
        indexSheet.replaceSync(shadowIndexCss);
    }
    return [tailwindSheet, indexSheet];
}

/**
 * Подключает общие листы к shadow root через adoptedStyleSheets.
 * @returns false — нужен фолбэк через `<style>`.
 * @module
 */
export function applySharedShadowStyles(shadowRoot: ShadowRoot): boolean {
    if (!supportsConstructableStylesheets()) {
        return false;
    }
    shadowRoot.adoptedStyleSheets = getSharedShadowStyleSheets();
    return true;
}

/** Сброс модульного кэша (только тесты). */
export function resetSharedShadowStyleSheetsForTests(): void {
    tailwindSheet = null;
    indexSheet = null;
}
