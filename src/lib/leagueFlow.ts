import type { League } from '../types/index';

const LOTTERY_PHASE_STATUSES = [
  'active',
  'lottery',
  'lottery_order',
  'lottery_complete',
] as const;

export type LotteryPhaseStatus = (typeof LOTTERY_PHASE_STATUSES)[number];

export function isLotteryPhase(status: League['draft_status']): status is LotteryPhaseStatus {
  return (LOTTERY_PHASE_STATUSES as readonly string[]).includes(status);
}

export function isLotteryComplete(status: League['draft_status']): boolean {
  return status === 'lottery_complete';
}
