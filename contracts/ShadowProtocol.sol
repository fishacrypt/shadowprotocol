// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.24;

import {FHE, ebool, euint32, euint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {Proxy} from "@openzeppelin/contracts/proxy/Proxy.sol";
import {ShadowStorage} from "./ShadowStorage.sol";
import {IConfidentialToken} from "./interfaces/IConfidentialToken.sol";

/// @title Shadow Protocol
/// @notice Multiplayer sealed-bid strategy game. Every player move (action, bid, tactical power, target)
///         is an FHE ciphertext. Winners, credits and scores are computed homomorphically; only the
///         round winner index, the artifact seed and the final scores are ever made publicly decryptable.
///
/// Encrypted: action, bid, tactical power, sabotage target, per-player credits, per-player scores (until the end).
/// Public:    who joined, who submitted (not what), deadlines, artifact seed (after reveal), round winner index,
///            final scores, rankings, missed-round counts.
///
/// Rules (all deterministic, enforced onchain):
///  - 2-4 players, 5 rounds, 1000 starting credits, +100 income per submitted round.
///  - Action 0 BID: sealed first-price bid. The winner pays their bid, losers keep their credits.
///  - Action 1 SHIELD: bid + burn `power` credits to absorb that much incoming sabotage.
///  - Action 2 SABOTAGE: bid + burn `power` credits to cut the target's effective bid (after their shield).
///  - Action 3 DOUBLE: bid + stake `power` (needs 2*power >= bid). Win: artifact points x2, stake returned.
///                     Lose: stake burned and -1 point.
///  - Action 4 PASS: no bid, no spend, +150 credit rest bonus.
///  - Bids and powers are clamped to the credits a player actually holds, so over-spending is impossible.
///  - Highest effective bid wins the artifact. Ties go to the first player in a start order that rotates every
///    round (round % playerCount). An effective bid of 0 never wins.
///  - A player who misses a round is auto-passed without income. After 3 misses they cannot win the prize.
///
/// Architecture: this contract owns all state (lobby, seed, finalization, prizes). The encrypted round engine
/// (submitMove / closeRound / applyRound) lives in ShadowRounds and is reached through `fallback` delegatecall.
contract ShadowProtocol is ShadowStorage, ZamaEthereumConfig, Proxy {
    /// @notice Round engine executed via delegatecall (immutable, so it can never be swapped).
    address public immutable roundEngine;

    constructor(address prizeToken_, address roundEngine_) {
        prizeToken = IConfidentialToken(prizeToken_);
        roundEngine = roundEngine_;
    }

    function _implementation() internal view override returns (address) {
        return roundEngine;
    }

    // ---------------------------------------------------------------------
    // Lobby
    // ---------------------------------------------------------------------
    function createMatch(uint8 maxPlayers, uint32 roundDuration) external returns (uint256 id) {
        if (maxPlayers < MIN_PLAYERS || maxPlayers > MAX_PLAYERS) revert InvalidConfig();
        if (roundDuration < MIN_ROUND_DURATION || roundDuration > MAX_ROUND_DURATION) revert InvalidConfig();
        id = ++matchCount;
        Match storage m = matches[id];
        m.creator = msg.sender;
        m.maxPlayers = maxPlayers;
        m.roundDuration = roundDuration;
        m.createdAt = uint64(block.timestamp);
        m.state = State.Lobby;
        emit MatchCreated(id, msg.sender, maxPlayers, roundDuration);
        _addPlayer(id, m, msg.sender);
    }

    function joinMatch(uint256 id) external exists(id) {
        Match storage m = matches[id];
        if (m.state != State.Lobby) revert WrongState(m.state);
        if (slotPlusOne[id][msg.sender] != 0) revert AlreadyJoined();
        if (m.playerCount >= m.maxPlayers) revert MatchFull();
        _addPlayer(id, m, msg.sender);
        if (m.playerCount == m.maxPlayers) _start(id, m);
    }

    /// @notice Creator can start early once at least two players have joined.
    function startMatch(uint256 id) external exists(id) {
        Match storage m = matches[id];
        if (m.state != State.Lobby) revert WrongState(m.state);
        if (msg.sender != m.creator) revert NotCreator();
        if (m.playerCount < MIN_PLAYERS) revert NotEnoughPlayers();
        _start(id, m);
    }

    /// @notice Creator may cancel a lobby at any time; anyone may after the lobby timeout.
    function cancelMatch(uint256 id) external exists(id) {
        Match storage m = matches[id];
        if (m.state != State.Lobby) revert WrongState(m.state);
        if (msg.sender != m.creator && block.timestamp < m.createdAt + LOBBY_TIMEOUT) revert CannotCancel();
        m.state = State.Cancelled;
        emit MatchCancelled(id);
    }

    function _addPlayer(uint256 id, Match storage m, address player) internal {
        players[id].push(player);
        uint8 slot = m.playerCount;
        slotPlusOne[id][player] = slot + 1;
        m.playerCount = slot + 1;
        emit PlayerJoined(id, player, slot);
    }

    function _start(uint256 id, Match storage m) internal {
        m.state = State.AwaitingSeed;
        // Fair, unpredictable artifact seed: produced inside the FHE coprocessor, decryptable only via
        // the KMS public-decryption flow once the lobby is closed, verified onchain in revealSeed().
        euint64 seedCt = FHE.randEuint64();
        FHE.allowThis(seedCt);
        FHE.makePubliclyDecryptable(seedCt);
        m.seedCt = seedCt;
        for (uint8 i = 0; i < m.playerCount; i++) {
            address p = players[id][i];
            euint32 c = FHE.asEuint32(START_CREDITS);
            FHE.allowThis(c);
            FHE.allow(c, p);
            credits[id][i] = c;
            euint32 s = FHE.asEuint32(0);
            FHE.allowThis(s);
            FHE.allow(s, p);
            scores[id][i] = s;
        }
        emit MatchStarted(id, FHE.toBytes32(seedCt));
    }

    /// @notice Anyone can reveal the artifact seed by submitting the KMS-signed cleartext.
    function revealSeed(uint256 id, uint64 seed, bytes calldata proof) external exists(id) {
        Match storage m = matches[id];
        if (m.state != State.AwaitingSeed) revert WrongState(m.state);
        bytes32[] memory handles = new bytes32[](1);
        handles[0] = FHE.toBytes32(m.seedCt);
        FHE.checkSignatures(handles, abi.encode(uint256(seed)), proof);
        m.seed = seed;
        m.seedRevealed = true;
        m.state = State.Commit;
        m.deadline = uint64(block.timestamp) + m.roundDuration;
        emit SeedRevealed(id, seed);
    }

    // ---------------------------------------------------------------------
    // Finalization & rewards
    // ---------------------------------------------------------------------
    /// @notice Submit the KMS-verified final scores. Ranks players, updates profiles, pays the cUSDT prize.
    function finalizeMatch(uint256 id, uint32[] calldata finalScoreValues, bytes calldata proof)
        external
        exists(id)
        nonReentrant
    {
        Match storage m = matches[id];
        if (m.state != State.Finalizing) revert WrongState(m.state);
        if (finalScoreValues.length != m.playerCount) revert BadLength();
        _verifyScores(id, m.playerCount, finalScoreValues, proof);

        m.state = State.Complete; // effects before the external token call
        completedMatches++;
        (uint8 mask, uint8 winnerCount) = _rank(id, m.playerCount, finalScoreValues);
        winnersMask[id] = mask;
        emit MatchFinalized(id, finalScoreValues, mask);
        _distributePrize(id, m, winnerCount);
    }

    function _verifyScores(uint256 id, uint8 n, uint32[] calldata values, bytes calldata proof) internal {
        bytes32[] memory handles = new bytes32[](n);
        bytes memory clear;
        for (uint8 i = 0; i < n; i++) {
            handles[i] = FHE.toBytes32(scores[id][i]);
            clear = bytes.concat(clear, abi.encode(uint256(values[i])));
        }
        FHE.checkSignatures(handles, clear, proof);
    }

    /// Only players who stayed active (< MAX_MISSES missed rounds) can win. Ties share the prize.
    function _rank(uint256 id, uint8 n, uint32[] calldata values) internal returns (uint8 mask, uint8 winnerCount) {
        uint32 top;
        for (uint8 i = 0; i < n; i++) {
            if (missedRounds[id][i] < MAX_MISSES && values[i] > top) top = values[i];
        }
        for (uint8 i = 0; i < n; i++) {
            Stats storage st = stats[players[id][i]];
            st.matches++;
            st.totalScore += values[i];
            if (values[i] > st.bestScore) st.bestScore = values[i];
            if (top > 0 && missedRounds[id][i] < MAX_MISSES && values[i] == top) {
                mask |= uint8(1) << i;
                winnerCount++;
                st.wins++;
            }
        }
    }

    /// Records the encrypted per-winner share. Payment itself is a retryable pull (claimPrize / claimRefund),
    /// so a failing or paused token can never strand funds or freeze finalization.
    function _distributePrize(uint256 id, Match storage m, uint8 winnerCount) internal {
        if (!m.prizeFunded || winnerCount == 0) return;
        prizeShare[id] = FHE.allowThis(FHE.div(m.prizePool, uint64(winnerCount)));
        emit PrizeAllocated(id, winnerCount);
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------
    struct MatchView {
        address creator;
        uint8 maxPlayers;
        uint8 playerCount;
        State state;
        uint8 round;
        uint32 roundDuration;
        uint64 deadline;
        uint64 createdAt;
        bool seedRevealed;
        bool prizeFunded;
        uint8 submittedMask;
    }

    function getMatch(uint256 id) external view exists(id) returns (MatchView memory v) {
        Match storage m = matches[id];
        v.creator = m.creator;
        v.maxPlayers = m.maxPlayers;
        v.playerCount = m.playerCount;
        v.state = m.state;
        v.round = m.round;
        v.roundDuration = m.roundDuration;
        v.deadline = m.deadline;
        v.createdAt = m.createdAt;
        v.seedRevealed = m.seedRevealed;
        v.prizeFunded = m.prizeFunded;
        if (m.state == State.Commit) {
            for (uint8 i = 0; i < m.playerCount; i++) {
                if (moves[id][m.round][i].submitted) v.submittedMask |= uint8(1) << i;
            }
        }
    }

    function getPlayers(uint256 id) external view exists(id) returns (address[] memory) {
        return players[id];
    }

    /// @notice Handles a player can pass to the relayer for user decryption (credits, score).
    function getPlayerHandles(uint256 id, address player) external view returns (bytes32 credit, bytes32 score) {
        uint8 s = slotPlusOne[id][player];
        if (s == 0) revert NotPlayer();
        return (FHE.toBytes32(credits[id][s - 1]), FHE.toBytes32(scores[id][s - 1]));
    }

    function seedHandle(uint256 id) external view returns (bytes32) {
        return FHE.toBytes32(matches[id].seedCt);
    }

    function roundResultHandle(uint256 id, uint8 round) external view returns (bytes32) {
        return FHE.toBytes32(roundResultCt[id][round]);
    }

    function scoreHandles(uint256 id) external view returns (bytes32[] memory out) {
        uint8 n = matches[id].playerCount;
        out = new bytes32[](n);
        for (uint8 i = 0; i < n; i++) out[i] = FHE.toBytes32(scores[id][i]);
    }

}
