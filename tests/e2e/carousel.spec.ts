// Carousel 真实浏览器回归（e2e）
//
// 单测（happy-dom 无布局、不触发 scroll）验不了本组件的核心机制：**scroll-snap 吸附**。
// 这里用真浏览器确认四件事：
//   1. 一屏一页（每页宽 = 轨道宽）
//   2. 点箭头/圆点后 scrollLeft 精确落在页边界
//   3. 键盘方向键可翻页
//   4. prefers-reduced-motion 下自动播放不启动
import { test, expect, Page } from '@playwright/test'

const firstCarousel = (page: Page) => page.locator('.carousel').first()

const activeDotIndex = async (page: Page): Promise<number> =>
  firstCarousel(page)
    .locator('.carousel-dot')
    .evaluateAll((dots) => dots.findIndex((d) => d.getAttribute('aria-selected') === 'true'))

test.describe('Carousel 轮播', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/#/carousel')
    // 同上：首访要现编译，放宽到 15s
    await expect(page.locator('h1')).toContainText('Carousel', { timeout: 15_000 })
  })

  test('**一屏一页**：每页宽 = 轨道宽（scroll-snap 生效）', async ({ page }) => {
    const track = firstCarousel(page).locator('.carousel-track')
    const widths = await track.evaluate((el) => ({
      track: Math.round(el.getBoundingClientRect().width),
      slides: [...el.children].map((c) => Math.round(c.getBoundingClientRect().width)),
    }))
    expect(widths.slides.length).toBe(3)
    for (const w of widths.slides) expect(Math.abs(w - widths.track)).toBeLessThanOrEqual(1)

    const snap = await track.evaluate((el) => getComputedStyle(el).scrollSnapType)
    expect(snap).toContain('mandatory')
  })

  test('**点圆点 → scrollLeft 精确落一页宽**', async ({ page }) => {
    const card = firstCarousel(page)
    const track = card.locator('.carousel-track')
    // 先悬停暂停自动播放，避免干扰
    await card.hover()
    await card.locator('.carousel-dot').nth(1).click()
    await page.waitForTimeout(600)
    const { left, slideW } = await track.evaluate((el) => ({
      left: Math.round(el.scrollLeft),
      slideW: Math.round(el.children[0]!.getBoundingClientRect().width),
    }))
    expect(Math.abs(left - slideW)).toBeLessThanOrEqual(2)
    expect(await activeDotIndex(page)).toBe(1)
  })

  test('下一张 / 上一张：末页 loop 回首页', async ({ page }) => {
    const card = firstCarousel(page)
    await card.hover()
    const dots = card.locator('.carousel-dot')
    // 先到最后一张
    await dots.nth((await dots.count()) - 1).click()
    await page.waitForTimeout(600)
    expect(await activeDotIndex(page)).toBe((await dots.count()) - 1)
    // 再点下一页 → 应回到 0
    await card.locator('.carousel-arrow--next').click()
    await page.waitForTimeout(700)
    expect(await activeDotIndex(page)).toBe(0)
  })

  test('键盘方向键翻页', async ({ page }) => {
    const card = firstCarousel(page)
    await card.hover()
    await card.locator('.carousel-track').focus()
    const before = await activeDotIndex(page)
    await page.keyboard.press('ArrowRight')
    await page.waitForTimeout(700)
    expect(await activeDotIndex(page)).toBe(before + 1)
  })

  test('悬停时自动播放暂停', async ({ page }) => {
    const card = firstCarousel(page)
    await card.hover()
    const before = await activeDotIndex(page)
    await page.waitForTimeout(5200) // > 4s 的 autoplay
    expect(await activeDotIndex(page)).toBe(before)
  })

  test('**prefers-reduced-motion 下自动播放不启动**', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.reload()
    await expect(page.locator('h1')).toContainText('Carousel', { timeout: 15_000 })
    const before = await activeDotIndex(page)
    await page.waitForTimeout(5500) // > 4s 的 autoplay
    expect(await activeDotIndex(page)).toBe(before)
  })

  test('roving tabindex：整组圆点只有一个 Tab 停靠点', async ({ page }) => {
    const tabindexes = await firstCarousel(page)
      .locator('.carousel-dot')
      .evaluateAll((dots) => dots.map((d) => d.getAttribute('tabindex')))
    expect(tabindexes.filter((t) => t === '0').length).toBe(1)
    expect(tabindexes.filter((t) => t === '-1').length).toBe(tabindexes.length - 1)
  })
})
