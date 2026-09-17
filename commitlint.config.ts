import type { UserConfig } from '@commitlint/types'

const Configuration: UserConfig = {
    extends: ['@commitlint/config-conventional'],
    rules: {
        'header-max-length': [1, 'always', 100],
        'scope-enum': [2, 'always', ['all', 'app', 'build', 'deps', 'docs', 'release']],
        'scope-case': [2, 'always', 'lowercase']
    }
}

export default Configuration
