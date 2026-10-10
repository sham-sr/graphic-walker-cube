import {
    applySharedShadowStyles,
    getSharedShadowStyleSheets,
    resetSharedShadowStyleSheetsForTests,
    supportsConstructableStylesheets,
} from './shadow-dom-shared-styles';

function ensureDocumentPrototype(): void {
    if (typeof Document !== 'undefined') {
        return;
    }
    class DocumentStub {}
    Object.defineProperty(DocumentStub.prototype, 'adoptedStyleSheets', {
        configurable: true,
        writable: true,
        value: [],
    });
    (globalThis as { Document: typeof DocumentStub }).Document = DocumentStub as unknown as typeof Document;
}

describe('shadow-dom-shared-styles', () => {
    const originalCss = globalThis.CSSStyleSheet;
    let originalAdopted: PropertyDescriptor | undefined;

    beforeEach(() => {
        ensureDocumentPrototype();
        originalAdopted = Object.getOwnPropertyDescriptor(Document.prototype, 'adoptedStyleSheets');
    });

    afterEach(() => {
        resetSharedShadowStyleSheetsForTests();
        if (originalCss) {
            globalThis.CSSStyleSheet = originalCss;
        } else {
            delete (globalThis as { CSSStyleSheet?: typeof CSSStyleSheet }).CSSStyleSheet;
        }
        if (originalAdopted) {
            Object.defineProperty(Document.prototype, 'adoptedStyleSheets', originalAdopted);
        } else {
            delete (Document.prototype as { adoptedStyleSheets?: CSSStyleSheet[] }).adoptedStyleSheets;
        }
    });

    test('фолбэк (jsdom): без CSSStyleSheet applySharedShadowStyles возвращает false', () => {
        delete (globalThis as { CSSStyleSheet?: typeof CSSStyleSheet }).CSSStyleSheet;
        expect(supportsConstructableStylesheets()).toBe(false);
        const shadowRoot = { adoptedStyleSheets: [] as CSSStyleSheet[] } as ShadowRoot;
        expect(applySharedShadowStyles(shadowRoot)).toBe(false);
        expect(shadowRoot.adoptedStyleSheets).toEqual([]);
    });

    test('общие листы создаются один раз для нескольких shadow root', () => {
        const replaceSync = jest.fn();
        class MockSheet {
            replaceSync = replaceSync;
        }
        globalThis.CSSStyleSheet = MockSheet as unknown as typeof CSSStyleSheet;
        Object.defineProperty(Document.prototype, 'adoptedStyleSheets', {
            configurable: true,
            value: [],
        });

        expect(supportsConstructableStylesheets()).toBe(true);

        const rootA = { adoptedStyleSheets: [] as CSSStyleSheet[] } as ShadowRoot;
        const rootB = { adoptedStyleSheets: [] as CSSStyleSheet[] } as ShadowRoot;

        expect(applySharedShadowStyles(rootA)).toBe(true);
        expect(applySharedShadowStyles(rootB)).toBe(true);

        const sheetsA = rootA.adoptedStyleSheets;
        const sheetsB = rootB.adoptedStyleSheets;
        expect(sheetsA).toHaveLength(2);
        expect(sheetsB).toHaveLength(2);
        expect(sheetsA[0]).toBe(sheetsB[0]);
        expect(sheetsA[1]).toBe(sheetsB[1]);
        expect(replaceSync).toHaveBeenCalledTimes(2);

        const cached = getSharedShadowStyleSheets();
        expect(cached[0]).toBe(sheetsA[0]);
        expect(replaceSync).toHaveBeenCalledTimes(2);
    });
});
