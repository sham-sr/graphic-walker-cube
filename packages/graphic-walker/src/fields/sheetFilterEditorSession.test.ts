import type { IMutField } from '../interfaces';
import { VizSpecStore } from '../store/visualSpecStore';
import {
    applySheetFilterEditorOpen,
    finishSheetFilterEditorSession,
    loadSheetFilterEditorSpec,
} from './sheetFilterEditorSession';

const META: IMutField[] = [
    { fid: 'category', name: 'Category', semanticType: 'nominal', analyticType: 'dimension' },
    { fid: 'sales', name: 'Sales', semanticType: 'quantitative', analyticType: 'measure' },
];

const dispatchEvent = jest.fn();
const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
const originalCustomEvent = Object.getOwnPropertyDescriptor(globalThis, 'CustomEvent');

describe('sheetFilterEditorSession', () => {
    beforeAll(() => {
        Object.defineProperty(globalThis, 'document', {
            configurable: true,
            value: { dispatchEvent },
        });
        Object.defineProperty(globalThis, 'CustomEvent', {
            configurable: true,
            value: class {
                constructor(
                    public type: string,
                    public init?: CustomEventInit,
                ) {}
            },
        });
    });

    afterAll(() => {
        if (originalDocument) {
            Object.defineProperty(globalThis, 'document', originalDocument);
        } else {
            Reflect.deleteProperty(globalThis, 'document');
        }
        if (originalCustomEvent) {
            Object.defineProperty(globalThis, 'CustomEvent', originalCustomEvent);
        } else {
            Reflect.deleteProperty(globalThis, 'CustomEvent');
        }
    });

    it('opens editing on index 0 when filters already exist', () => {
        const store = new VizSpecStore(META);
        store.appendSheetFilter('category');
        store.closeFilterEditing();
        expect(store.viewFilters.length).toBe(1);

        const result = applySheetFilterEditorOpen(store, ['category', 'sales']);
        expect(result).toBe('opened');
        expect(store.editingFilterIdx).toBe(0);
    });

    it('appends first allowlist field when there are no filters', () => {
        const store = new VizSpecStore(META);
        const result = applySheetFilterEditorOpen(store, ['sales', 'category']);
        expect(result).toBe('opened');
        expect(store.viewFilters.length).toBe(1);
        expect(store.viewFilters[0]?.fid).toBe('sales');
        expect(store.editingFilterIdx).toBe(0);
    });

    it('returns close when allowlist is empty and there are no filters', () => {
        const store = new VizSpecStore(META);
        expect(applySheetFilterEditorOpen(store, [])).toBe('close');
    });

    it('cancel does not commit; confirm exports spec with rule', () => {
        const store = new VizSpecStore(META);
        const baseline = store.filterWriteEpoch;
        applySheetFilterEditorOpen(store, ['category']);

        store.closeFilterEditing();
        const cancelResult = finishSheetFilterEditorSession(store, baseline);
        expect(cancelResult.committed).toBe(false);
        expect(cancelResult.spec).toBeNull();

        const onSpecChange = jest.fn();
        const onClose = jest.fn();
        const baseline2 = store.filterWriteEpoch;
        store.setFilterEditing(0);
        store.writeFilter(0, { type: 'one of', value: ['A'] });
        store.closeFilterEditing();

        const confirmResult = finishSheetFilterEditorSession(store, baseline2);
        expect(confirmResult.committed).toBe(true);
        expect(confirmResult.spec).not.toBeNull();
        if (confirmResult.spec) {
            onSpecChange(confirmResult.spec);
        }
        onClose();

        expect(onSpecChange).toHaveBeenCalledTimes(1);
        expect(onClose).toHaveBeenCalledTimes(1);
        expect(store.viewFilters[0]?.rule?.type).toBe('one of');
        expect(confirmResult.spec).toContain('one of');
    });

    it('loadSheetFilterEditorSpec imports exported chart raw', () => {
        const seed = new VizSpecStore(META);
        const raw = seed.exportCurrentChart();
        const store = new VizSpecStore(META, { empty: true });
        loadSheetFilterEditorSpec(store, raw);
        expect(store.visList.length).toBe(1);
        expect(store.allFields.some((field) => field.fid === 'category')).toBe(true);
    });
});
