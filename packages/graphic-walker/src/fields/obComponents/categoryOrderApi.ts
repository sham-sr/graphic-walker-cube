import type { CategoryOrder, ICategoryOrderProvider, IViewField } from '../../interfaces';

/** Показывать ли кнопку порядка категорий на пилюле полки. */
export function showCategoryOrderApi(provider: ICategoryOrderProvider | null, field: Pick<IViewField, 'analyticType'>): boolean {
    return provider !== null && field.analyticType === 'dimension';
}

/** Есть ли в ответе API применимый порядок. */
export function hasCategoryOrderPayload(order: CategoryOrder | null | undefined): boolean {
    if (!order) {
        return false;
    }
    if (order.by) {
        return true;
    }
    return (order.order?.length ?? 0) > 0;
}
