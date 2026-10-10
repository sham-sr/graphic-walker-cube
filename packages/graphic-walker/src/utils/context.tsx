import React, { Context, ContextType } from 'react';

/**
 * Склеивает контексты в один провайдер.
 * Ключи из `defaults` можно не передавать: подставится значение по умолчанию.
 */
export function composeContext<
    T extends Record<string, Context<any>>,
    D extends Partial<{ [K in keyof T]: ContextType<T[K]> }> = Record<never, never>
>(contexts: T, defaults?: D) {
    return function (
        props: { children?: React.ReactNode | Iterable<React.ReactNode> } & {
            [K in Exclude<keyof T, keyof D>]: ContextType<T[K]>;
        } & {
            [K in Extract<keyof T, keyof D>]?: ContextType<T[K]>;
        }
    ) {
        let node = props.children;
        Object.keys(contexts).forEach((contextKey) => {
            const context = contexts[contextKey];
            const key = contextKey as keyof typeof props;
            const provided = props[key];
            const value = provided !== undefined ? provided : defaults?.[contextKey as keyof D];
            node = <context.Provider value={value}>{node}</context.Provider>;
        });
        return node;
    };
}
