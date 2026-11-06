// The typed Redux hooks. Importing `useDispatch` / `useSelector` from react-redux elsewhere is a
// lint error; this file is the one place that does.
/* eslint-disable no-restricted-imports */
import { useDispatch, useSelector } from 'react-redux'

import type { AppDispatch, RootState } from '@/app/store'

export const useAppDispatch = useDispatch.withTypes<AppDispatch>()
export const useAppSelector = useSelector.withTypes<RootState>()
