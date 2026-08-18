import { observer } from 'mobx-react-lite';
import React, { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useVizStore } from '../../store';
import { isNotEmpty, parseErrorMessage } from '../../utils';
import { highlightField } from '../highlightField';
import { aggFuncs, reservedKeywords, sqlFunctions } from '../../lib/sql';
import { COUNT_FIELD_ID, MEA_KEY_ID, MEA_VAL_ID, PAINT_FIELD_ID } from '../../constants';
import { unstable_batchedUpdates } from 'react-dom';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../ui/dialog';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { inferComputedFieldStatus, insertTextAtCaret, nextComputedFieldName, quoteFieldName, type ComputedFieldStatus } from './utils';

const INNER_FIELD_IDS = new Set([COUNT_FIELD_ID, MEA_KEY_ID, MEA_VAL_ID, PAINT_FIELD_ID]);

const keywordRegex = new RegExp(`\\b(${Array.from(reservedKeywords).join('|')})\\b`, 'gi');
const bulitInRegex = new RegExp(`\\b(${Array.from(sqlFunctions).join('|')})(\\s*)\\(`, 'gi');
const aggBultinRegex = new RegExp(`\\b(${Array.from(aggFuncs).join('|')})(\\s*)\\(`, 'gi');

const stringRegex = /('[^']*'?)/g;
const quotedIdentRegex = /"(?:[^"]|"")*"/g;

const ComputedFieldDialog: React.FC = observer(() => {
    const vizStore = useVizStore();
    const { t } = useTranslation();
    const { editingComputedFieldFid, computedFieldSeedSql } = vizStore;
    const [name, setName] = useState<string>('');
    const [sql, setSql] = useState<string>('');
    const [error, setError] = useState<string>('');
    const [fieldQuery, setFieldQuery] = useState('');
    const ref = useRef<HTMLDivElement>(null);

    const insertableFields = useMemo(
        () => vizStore.allFields.filter((field) => !INNER_FIELD_IDS.has(field.fid)),
        [vizStore.allFields]
    );

    const SQLField = useMemo(() => {
        const fields = insertableFields.map((x) => x.name.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')).join('|');
        const fieldRegex = fields.length > 0 ? new RegExp(`\\b(${fields})\\b`, 'gi') : null;
        return highlightField((value: string) => {
            let highlighted = value.replace(quotedIdentRegex, '<span class="text-blue-700 dark:text-blue-600">$&</span>');
            if (fieldRegex) {
                highlighted = highlighted.replace(fieldRegex, '<span class="text-blue-700 dark:text-blue-600">$1</span>');
            }
            highlighted = highlighted.replace(keywordRegex, '<span class="text-fuchsia-700 dark:text-fuchsia-600">$1</span>');
            highlighted = highlighted.replace(bulitInRegex, '<span class="text-yellow-700 dark:text-yellow-600">$1</span>$2(');
            highlighted = highlighted.replace(aggBultinRegex, '<span class="text-amber-700 dark:text-amber-600">$1</span>$2(');
            highlighted = highlighted.replace(stringRegex, '<span class="text-green-700 dark:text-green-600">$1</span>');
            return highlighted;
        });
    }, [insertableFields]);

    const status: ComputedFieldStatus = useMemo(
        () => inferComputedFieldStatus(sql, insertableFields),
        [sql, insertableFields]
    );

    const filteredFields = useMemo(() => {
        const q = fieldQuery.trim().toLowerCase();
        if (!q) {
            return insertableFields;
        }
        return insertableFields.filter((field) => (field.name || field.fid).toLowerCase().includes(q));
    }, [fieldQuery, insertableFields]);

    useEffect(() => {
        if (isNotEmpty(editingComputedFieldFid)) {
            if (editingComputedFieldFid === '') {
                const nextName = nextComputedFieldName(
                    vizStore.allFields.map((field) => field.name),
                    (idx) => t('computed_field.default_name', { idx })
                );
                unstable_batchedUpdates(() => {
                    setName(nextName);
                    setSql(computedFieldSeedSql);
                    setError('');
                    setFieldQuery('');
                });
                if (ref.current) {
                    ref.current.textContent = computedFieldSeedSql;
                }
            } else {
                const f = vizStore.allFields.find((x) => x.fid === editingComputedFieldFid);
                if (!f || !f.computed || f.expression?.op !== 'expr') {
                    vizStore.setComputedFieldFid();
                    return;
                }
                const sqlParam = f.expression.params.find((x) => x.type === 'sql');
                if (!sqlParam) {
                    vizStore.setComputedFieldFid();
                    return;
                }
                unstable_batchedUpdates(() => {
                    setName(f.name);
                    setSql(sqlParam.value);
                    setError('');
                    setFieldQuery('');
                });
                if (ref.current) {
                    ref.current.textContent = sqlParam.value;
                }
            }
        }
    }, [editingComputedFieldFid, computedFieldSeedSql, vizStore, t]);

    const close = useCallback(() => {
        vizStore.setComputedFieldFid();
    }, [vizStore]);

    const apply = useCallback(() => {
        if (!sql.trim() || !name.trim()) {
            return;
        }
        try {
            vizStore.upsertComputedField(editingComputedFieldFid!, name, sql);
            vizStore.setComputedFieldFid();
        } catch (e) {
            setError(parseErrorMessage(e));
        }
    }, [editingComputedFieldFid, name, sql, vizStore]);

    const insertField = useCallback(
        (fieldName: string) => {
            const snippet = quoteFieldName(fieldName);
            const el = ref.current;
            if (!el) {
                setSql((prev) => `${prev}${snippet}`);
                return;
            }
            const next = insertTextAtCaret(el, snippet);
            setSql(next);
        },
        []
    );

    if (!isNotEmpty(editingComputedFieldFid)) return null;

    return (
        <Dialog open={true} onOpenChange={(open) => !open && close()}>
            <DialogContent
                className="!w-[760px] !max-w-[95vw]"
                onKeyDown={(event) => {
                    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                        event.preventDefault();
                        apply();
                    }
                }}
            >
                <div className="flex flex-col space-y-3">
                    <div className="pr-6">
                        <DialogTitle className="text-xl font-bold">
                            {editingComputedFieldFid === '' ? t('computed_field.add_title') : t('computed_field.edit_title')}
                        </DialogTitle>
                        <DialogDescription className="mt-1 text-xs text-muted-foreground">
                            {t('computed_field.scope')}
                        </DialogDescription>
                        <p className="mt-2 text-xs text-muted-foreground">{t('computed_field.hint_expr')}</p>
                        <p className="text-xs text-muted-foreground">{t('computed_field.hint_quotes')}</p>
                        <p className="mt-1 font-mono text-[11px] text-muted-foreground">{t('computed_field.example')}</p>
                    </div>
                    <div className="flex flex-col space-y-2">
                        <label className="text-xs font-medium">{t('computed_field.name')}</label>
                        <Input
                            type="text"
                            value={name}
                            placeholder={t('computed_field.name_placeholder')}
                            onChange={(e) => {
                                setName(e.target.value);
                            }}
                        />
                        <label className="text-xs font-medium">{t('computed_field.sql')}</label>
                        <div className="grid min-h-[10rem] grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_11rem]">
                            <SQLField
                                ref={ref}
                                value={sql}
                                onChange={setSql}
                                placeholder={t('computed_field.sql_placeholder')}
                                className="min-h-[10rem] font-mono text-xs"
                            />
                            <div className="flex min-h-[10rem] flex-col overflow-hidden rounded-md border border-input">
                                <div className="border-b border-input px-2 py-1 text-[11px] font-medium text-muted-foreground">
                                    {t('computed_field.fields')}
                                </div>
                                <Input
                                    type="search"
                                    value={fieldQuery}
                                    placeholder={t('computed_field.fields_search')}
                                    className="h-8 rounded-none border-0 border-b border-input shadow-none"
                                    onChange={(e) => setFieldQuery(e.target.value)}
                                />
                                <div className="min-h-0 flex-1 overflow-y-auto">
                                    {filteredFields.map((field) => {
                                        const label = field.name || field.fid;
                                        return (
                                            <button
                                                key={field.fid}
                                                type="button"
                                                title={t('computed_field.insert_field', { name: label })}
                                                className="block w-full truncate px-2 py-1 text-left font-mono text-[11px] hover:bg-accent"
                                                onMouseDown={(event) => event.preventDefault()}
                                                onClick={() => insertField(label)}
                                            >
                                                {label}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    </div>
                    <StatusLine status={status} error={error} />
                    <div className="flex items-center justify-end gap-2">
                        <span className="mr-auto text-[11px] text-muted-foreground">{t('computed_field.shortcut_apply')}</span>
                        <Button disabled={!sql.trim() || !name.trim()} onClick={apply}>
                            {editingComputedFieldFid === '' ? t('computed_field.add') : t('computed_field.edit')}
                        </Button>
                        <Button variant="outline" onClick={close}>
                            {t('actions.cancel')}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
});

function StatusLine({ status, error }: { status: ComputedFieldStatus; error: string }) {
    const { t } = useTranslation();
    if (error) {
        return <div className="text-xs text-red-500">{error}</div>;
    }
    switch (status.kind) {
        case 'empty':
            return null;
        case 'select':
            return <div className="text-xs text-amber-700 dark:text-amber-500">{t('computed_field.error_select')}</div>;
        case 'syntax':
            return <div className="text-xs text-red-500">{status.detail}</div>;
        case 'unknown_field':
            return (
                <div className="text-xs text-amber-700 dark:text-amber-500">
                    {t('computed_field.error_unknown_field', { name: status.name })}
                </div>
            );
        case 'ok': {
            const role = status.analyticType === 'measure' ? t('computed_field.status_measure') : t('computed_field.status_dimension');
            const grain = status.aggregated ? t('computed_field.status_agg') : t('computed_field.status_row');
            return (
                <div className="text-xs text-muted-foreground">
                    {role} · {grain}
                </div>
            );
        }
        default:
            return null;
    }
}

export default ComputedFieldDialog;
