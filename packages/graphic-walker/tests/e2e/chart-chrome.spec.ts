import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';
import path from 'node:path';

const OUTPUT_DIR = path.resolve(__dirname, 'output', 'chart-chrome');

const SCENES = [
    'labels',
    'overlay-line',
    'overlay-dual',
    'tooltip-encoded',
    'tooltip-all',
    'reference-mean',
    'reference-median',
    'donut',
    'trend',
    'legend',
] as const;

test.describe('chart chrome visuals', () => {
    test.skip(({ browserName }) => browserName !== 'chromium', 'visual gallery is chromium-only');

    test('renders P0–P1 chart modes and saves screenshots', async ({ page }, testInfo) => {
        await page.goto('/tests/e2e/chart-chrome.html');
        await expect(page.locator('body')).toHaveAttribute('data-repro-ready', 'true', { timeout: 90_000 });

        for (const scene of SCENES) {
            const panel = page.locator(`[data-scene="${scene}"]`);
            await panel.scrollIntoViewIfNeeded();
            const chart = panel.locator('.chart');
            await expect(chart.locator('svg').first()).toBeVisible();
            const plotMarks = await countPlotMarks(chart);
            expect(plotMarks, `${scene} should draw marks`).toBeGreaterThan(0);
            await saveShot(panel, testInfo, scene);
        }

        await expect(page.locator('[data-scene="labels"] svg text').filter({ hasText: '687000' })).toBeVisible();
        await expect(page.locator('[data-scene="labels"] svg text').filter({ hasText: '762000' })).toBeVisible();

        await expectOrangeStroke(page.locator('[data-scene="overlay-line"] svg'));
        await expectOrangeStroke(page.locator('[data-scene="overlay-dual"] svg'));
        expect(await page.locator('[data-scene="overlay-dual"] svg text').filter({ hasText: 'Платный доход' }).count()).toBeGreaterThan(1);

        await expectDashedRule(page.locator('[data-scene="reference-mean"] svg'));
        await expectDashedRule(page.locator('[data-scene="reference-median"] svg'));

        expect(await page.locator('[data-scene="donut"] svg path').count()).toBeGreaterThan(1);

        const trendSvg = page.locator('[data-scene="trend"] svg');
        const trendMarks = await countPlotMarks(page.locator('[data-scene="trend"] .chart'));
        expect(trendMarks).toBeGreaterThan(2);
        const hasTrendLine = await trendSvg.evaluate((node) =>
            [...node.querySelectorAll<SVGElement>('path, line')].some((el) => {
                const stroke = getComputedStyle(el).stroke;
                const fill = getComputedStyle(el).fill;
                return /15,\s*23,\s*42|0f172a|#0f172a/i.test(stroke) && fill === 'none';
            })
        );
        expect(hasTrendLine).toBe(true);

        await expect(page.locator('[data-scene="legend"] svg text').filter({ hasText: 'Способ оплаты' })).toBeVisible();

        await hoverAndShot(page, 'tooltip-encoded', testInfo, ['Способ оплаты', 'Платный доход']);
        await hoverAndShot(page, 'tooltip-all', testInfo, ['Способ оплаты', 'Платный доход', 'год назад']);

        const legendPanel = page.locator('[data-scene="legend"]');
        await legendPanel.scrollIntoViewIfNeeded();
        await legendPanel.locator('svg text').filter({ hasText: 'Карта' }).click({ force: true });
        await page.waitForTimeout(300);
        await saveShot(legendPanel, testInfo, 'legend-clicked');
    });
});

async function countPlotMarks(root: Locator) {
    return root.locator('svg g.mark-rect path, svg g.mark-bar path, svg g.mark-line path, svg g.mark-point path, svg g.mark-arc path, svg g.mark-rule line, svg g.mark-text text').count();
}

async function expectOrangeStroke(svg: Locator) {
    const orange = await svg.evaluate((node) => {
        const strokes = [...node.querySelectorAll<SVGElement>('path, line')].map((el) => getComputedStyle(el).stroke);
        return strokes.some((stroke) => /234,\s*88,\s*12|ea580c/i.test(stroke));
    });
    expect(orange).toBe(true);
}

async function expectDashedRule(svg: Locator) {
    const dashed = await svg.evaluate((node) =>
        [...node.querySelectorAll<SVGElement>('line, path')].some((el) => {
            const dash = getComputedStyle(el).strokeDasharray;
            return Boolean(dash) && dash !== 'none';
        })
    );
    expect(dashed).toBe(true);
}

async function hoverAndShot(page: Page, scene: string, testInfo: TestInfo, expectedTexts: string[]) {
    const panel = page.locator(`[data-scene="${scene}"]`);
    await panel.scrollIntoViewIfNeeded();
    const mark = panel.locator('svg g.mark-rect path, svg g.mark-bar path').first();
    await expect(mark).toBeVisible();
    await mark.hover({ force: true });
    const tooltip = page.locator('#vg-tooltip-element, .vg-tooltip').first();
    await expect(tooltip).toBeVisible({ timeout: 5_000 });
    const text = (await tooltip.innerText()).replace(/\s+/g, ' ');
    for (const expected of expectedTexts) {
        expect(text, `tooltip ${scene} should mention ${expected}`).toContain(expected);
    }
    await saveShot(panel, testInfo, `${scene}-hover`);
    await tooltip.screenshot({ path: path.join(OUTPUT_DIR, `${scene}-tooltip.png`) });
    await testInfo.attach(`${scene}-tooltip`, { path: path.join(OUTPUT_DIR, `${scene}-tooltip.png`), contentType: 'image/png' });
}

async function saveShot(target: Locator, testInfo: TestInfo, name: string) {
    const file = path.join(OUTPUT_DIR, `${name}.png`);
    await target.screenshot({ path: file });
    await testInfo.attach(name, { path: file, contentType: 'image/png' });
}
