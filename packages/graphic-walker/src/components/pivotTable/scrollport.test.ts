import { pivotScrollFromPointerRatio, pivotScrollFromThumb, pivotScrollThumb } from './scrollport';

describe('pivot scroll thumb math', () => {
    test('returns null when content fits the viewport', () => {
        expect(pivotScrollThumb(200, 200, 0, 180)).toBeNull();
    });

    test('sizes the thumb by the visible ratio and maps drag back to scrollLeft', () => {
        const thumb = pivotScrollThumb(400, 100, 150, 200);
        expect(thumb).not.toBeNull();
        expect(thumb!.length).toBe(50);
        expect(thumb!.offset).toBe(75);
        expect(pivotScrollFromThumb(thumb!.offset, thumb!.length, 200, 400, 100)).toBe(150);
    });

    test('pointer ratio stays consistent under CSS scale', () => {
        const thumb = pivotScrollThumb(400, 100, 0, 200)!;
        expect(pivotScrollFromPointerRatio(0.5, thumb.length, 200, 400, 100)).toBe(150);
    });
});
