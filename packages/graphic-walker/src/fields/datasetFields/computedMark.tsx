import React from 'react';
import { useTranslation } from 'react-i18next';
import type { IViewField } from '../../interfaces';
import Tooltip from '../../components/tooltip';
import { expressionSql } from '../../components/computedField/utils';

export function ComputedFieldMark({ field }: { field: IViewField }) {
    const { t } = useTranslation();
    if (!field.computed) {
        return null;
    }
    const sql = expressionSql(field.expression);
    const label = t('computed_field.fx_label');
    return (
        <Tooltip content={<span className="max-w-xs whitespace-pre-wrap break-all font-mono text-[11px]">{sql ? `${label}: ${sql}` : label}</span>}>
            <span
                className="ml-0.5 shrink-0 font-mono text-[10px] leading-none text-muted-foreground"
                aria-label={label}
                title={sql ? `${label}: ${sql}` : label}
            >
                fx
            </span>
        </Tooltip>
    );
}
