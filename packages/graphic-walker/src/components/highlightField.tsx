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
        return (
            <div className={cn('relative flex min-h-[60px] w-full rounded-md border border-input bg-transparent text-sm shadow-sm', className)}>
                <div className="absolute whitespace-pre inset-0 pointer-events-none px-3 py-2" dangerouslySetInnerHTML={{ __html: highlightValue }} />
                {placeholder && value === '' && (
                    <div className="px-3 py-2 pointer-events-none text-muted-foreground absolute inset-0 select-none">{placeholder}</div>
                )}
                <div
                    ref={ref}
                    contentEditable="plaintext-only"
                    onInput={(e) => {
                        const text = e.currentTarget.textContent ?? '';
                        onChange?.(text);
                    }}
                    className="px-3 py-2 w-full focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 rounded-md border-0 text-transparent caret-foreground"
                ></div>
            </div>
        );
    });
}
