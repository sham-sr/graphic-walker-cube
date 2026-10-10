import React, { useEffect, useState } from 'react';
import type { IComputationFunction, IMutField } from '../interfaces';
import { VizStoreWrapper, useVizStore } from '../store';
import { VizAppContext } from '../store/context';
import { setLocaleLanguage } from '../locales/i18n';
import { ShadowDom } from '../shadow-dom';
import FilterEditDialog from './filterField/filterEditDialog';
import { reaction } from 'mobx';
import {
    applySheetFilterEditorOpen,
    finishSheetFilterEditorSession,
    loadSheetFilterEditorSpec,
} from './sheetFilterEditorSession';

/**
 * Диалог «Настройки фильтра» одного листа Graphic Walker.
 * Список полей ограничен каналами листа (`fieldAllowlist`).
 */
export interface SheetFilterEditorProps {
    /** Метаданные полей датасета. */
    meta: IMutField[];
    /** Сырой spec листа: JSON history или объект графика. */
    specRaw: string;
    /** Идентификаторы полей, доступных фильтру: только каналы листа. */
    fieldAllowlist: readonly string[];
    /** Запрос значений для редактора фильтра. */
    computation: IComputationFunction;
    /** Тема оформления диалога. */
    appearance: 'light' | 'dark';
    /** Код языка интерфейса. */
    locale: string;
    /** Пользователь изменил spec фильтра. */
    onSpecChange: (raw: string) => void;
    /**
     * Диалог настроек фильтра закрыт подтверждением или отменой.
     * Хост должен снять панель (`release`).
     */
    onClose: () => void;
}

const deferHostClose = (onClose: () => void): void => {
    queueMicrotask(() => {
        onClose();
    });
};

const FilterEditorSession: React.FC<{
    specRaw: string;
    fieldAllowlist: readonly string[];
    onSpecChange: (raw: string) => void;
    onClose: () => void;
}> = ({ specRaw, fieldAllowlist, onSpecChange, onClose }) => {
    const store = useVizStore();

    useEffect(() => {
        loadSheetFilterEditorSpec(store, specRaw);
        store.setFilterFieldAllowlist(fieldAllowlist);
        const writeEpochBaseline = store.filterWriteEpoch;

        const openResult = applySheetFilterEditorOpen(store, fieldAllowlist);
        if (openResult === 'close') {
            deferHostClose(onClose);
            return;
        }

        const dispose = reaction(
            () => store.editingFilterIdx,
            (idx, prevIdx) => {
                if (prevIdx !== null && idx === null) {
                    const { committed, spec } = finishSheetFilterEditorSession(store, writeEpochBaseline);
                    if (committed && spec !== null) {
                        onSpecChange(spec);
                    }
                    deferHostClose(onClose);
                }
            },
        );

        return () => {
            dispose();
        };
    }, [fieldAllowlist, onClose, onSpecChange, specRaw, store]);

    return null;
};

/** Диалог «Настройки фильтра» листа: сразу модальный FilterEditDialog без полки. */
export const SheetFilterEditor: React.FC<SheetFilterEditorProps> = (props) => {
    const [portal, setPortal] = useState<HTMLDivElement | null>(null);
    useEffect(() => {
        void setLocaleLanguage(props.locale);
    }, [props.locale]);

    return (
        <ShadowDom style={{ width: '100%', height: '100%' }} containOverlays={false}>
            <VizAppContext
                ComputationContext={props.computation}
                themeContext={props.appearance}
                vegaThemeContext={{ vizThemeConfig: 'cube', setVizThemeConfig: () => undefined }}
                portalContainerContext={portal}
            >
                <VizStoreWrapper meta={props.meta}>
                    <FilterEditorSession
                        specRaw={props.specRaw}
                        fieldAllowlist={props.fieldAllowlist}
                        onSpecChange={props.onSpecChange}
                        onClose={props.onClose}
                    />
                    <FilterEditDialog />
                </VizStoreWrapper>
                <div ref={setPortal} />
            </VizAppContext>
        </ShadowDom>
    );
};
