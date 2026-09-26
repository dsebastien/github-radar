import { expect, test, type Page } from '@playwright/test'

const item = (id: number, title: string, pr = false, repo = 'acme/widgets') => ({
    id,
    node_id: `N${id}`,
    number: id,
    title,
    html_url: `https://github.com/${repo}/${pr ? 'pull' : 'issues'}/${id}`,
    repository_url: `https://api.github.com/repos/${repo}`,
    state: 'open',
    draft: false,
    ...(pr ? { pull_request: {} } : {}),
    labels: id === 1 ? [{ name: 'bug', color: 'd73a4a', description: null }] : [],
    user: { login: 'alice', avatar_url: 'https://example.invalid/a.png', html_url: '' },
    assignees: [],
    comments: 0,
    reactions: { total_count: 0 },
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-20T00:00:00Z',
    milestone: null
})

const ISSUES = [item(1, 'Crash on startup'), item(2, 'Add dark mode')]
const PRS = [item(3, 'Bump dependencies', true)]

/** A fake api.github.com: search per item type, and the detail of issue #1. */
async function mockGitHub(page: Page) {
    await page.route('https://api.github.com/**', async (route) => {
        const url = new URL(route.request().url())
        const json = (body: unknown) =>
            route.fulfill({
                status: 200,
                contentType: 'application/json',
                headers: { 'access-control-allow-origin': '*' },
                body: JSON.stringify(body)
            })
        if (url.pathname === '/search/issues') {
            const items = (url.searchParams.get('q') ?? '').includes('is:pull-request')
                ? PRS
                : ISSUES
            return json({ total_count: items.length, items })
        }
        if (url.pathname === '/repos/acme/widgets/issues/1')
            return json({
                body_html: '<p>Steps to reproduce: open the app.</p>',
                state: 'open',
                labels: [],
                assignees: []
            })
        if (url.pathname === '/repos/acme/widgets/issues/1/comments') return json([])
        return route.fulfill({ status: 404, body: '{}' })
    })
}

test('loads a preset, filters, and opens an item', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await mockGitHub(page)

    await page.goto('/?sources=org:acme')
    const cards = page.locator('article')
    await expect(cards).toHaveCount(3)
    await expect(page.getByText('Crash on startup')).toBeVisible()
    // The preset was imported, then removed from the address.
    expect(new URL(page.url()).search).toBe('')

    await page.getByLabel('Search', { exact: true }).fill('dark')
    await expect(cards).toHaveCount(1)
    await expect(cards.first()).toContainText('Add dark mode')
    await page.getByLabel('Clear search').click()
    await expect(cards).toHaveCount(3)

    await page.getByRole('button', { name: 'PRs' }).click()
    await expect(cards).toHaveCount(1)
    await expect(cards.first()).toContainText('Bump dependencies')
    await page.getByRole('button', { name: 'All', exact: true }).click()

    await page.locator('article', { hasText: 'Crash on startup' }).click()
    const panel = page.getByRole('complementary', { name: 'acme/widgets #1' })
    await expect(panel).toContainText('Steps to reproduce')

    expect(errors).toEqual([])
})

test('hides archived and dormant repositories, keeps dropdowns inside the viewport', async ({
    page
}) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await mockGitHub(page)
    const repo = (name: string, archived: boolean, daysAgo: number) => ({
        full_name: `acme/${name}`,
        archived,
        fork: false,
        open_issues_count: 1,
        pushed_at: new Date(Date.now() - daysAgo * 86_400_000).toISOString()
    })
    // Registered last, so these win over the generic mock.
    await page.route('https://api.github.com/orgs/acme/repos*', (route) =>
        route.fulfill({
            status: 200,
            contentType: 'application/json',
            headers: { 'access-control-allow-origin': '*' },
            body: JSON.stringify([
                repo('widgets', false, 1),
                repo('legacy', true, 10),
                repo('sleepy', false, 200)
            ])
        })
    )
    await page.route('https://api.github.com/search/issues*', (route) => {
        const pr = (new URL(route.request().url()).searchParams.get('q') ?? '').includes(
            'is:pull-request'
        )
        const items = pr
            ? PRS
            : [
                  ...ISSUES,
                  item(4, 'Old archived bug', false, 'acme/legacy'),
                  item(5, 'Forgotten request', false, 'acme/sleepy')
              ]
        return route.fulfill({
            status: 200,
            contentType: 'application/json',
            headers: { 'access-control-allow-origin': '*' },
            body: JSON.stringify({ total_count: items.length, items })
        })
    })

    await page.setViewportSize({ width: 800, height: 600 })
    await page.goto('/?sources=org:acme')
    const cards = page.locator('article')
    await expect(cards).toHaveCount(5)
    await expect(page.locator('article', { hasText: 'Old archived bug' })).toContainText('archived')

    await page.getByRole('button', { name: /^Hide archived/ }).click()
    await expect(cards).toHaveCount(4)
    await expect(page.getByText('Old archived bug')).toHaveCount(0)
    await page.getByRole('button', { name: /^Hide dormant repos/ }).click()
    await expect(cards).toHaveCount(3)
    await expect(page.getByText('Forgotten request')).toHaveCount(0)

    // Every filter dropdown stays inside the viewport and never makes the page scroll.
    const width = await page.evaluate(() => document.documentElement.clientWidth)
    for (const name of ['Labels', 'Repos', 'Authors', 'Assignees', 'Milestones']) {
        await page.getByRole('button', { name, exact: true }).click()
        const box = await page.locator('.fade-in.absolute').boundingBox()
        expect(box).not.toBeNull()
        expect(box!.x).toBeGreaterThanOrEqual(0)
        expect(box!.x + box!.width).toBeLessThanOrEqual(width)
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
            true
        )
        await page.keyboard.press('Escape')
    }

    expect(errors).toEqual([])
})
