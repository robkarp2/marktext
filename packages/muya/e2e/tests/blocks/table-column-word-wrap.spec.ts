import { expect, test } from '../fixtures/muya';
import { editor } from '../helpers/selectors';

/**
 * Table cells keep words whole, so a short column is never squeezed below
 * its longest word just because a neighbour holds long prose. Breaking inside
 * words (`overflow-wrap: anywhere`, from #5605) is kept only for tables whose
 * words cannot fit the editor width, such as a long digit run or URL.
 */

const PROSE = 'on, 6 months, nosniff, no preload. Include subdomains on the '
    + 'apex zones only, not on the internal domain until the LAN names move to '
    + 'a non-public suffix such as home.arpa, because they serve plain HTTP. '
    + 'This sentence repeats to make sure the column is far wider than the '
    + 'editor. This sentence repeats to make sure the column is far wider '
    + 'than the editor.';

const SQUEEZE_MD = [
    '| Setting | Current | Target |',
    '| --- | --- | --- |',
    `| HSTS | off | ${PROSE} |`,
    `| DNSSEC | disabled | ${PROSE} |`,
    '',
].join('\n');

const LONG_RUN_MD = [
    '| ee | 33 | 44 |',
    '| --- | --- | --- |',
    `| a | b | ${'5'.repeat(400)} |`,
    '',
].join('\n');

// One rendered line is roughly the line height; two or more means a break.
async function lineCount(cell: import('@playwright/test').Locator) {
    return cell.evaluate((el) => {
        const content = el.querySelector('.mu-table-cell-content') as HTMLElement;
        const lineHeight = Number.parseFloat(getComputedStyle(content).lineHeight);
        return Math.round(content.getBoundingClientRect().height / lineHeight);
    });
}

test('short columns keep whole words beside a long prose column', async ({ page }) => {
    await page.evaluate(md => window.muya!.setContent(md), SQUEEZE_MD);
    const table = page.locator(editor.table).first();
    await expect(table).toBeVisible();

    const rows = table.locator('tr');
    // Header "Current" and body "disabled" each stay on a single line.
    await expect.poll(() => lineCount(rows.nth(0).locator('td, th').nth(1))).toBe(1);
    await expect.poll(() => lineCount(rows.nth(2).locator('td').nth(1))).toBe(1);
    await expect(table.locator('xpath=ancestor::figure[1]')).not.toHaveClass(/mu-table-wrap-anywhere/);

    // The prose column still wraps inside the editor rather than overflowing.
    const fits = await table.evaluate((el) => {
        const figure = el.closest('figure')!;
        return el.getBoundingClientRect().width <= figure.clientWidth + 1;
    });
    expect(fits).toBe(true);
});

test('an unbreakable run still wraps inside the editor (#5605)', async ({ page }) => {
    await page.evaluate(md => window.muya!.setContent(md), LONG_RUN_MD);
    const table = page.locator(editor.table).first();
    await expect(table).toBeVisible();

    const figure = table.locator('xpath=ancestor::figure[1]');
    await expect(figure).toHaveClass(/mu-table-wrap-anywhere/);
    await expect.poll(() => table.evaluate((el) => {
        const fig = el.closest('figure')!;
        return el.getBoundingClientRect().width <= fig.clientWidth + 1;
    })).toBe(true);
});

test('removing the long run returns the table to whole-word wrapping', async ({ page }) => {
    await page.evaluate(md => window.muya!.setContent(md), LONG_RUN_MD);
    const table = page.locator(editor.table).first();
    const figure = table.locator('xpath=ancestor::figure[1]');
    await expect(figure).toHaveClass(/mu-table-wrap-anywhere/);

    const longCell = table.locator('tr').nth(1).locator('td').nth(2);
    // The digit run is a single word, so a double-click selects all of it.
    await longCell.locator('.mu-table-cell-content').dblclick();
    await page.keyboard.type('short');
    await expect(longCell).toContainText('short');
    await expect(figure).not.toHaveClass(/mu-table-wrap-anywhere/);
});
