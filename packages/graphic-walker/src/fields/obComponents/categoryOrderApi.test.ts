import type { ICategoryOrderProvider } from '../../interfaces';
import { showCategoryOrderApi } from './categoryOrderApi';

describe('showCategoryOrderApi', () => {
    test('dimension with provider', () => {
        expect(showCategoryOrderApi((async () => null) as ICategoryOrderProvider, { analyticType: 'dimension' })).toBe(true);
    });
});
