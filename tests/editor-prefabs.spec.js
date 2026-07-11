import { test, expect } from '@playwright/test';
import { bootGame } from './helpers/setup.js';

test.use({ viewport: { width: 1280, height: 720 } });

test('editor prefabs: save, list, load, place, reorder, delete', async ({ page }) => {
  test.setTimeout(300_000);

  const pageErrors = [];
  page.on('pageerror', err => pageErrors.push(err.message));

  await bootGame(page);

  await test.step('enter editor', async () => {
    await page.getByRole('button', { name: 'Editor' }).click();
    await expect(page.locator('.editor-ui')).toBeVisible({ timeout: 20_000 });
  });

  const categoryBar = page.locator('.category-panel');
  const miniToolbar = page.locator('.mini-toolbar-container');
  const copyButton = miniToolbar.locator('> button').nth(1);
  const pasteButton = miniToolbar.locator('> button').nth(2);
  const savePrefabButton = miniToolbar.locator('> button').nth(3);
  const undoButton = miniToolbar.locator('.undo-container > button').nth(0);
  const center = { x: 640, y: 360 };
  const second = { x: 940, y: 360 };

  await test.step('save prefab button starts disabled', async () => {
    await expect(savePrefabButton.locator('img')).toHaveAttribute('src', 'images/save.svg');
    await expect(savePrefabButton).toBeDisabled();
    await expect(pasteButton).toBeDisabled();
  });

  await test.step('prefab category sits below the erase button', async () => {
    await expect(categoryBar.locator('> button').nth(0).locator('img')).toHaveAttribute('src', 'images/erase.svg');
    await expect(categoryBar.locator('> button').nth(1).locator('img')).toHaveAttribute('src', 'images/save.svg');
    // real part categories appear once the part registry has loaded
    await expect(async () => {
      expect(await categoryBar.locator('> button').count()).toBeGreaterThan(2);
    }).toPass({ timeout: 60_000 });
  });

  await test.step('place a part', async () => {
    await categoryBar.locator('> button').nth(2).click();
    await expect(page.locator('.part-panel:not(.hidden)')).toBeVisible();
    // parts are placed in the update loop while the left button is held
    await page.mouse.move(center.x, center.y);
    await page.mouse.down();
    await page.waitForTimeout(300);
    await page.mouse.up();
    await expect(undoButton).toBeEnabled();
  });

  await test.step('copy the placed part enables save prefab', async () => {
    await copyButton.click();
    await page.mouse.click(center.x, center.y);
    await page.mouse.click(center.x + 5, center.y + 5);
    await expect(pasteButton).toBeEnabled();
    await expect(savePrefabButton).toBeEnabled();
  });

  await test.step('save prefab stores it in localStorage', async () => {
    await savePrefabButton.click();
    await expect(page.locator('.editor-ui > .message')).toHaveText('Prefab saved', { timeout: 15_000 });
    const prefabs = await page.evaluate(() => JSON.parse(localStorage.getItem('prefabs')));
    expect(prefabs).toHaveLength(1);
    expect(prefabs[0].parts.length).toBeGreaterThan(0);
    expect(prefabs[0].tiles.length).toBeGreaterThan(0);
    expect(prefabs[0].thumbnail).toMatch(/^data:image\/png/);
  });

  await test.step('save a second prefab of a different part', async () => {
    await page.locator('.part-panel:not(.hidden) > button').nth(1).click();
    await page.mouse.move(second.x, second.y);
    await page.mouse.down();
    await page.waitForTimeout(300);
    await page.mouse.up();
    await copyButton.click();
    await page.mouse.click(second.x, second.y);
    await page.mouse.click(second.x + 5, second.y + 5);
    await savePrefabButton.click();
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('prefabs')).length), { timeout: 15_000 }).toBe(2);
  });

  await test.step('clear active placement and empty the track', async () => {
    await page.locator('.part-panel:not(.hidden) > button').first().click();
    await undoButton.click();
    await undoButton.click();
    await expect(undoButton).toBeDisabled();
  });

  const prefabButtons = page.locator('.part-panel:not(.hidden) > button[draggable="true"]');
  const trashButton = page.locator('.part-panel:not(.hidden) img[src="images/delete.svg"]');
  const storedIds = () => page.evaluate(() => JSON.parse(localStorage.getItem('prefabs')).map(p => p.parts[0].id));

  await test.step('prefab category lists both prefabs below a trash button', async () => {
    await categoryBar.locator('> button').nth(1).click();
    await expect(categoryBar.locator('> button').nth(1)).toHaveClass('selected');
    await expect(trashButton).toBeVisible();
    await expect(prefabButtons).toHaveCount(2);
    await expect(prefabButtons.first().locator('img')).toHaveAttribute('src', /^data:image\/png/);
  });

  await test.step('dragging reorders and persists', async () => {
    const before = await storedIds();
    expect(before[0]).not.toBe(before[1]);
    // drag up
    await prefabButtons.nth(1).dragTo(prefabButtons.nth(0));
    await expect.poll(storedIds).toEqual([before[1], before[0]]);
    // drag down
    await prefabButtons.nth(0).dragTo(prefabButtons.nth(1));
    await expect.poll(storedIds).toEqual([before[0], before[1]]);
    await expect(prefabButtons).toHaveCount(2);
  });

  await test.step('clicking a prefab loads it for pasting', async () => {
    await prefabButtons.first().click();
    await expect(pasteButton).toBeEnabled();
    await page.mouse.move(center.x, center.y);
    await page.mouse.click(center.x, center.y);
    await expect(undoButton).toBeEnabled();
  });

  const confirmDialog = page.locator('.message-box-ui');

  await test.step('trash drop asks for confirmation; cancel keeps the prefab', async () => {
    const before = await storedIds();
    await prefabButtons.nth(1).dragTo(trashButton);
    await expect(confirmDialog).toBeVisible();
    await confirmDialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(confirmDialog).toBeHidden();
    await expect(prefabButtons).toHaveCount(2);
    expect(await storedIds()).toEqual(before);
  });

  await test.step('confirming the dialog deletes the prefab', async () => {
    const before = await storedIds();
    await prefabButtons.nth(1).dragTo(trashButton);
    await confirmDialog.getByRole('button', { name: 'Delete' }).click();
    await expect(prefabButtons).toHaveCount(1);
    await expect.poll(storedIds).toEqual([before[0]]);
  });

  await test.step('prefabs persist across reload', async () => {
    const before = await storedIds();
    await bootGame(page);
    await page.getByRole('button', { name: 'Editor' }).click();
    await expect(page.locator('.editor-ui')).toBeVisible({ timeout: 20_000 });
    await categoryBar.locator('> button').nth(1).click();
    await expect(prefabButtons).toHaveCount(1);
    expect(await storedIds()).toEqual(before);
  });

  await test.step('shift-dragging to the trash deletes without confirmation', async () => {
    await page.keyboard.down('Shift');
    await prefabButtons.first().dragTo(trashButton);
    await page.keyboard.up('Shift');
    await expect(confirmDialog).toBeHidden();
    await expect(prefabButtons).toHaveCount(0);
    await expect.poll(storedIds).toEqual([]);
  });

  expect(pageErrors).toEqual([]);
});
