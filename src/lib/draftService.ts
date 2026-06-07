import type { DraftPick, DraftState, LeagueMember } from '../types/index';

const TOTAL_TEAMS = 48;

/**
 * Initializes a new draft with the first pick ready to be made.
 *
 * @param memberCount - Number of league members participating in the draft.
 * @param teamsPerPerson - Number of teams each member will draft.
 * @returns Initial draft state with `current_user_id` left empty for the caller to set.
 */
export function initDraft(_memberCount: number, _teamsPerPerson: number): DraftState {
  return {
    current_pick: 1,
    current_round: 1,
    current_user_id: '',
    picks: [],
    is_complete: false,
  };
}

/**
 * Returns the `user_id` of the member whose turn it is to pick.
 * Uses snake draft order: odd rounds pick ascending by `draft_position`,
 * even rounds pick descending.
 *
 * @param state - Current draft state.
 * @param members - League members; sorted by `draft_position` ascending internally.
 * @returns The `user_id` of the current picker.
 */
export function getCurrentPicker(state: DraftState, members: LeagueMember[]): string {
  const sorted = [...members].sort((a, b) => a.draft_position - b.draft_position);
  const memberCount = sorted.length;

  if (memberCount === 0) {
    return '';
  }

  const pickInRound = (state.current_pick - 1) % memberCount;
  const isReverseRound = state.current_round % 2 === 0;
  const index = isReverseRound ? memberCount - 1 - pickInRound : pickInRound;

  return sorted[index].user_id;
}

/**
 * Records a draft pick and advances the draft to the next pick or round.
 *
 * @param state - Current draft state.
 * @param userId - `user_id` of the member making the pick.
 * @param teamCode - Team code being drafted.
 * @param memberCount - Number of members in the draft (picks per round).
 * @returns Updated draft state with the new pick applied.
 * @throws If it is not `userId`'s turn or `teamCode` has already been picked.
 */
export function makePick(
  state: DraftState,
  userId: string,
  teamCode: string,
  memberCount: number,
): DraftState {
  if (state.is_complete) {
    throw new Error('Draft is already complete');
  }

  if (state.current_user_id !== userId) {
    throw new Error('It is not this user\'s turn to pick');
  }

  if (state.picks.some((pick) => pick.teamId === teamCode)) {
    throw new Error('Team has already been picked');
  }

  const pick: DraftPick = {
    teamId: teamCode,
    playerId: userId,
    pickNumber: state.current_pick,
  };

  const picks = [...state.picks, pick];
  const roundComplete = state.current_pick % memberCount === 0;
  const current_round = roundComplete ? state.current_round + 1 : state.current_round;
  const current_pick = state.current_pick + 1;
  const is_complete = picks.length >= TOTAL_TEAMS;

  return {
    current_pick,
    current_round,
    current_user_id: '',
    picks,
    is_complete,
  };
}

/**
 * Checks whether the draft has reached the expected number of picks.
 *
 * @param state - Current draft state.
 * @param totalPicks - Total number of picks required to complete the draft.
 * @returns `true` when `state.picks.length` is greater than or equal to `totalPicks`.
 */
export function isDraftComplete(state: DraftState, totalPicks: number): boolean {
  return state.picks.length >= totalPicks;
}
