import { useSelector } from 'react-redux';
import { RootState } from '../store';

export function useChat(storeToken: string) {
  return useSelector((s: RootState) => s.chat[storeToken]);
}
