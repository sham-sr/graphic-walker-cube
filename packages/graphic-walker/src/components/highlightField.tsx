import React from 'react';
import { cn } from '@/utils';

export interface TextFieldProps {
    placeholder?: string;
    onChange?: (v: string) => void;
    value: string;
    className?: string;
}

export function highlightField(highlighter: (value: string) => string) {
    return React.forwardRef<HTMLDivElement, TextFieldProps>(function TextField({ placeholder, onChange, value, className }, ref) {
        const highlightValue = highlighter(value);
        const wrapClass = 'px-3 py-2 whitespace-pre-wrap break-all [overflow-wrap:anywhere]';
        return (
            <div
                className={cn(
                    'relative flex min-h-[60px] min-w-0 w-full overflow-hidden rounded-md border border-input bg-transparent text-sm shadow-sm',
                    className
                )}
            >
                <div
                    className={cn('pointer-events-none absolute inset-0', wrapClass)}
                    dangerouslySetInnerHTML={{ __html: highlightValue }}
                />
                {placeholder && value === '' && (
                    <div className={cn('pointer-events-none absolute inset-0 select-none text-muted-foreground', wrapClass)}>
                        {placeholder}
                    </div>
                )}
                <div
                    ref={ref}
                    contentEditable="plaintext-only"
                    onInput={(e) => {
                        const text = e.currentTarget.textContent ?? '';
                        onChange?.(text);
                    }}
                    className={cn(
                        'min-h-full min-w-0 w-full rounded-md border-0 text-transparent caret-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
                        wrapClass
                    )}
                ></div>
            </div>
        );
    });
}
