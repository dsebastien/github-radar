import { expect, test, type Page } from '@playwright/test'

const item = (id: number, title: string, pr = false) => ({
    id,
    node_id: `N${id}`,
    number: id,
    title,
    html_url: `https://github.com/acme/widgets/${pr ? 'pull' : 'issues'}/${id}`,
    repository_url: 'https://api.github.com/repos/acme/widgets',
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
