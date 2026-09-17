import { describe, expect, test } from 'bun:test'
import { repoUrls } from './repo'

describe('repoUrls', () => {
    test('derives web, https and ssh addresses', () => {
        expect(repoUrls('dsebastien/github-radar')).toEqual({
            web: 'https://github.com/dsebastien/github-radar',
            https: 'https://github.com/dsebastien/github-radar.git',
            ssh: 'git@github.com:dsebastien/github-radar.git'
        })
    })

    test('tolerates surrounding slashes and whitespace', () => {
        expect(repoUrls(' /owner/name/ ').ssh).toBe('git@github.com:owner/name.git')
    })
})
