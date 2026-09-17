import { describe, expect, test } from 'bun:test'
import {
    addSource,
    deserializeSources,
    effectiveSources,
    parseSource,
    serializeSources
} from './sources'

describe('parseSource', () => {
    test('bare login is a user', () => {
        expect(parseSource('dsebastien')).toEqual({ kind: 'user', value: 'dsebastien' })
    })
    test('org: prefix is an org', () => {
        expect(parseSource('org:knowii-oss')).toEqual({ kind: 'org', value: 'knowii-oss' })
    })
    test('owner/name is a repo', () => {
        expect(parseSource('dsebastien/obsidian-typefully')).toEqual({
            kind: 'repo',
            value: 'dsebastien/obsidian-typefully'
        })
    })
    test('full GitHub URLs are accepted', () => {
        expect(parseSource('https://github.com/knowii-oss')).toEqual({
            kind: 'user',
            value: 'knowii-oss'
        })
        expect(parseSource('https://github.com/dsebastien/foo.git')).toEqual({
            kind: 'repo',
            value: 'dsebastien/foo'
        })
        expect(parseSource('github.com/DeveloPassion/')).toEqual({
            kind: 'user',
            value: 'DeveloPassion'
        })
    })
    test('@handle is a user', () => {
        expect(parseSource('@dsebastien')).toEqual({ kind: 'user', value: 'dsebastien' })
    })
    test('garbage is rejected', () => {
        expect(parseSource('')).toBeNull()
        expect(parseSource('   ')).toBeNull()
        expect(parseSource('a/b/c')).toBeNull()
        expect(parseSource('not a login!')).toBeNull()
        expect(parseSource('repo:justalogin')).toBeNull()
    })
})

describe('serialize / deserialize', () => {
    test('round-trips a mixed list', () => {
        const list = [
            { kind: 'user' as const, value: 'dsebastien' },
            { kind: 'org' as const, value: 'knowii-oss' },
            { kind: 'repo' as const, value: 'DeveloPassion/obsidian-starter-kit-plugin' }
        ]
        const s = serializeSources(list)
        expect(s).toBe('user:dsebastien,org:knowii-oss,DeveloPassion/obsidian-starter-kit-plugin')
        expect(deserializeSources(s)).toEqual(list)
    })
    test('drops junk and duplicates', () => {
        expect(deserializeSources('a,,??,a,A')).toEqual([{ kind: 'user', value: 'a' }])
        expect(deserializeSources(null)).toEqual([])
    })
})

describe('addSource', () => {
    test('is case-insensitive on the value', () => {
        const one = addSource([], { kind: 'user', value: 'Seb' })
        expect(addSource(one, { kind: 'user', value: 'seb' })).toHaveLength(1)
        expect(addSource(one, { kind: 'org', value: 'seb' })).toHaveLength(2)
    })
})

describe('effectiveSources', () => {
    const viewer = {
        login: 'me',
        avatar_url: '',
        html_url: '',
        name: null,
        orgs: ['acme', 'knowii-oss']
    }
    const configured = [{ kind: 'org' as const, value: 'knowii-oss' }]
    test('logged out: configured only', () => {
        expect(effectiveSources(configured, null, true)).toEqual(configured)
    })
    test('opted out: configured only', () => {
        expect(effectiveSources(configured, viewer, false)).toEqual(configured)
    })
    test('logged in and opted in: adds self and orgs without duplicates', () => {
        expect(effectiveSources(configured, viewer, true)).toEqual([
            { kind: 'org', value: 'knowii-oss' },
            { kind: 'user', value: 'me' },
            { kind: 'org', value: 'acme' }
        ])
    })
})
