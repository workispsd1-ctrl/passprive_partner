import { useDispatch } from 'react-redux';
import type { AppDispatch } from './stor';

export const useAppDispatch: () => AppDispatch = useDispatch;
