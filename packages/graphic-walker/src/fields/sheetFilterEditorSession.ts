import type { IChart } from '../interfaces';
import { COUNT_FIELD_ID, MEA_KEY_ID, MEA_VAL_ID } from '../constants';
import type { VizSpecStore } from '../store/visualSpecStore';

const HIDDEN_FILTER_FIELD_FIDS = new Set([COUNT_FIELD_ID, MEA_KEY_ID, MEA_VAL_ID]);

/** Загружает spec листа в локальный store редактора фильтра. */
export function loadSheetFilterEditorSpec(store: VizSpecStore, specRaw: string): void {
    let parsed: unknown;
    try {
        parsed = JSON.parse(specRaw);
    } catch {
        return;
    }
    if (!parsed || typeof parsed !== 'object') {
        return;
    }
    const history = parsed as { base?: unknown; timeline?: unknown };
    if (history.base && Array.isArray(history.timeline)) {
        store.importRaw([specRaw]);
        return;
    }
    store.importCode([parsed as IChart]);
}

/** Первое поле из allowlist, доступное в meta-полках и не служебное. */
function findFirstAllowlistFieldId(store: VizSpecStore, fieldAllowlist: readonly string[]): string | null {
    const available = new Set(store.allFields.filter((field) => !HIDDEN_FILTER_FIELD_FIDS.has(field.fid)).map((field) => field.fid));
    for (const fid of fieldAllowlist) {
        if (available.has(fid)) {
            return fid;
        }
    }
    return null;
}

export type SheetFilterEditorOpenResult = 'close' | 'opened';

/**
 * Открывает стандартный диалог фильтра: редактирование первого фильтра или добавление поля из allowlist.
 */
export function applySheetFilterEditorOpen(store: VizSpecStore, fieldAllowlist: readonly string[]): SheetFilterEditorOpenResult {
    if (store.viewFilters.length > 0) {
        store.setFilterEditing(0);
        return 'opened';
    }
    if (fieldAllowlist.length === 0) {
        return 'close';
    }
    const fid = findFirstAllowlistFieldId(store, fieldAllowlist);
    if (!fid) {
        return 'close';
    }
    store.appendSheetFilter(fid);
    if (store.viewFilters.length === 0 || store.editingFilterIdx === null) {
        return 'close';
    }
    return 'opened';
}

/** Итог сессии: spec для хоста только после подтверждения. */
export function finishSheetFilterEditorSession(
    store: VizSpecStore,
    writeEpochBaseline: number,
): { committed: boolean; spec: string | null } {
    const committed = store.filterWriteEpoch > writeEpochBaseline;
    return {
        committed,
        spec: committed ? store.exportCurrentChart() : null,
    };
}
