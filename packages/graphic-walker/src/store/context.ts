import { createContext, useContext } from 'react';
import type { ICategoryOrderProvider } from '../interfaces';
import { ComputationContext } from '.';
import { composeContext } from '../utils/context';
import { portalContainerContext, themeContext, vegaThemeContext } from './theme';

/** Провайдер порядка категорий. null — хост не подключил API. */
export const CategoryOrderProviderContext = createContext<ICategoryOrderProvider | null>(null);

export const VizAppContext = composeContext(
    { ComputationContext, themeContext, vegaThemeContext, portalContainerContext, CategoryOrderProviderContext },
    { CategoryOrderProviderContext: null }
);

/**
 * Внутренний хук редактора.
 * null — кнопки порядка категорий на пилюле нет.
 * @returns провайдер хоста или null
 */
export function useCategoryOrderProvider(): ICategoryOrderProvider | null {
    return useContext(CategoryOrderProviderContext);
}
