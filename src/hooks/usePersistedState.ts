import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import { load, save } from '@/lib/storage'

/**
 * useState whose value is mirrored into localStorage under `key`. `initial`, when given,
 * wins over the stored value (for example a view loaded from the URL).
 */
export function usePersistedState<T>(
    key: string,
    fallback: T,
    initial?: T
): [T, Dispatch<SetStateAction<T>>] {
    const [value, setValue] = useState<T>(() => initial ?? load(key, fallback))
    useEffect(() => {
        save(key, value)
    }, [key, value])
    return [value, setValue]
}
