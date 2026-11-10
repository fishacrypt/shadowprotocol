import { BaseError, ContractFunctionRevertedError, UserRejectedRequestError } from 'viem'

const CONTRACT_ERRORS: Record<string, string> = {
  InvalidConfig: 'Those match settings are not allowed.',
  WrongState: 'The match is not in the right phase for that action yet.',
  NotCreator: 'Only the match creator can do that.',
  AlreadyJoined: 'You are already in this match.',
  MatchFull: 'This match is full.',
  NotPlayer: 'You are not a player in this match.',
  AlreadySubmitted: 'You already sealed a move this round. Moves cannot be changed.',
  DeadlinePassed: 'The round deadline has passed.',
  RoundStillOpen: 'Waiting for players. The round can be resolved once everyone submits or time runs out.',
  NotEnoughPlayers: 'At least two players are needed to start.',
  BadLength: 'Unexpected number of scores.',
  UnknownMatch: 'That match does not exist.',
  CannotCancel: 'Only the creator can cancel before the lobby times out.',
  NotWinner: 'Only winners can claim the prize.',
  AlreadyClaimed: 'Already claimed.',
  PrizeDisabled: 'Prize pools are disabled for this deployment.',
  InvalidKMSSignatures: 'The decryption proof was rejected. Try again in a moment.',
  ReentrancyGuardReentrantCall: 'Another claim is in progress. Try again.',
}

export interface ParsedError {
  message: string
  /** True when the user simply dismissed the wallet prompt. */
  cancelled: boolean
}

export function parseError(error: unknown): ParsedError {
  if (error instanceof BaseError) {
    if (error.walk((e) => e instanceof UserRejectedRequestError)) {
      return { message: 'Transaction cancelled in your wallet.', cancelled: true }
    }
    const reverted = error.walk((e) => e instanceof ContractFunctionRevertedError)
    if (reverted instanceof ContractFunctionRevertedError) {
      const name = reverted.data?.errorName
      if (name && CONTRACT_ERRORS[name]) return { message: CONTRACT_ERRORS[name], cancelled: false }
      if (name) return { message: \`Contract rejected the action (\${name}).\`, cancelled: false }
    }
  }
  const text = error instanceof Error ? error.message : String(error)
  const lower = text.toLowerCase()
  if (lower.includes('user rejected') || lower.includes('user denied') || lower.includes('rejected the request')) {
    return { message: 'Request cancelled in your wallet.', cancelled: true }
  }
  if (lower.includes('insufficient funds')) {
    return { message: 'Not enough Sepolia ETH for gas. Top up from a Sepolia faucet.', cancelled: false }
  }
  if (lower.includes('not_ready_for_decryption') || lower.includes('not ready')) {
    return { message: 'The coprocessor is still computing. Retrying shortly is safe.', cancelled: false }
  }
  if (lower.includes('network') || lower.includes('timeout') || lower.includes('fetch failed') || lower.includes('failed to fetch')) {
    return { message: 'Network issue reaching Sepolia or the Zama relayer. Check your connection and retry.', cancelled: false }
  }
  if (lower.includes('not authorized') || lower.includes('not allowed') || lower.includes('not authorised')) {
    return { message: 'Your wallet is not authorised to decrypt that value.', cancelled: false }
  }
  if (lower.includes('reverted')) return { message: 'The transaction reverted onchain. Nothing was changed.', cancelled: false }

  // Preserve the underlying diagnostic message during troubleshooting.
  const detail = text.replace(/https?:\/\/\S+/g, '[URL]').slice(0, 240)
  return {
    message: detail
      ? \`Seed/action failed: \${detail}\`
      : 'Something went wrong. Nothing was changed, so it is safe to retry.',
    cancelled: false,
  }
}
