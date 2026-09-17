import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import { load, save } from '@/lib/storage'

/** useState whose value is mirrored into localStorage under `key`. */
export function usePersistedState<T>(key: string, fallback: T): [T, Dispatch<SetStateAction<T>>] {
    const [value, setValue] = useState<T>(() => load(key, fallback))
    useEffect(() => {
        save(key, value)
    }, [key, value])
    return [value, setValue]
}
