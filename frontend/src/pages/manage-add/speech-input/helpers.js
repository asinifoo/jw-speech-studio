import { cleanMd } from '../../../components/utils';

export function parseScriptures(raw) {
  const scr = cleanMd(raw || '');
  const hasPub = scr.includes('「') || scr.includes('」');
  const hasScr = scr && !hasPub;
  return { scr, hasPub, hasScr };
}
