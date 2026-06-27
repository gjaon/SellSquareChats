import { useSelector } from 'react-redux';
import { RootState } from '../store';

export function useAuth() {
  return useSelector((s: RootState) => s.auth);
}
