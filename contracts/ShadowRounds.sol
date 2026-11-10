// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.24;

import {FHE, ebool, euint32, euint64, externalEuint32} from "@fhevm/solidity/lib/FHE.sol";
import {ShadowStorage} from "./ShadowStorage.sol";
import {IConfidentialTransferReceiver} from "./interfaces/IConfidentialToken.sol";

/// @title Shadow Protocol round engine
/// @notice Encrypted move submission, round resolution and confidential prize escrow / claims. Deployed once and executed by ShadowProtocol via
///         delegatecall, so every ciphertext, ACL grant and event belongs to the ShadowProtocol address. The split
///         exists only to keep each contract inside the chain's contract-size / deployment-gas budget.
contract ShadowRounds is ShadowStorage, IConfidentialTransferReceiver {
    // ---------------------------------------------------------------------
    // Encrypted move submission
    // ---------------------------------------------------------------------
    /// @notice Submit one sealed move for the current round. All four inputs share one ZK proof.
    /// @param action  encrypted 0 BID, 1 SHIELD, 2 SABOTAGE, 3 DOUBLE, 4 PASS (anything else acts as BID)
    /// @param bid     encrypted credits offered for the artifact
    /// @param power   encrypted credits committed to the tactic (shield / sabotage / double stake)
    /// @param target  encrypted slot index of the sabotage target
    function submitMove(
        uint256 id,
        externalEuint32 action,
        externalEuint32 bid,
        externalEuint32 power,
        externalEuint32 target,
        bytes calldata inputProof
    ) external exists(id) {
        (uint8 slot, uint8 round) = _checkSubmit(id);
        Inputs memory x = _decode(action, bid, power, target, inputProof);
        _processMove(id, round, slot, x);
        emit MoveSubmitted(id, round, msg.sender);
    }

    struct Inputs {
        euint32 action;
        euint32 bid;
        euint32 power;
        euint32 target;
    }

    function _checkSubmit(uint256 id) internal returns (uint8 slot, uint8 round) {
        Match storage m = matches[id];
        if (m.state != State.Commit) revert WrongState(m.state);
        if (block.timestamp > m.deadline) revert DeadlinePassed();
        uint8 slotPlus = slotPlusOne[id][msg.sender];
        if (slotPlus == 0) revert NotPlayer();
        slot = slotPlus - 1;
        round = m.round;
        Move storage mv = moves[id][round][slot];
        if (mv.submitted) revert AlreadySubmitted();
        mv.submitted = true;
    }

    function _decode(
        externalEuint32 action,
        externalEuint32 bid,
        externalEuint32 power,
        externalEuint32 target,
        bytes calldata inputProof
    ) internal returns (Inputs memory x) {
        x.action = FHE.fromExternal(action, inputProof);
        x.bid = FHE.fromExternal(bid, inputProof);
        x.power = FHE.fromExternal(power, inputProof);
        x.target = FHE.fromExternal(target, inputProof);
    }

    function _processMove(uint256 id, uint8 round, uint8 me, Inputs memory x) internal {
        Move storage mv = moves[id][round][me];
        ebool isPass = FHE.eq(x.action, ACT_PASS);
        // Clamp to what the player really holds: bid first, then power from the remainder.
        euint32 bid = FHE.select(isPass, FHE.asEuint32(0), _atMost(x.bid, credits[id][me]));
        euint32 power = _atMost(x.power, FHE.sub(credits[id][me], bid));
        mv.bid = FHE.allowThis(bid);
        mv.isPass = FHE.allowThis(isPass);
        _tactics(id, round, me, x, power);
    }

    function _atMost(euint32 a, euint32 cap) internal returns (euint32) {
        return FHE.select(FHE.gt(a, cap), cap, a);
    }

    function _tactics(uint256 id, uint8 round, uint8 me, Inputs memory x, euint32 power) internal {
        Move storage mv = moves[id][round][me];
        uint8 n = matches[id].playerCount;
        euint32 zero = FHE.asEuint32(0);
        // DOUBLE only counts when the stake is at least half the bid.
        ebool dblOk = FHE.and(FHE.eq(x.action, ACT_DOUBLE), FHE.ge(FHE.add(power, power), mv.bid));
        // SABOTAGE always burns its power; it only lands on a valid opponent slot (see _routeSabotage).
        ebool sabOk = FHE.eq(x.action, ACT_SABOTAGE);
        euint32 shield = FHE.select(FHE.eq(x.action, ACT_SHIELD), power, zero);
        mv.shield = FHE.allowThis(shield);
        mv.sunk = FHE.allowThis(FHE.add(shield, FHE.select(sabOk, power, zero)));
        mv.stake = FHE.allowThis(FHE.select(dblOk, power, zero));
        mv.isDouble = FHE.allowThis(dblOk);
        _routeSabotage(mv, sabOk, x.target, power, me, n);
    }

    function _routeSabotage(Move storage mv, ebool sabOk, euint32 t, euint32 power, uint8 me, uint8 n) internal {
        euint32 zero = FHE.asEuint32(0);
        for (uint8 k = 0; k < n; k++) {
            if (k == me) {
                mv.sabOut[k] = FHE.allowThis(zero);
            } else {
                mv.sabOut[k] = FHE.allowThis(FHE.select(FHE.and(sabOk, FHE.eq(t, uint32(k))), power, zero));
            }
        }
    }

    // ---------------------------------------------------------------------
    // Round resolution (two permissionless steps to stay inside the FHE complexity budget)
    // ---------------------------------------------------------------------
    /// @notice Step 1: compute effective bids and the winner entirely under encryption.
    ///         Callable once everyone has submitted, or after the deadline.
    function closeRound(uint256 id) external exists(id) {
        Match storage m = matches[id];
        if (m.state != State.Commit) revert WrongState(m.state);
        uint8 n = m.playerCount;
        uint8 r = m.round;
        if (_submittedCount(id, r, n) < n && block.timestamp <= m.deadline) revert RoundStillOpen();

        (euint32 bestSlot, uint8 missedMask) = _resolveWinner(id, r, n);
        for (uint8 i = 0; i < n; i++) {
            wonFlag[id][i] = FHE.allowThis(FHE.eq(bestSlot, uint32(i)));
        }
        FHE.allowThis(bestSlot);
        FHE.makePubliclyDecryptable(bestSlot);
        roundResultCt[id][r] = bestSlot;
        m.state = State.Resolving;
        emit RoundClosed(id, r, FHE.toBytes32(bestSlot), missedMask);
    }

    function _submittedCount(uint256 id, uint8 r, uint8 n) internal view returns (uint8 c) {
        for (uint8 i = 0; i < n; i++) {
            if (moves[id][r][i].submitted) c++;
        }
    }

    function _resolveWinner(uint256 id, uint8 r, uint8 n) internal returns (euint32 bestSlot, uint8 missedMask) {
        euint32 best = FHE.asEuint32(0);
        bestSlot = FHE.asEuint32(NO_WINNER);
        for (uint8 s = 0; s < n; s++) {
            uint8 i = uint8((uint256(r) + s) % n); // rotating start order breaks ties fairly
            if (!moves[id][r][i].submitted) {
                missedRounds[id][i]++;
                missedMask |= uint8(1) << i;
                continue;
            }
            euint32 eff = _effectiveBid(id, r, i, n);
            ebool beats = FHE.gt(eff, best);
            best = FHE.select(beats, eff, best);
            bestSlot = FHE.select(beats, FHE.asEuint32(i), bestSlot);
        }
    }

    function _effectiveBid(uint256 id, uint8 r, uint8 i, uint8 n) internal returns (euint32) {
        Move storage mv = moves[id][r][i];
        euint32 incoming = FHE.asEuint32(0);
        for (uint8 j = 0; j < n; j++) {
            if (j != i && moves[id][r][j].submitted) {
                incoming = FHE.add(incoming, moves[id][r][j].sabOut[i]);
            }
        }
        euint32 zero = FHE.asEuint32(0);
        euint32 net = FHE.select(FHE.gt(incoming, mv.shield), FHE.sub(incoming, mv.shield), zero);
        return FHE.select(FHE.gt(mv.bid, net), FHE.sub(mv.bid, net), zero);
    }

    /// @notice Step 2: settle credits and scores under encryption, then open the next round or finish.
    function applyRound(uint256 id) external exists(id) {
        Match storage m = matches[id];
        if (m.state != State.Resolving) revert WrongState(m.state);
        uint8 r = m.round;
        uint32 points = artifactPoints(id, r);
        for (uint8 i = 0; i < m.playerCount; i++) {
            _applyPlayer(id, r, i, points);
        }
        emit RoundApplied(id, r);
        m.round = r + 1;
        if (m.round == ROUNDS) {
            m.state = State.Finalizing;
            for (uint8 i = 0; i < m.playerCount; i++) {
                FHE.makePubliclyDecryptable(scores[id][i]);
            }
        } else {
            m.state = State.Commit;
            m.deadline = uint64(block.timestamp) + m.roundDuration;
        }
    }

    function _applyPlayer(uint256 id, uint8 r, uint8 i, uint32 points) internal {
        if (!moves[id][r][i].submitted) return; // inactive: no income, no bonus, nothing to settle
        ebool won = wonFlag[id][i];
        ebool lostDouble = FHE.and(moves[id][r][i].isDouble, FHE.not(won));
        _applyCredits(id, r, i, won, lostDouble);
        _applyScore(id, r, i, points, won, lostDouble);
    }

    /// Credits: pay sunk tactics + winning bid + burned stake, earn income and the pass bonus.
    function _applyCredits(uint256 id, uint8 r, uint8 i, ebool won, ebool lostDouble) internal {
        Move storage mv = moves[id][r][i];
        euint32 zero = FHE.asEuint32(0);
        euint32 outflow = FHE.add(mv.sunk, FHE.select(won, mv.bid, zero));
        outflow = FHE.add(outflow, FHE.select(lostDouble, mv.stake, zero));
        euint32 income = FHE.select(mv.isPass, FHE.asEuint32(ROUND_INCOME + PASS_BONUS), FHE.asEuint32(ROUND_INCOME));
        euint32 c = FHE.add(FHE.sub(credits[id][i], outflow), income);
        credits[id][i] = FHE.allowThis(c);
        FHE.allow(c, players[id][i]);
    }

    /// Score: artifact points (x2 on a won DOUBLE), -1 (floored at 0) on a lost DOUBLE.
    function _applyScore(uint256 id, uint8 r, uint8 i, uint32 points, ebool won, ebool lostDouble) internal {
        euint32 zero = FHE.asEuint32(0);
        euint32 pts = FHE.select(moves[id][r][i].isDouble, FHE.asEuint32(points * 2), FHE.asEuint32(points));
        euint32 s = FHE.add(scores[id][i], FHE.select(won, pts, zero));
        s = FHE.select(FHE.and(lostDouble, FHE.gt(s, zero)), FHE.sub(s, FHE.asEuint32(1)), s);
        scores[id][i] = FHE.allowThis(s);
        FHE.allow(s, players[id][i]);
    }

    // ---------------------------------------------------------------------
    // Prizes
    // ---------------------------------------------------------------------
    /// @notice A winner pulls their confidential cUSDT share. If the token transfer reverts, the whole
    ///         call reverts and the claim stays available.
    function claimPrize(uint256 id) external exists(id) nonReentrant {
        Match storage m = matches[id];
        if (m.state != State.Complete || !m.prizeFunded) revert WrongState(m.state);
        uint8 slotPlus = slotPlusOne[id][msg.sender];
        if (slotPlus == 0 || winnersMask[id] & (uint8(1) << (slotPlus - 1)) == 0) revert NotWinner();
        if (prizeClaimed[id][slotPlus - 1]) revert AlreadyClaimed();
        prizeClaimed[id][slotPlus - 1] = true;
        euint64 share = prizeShare[id];
        FHE.allowTransient(share, address(prizeToken));
        prizeToken.confidentialTransfer(msg.sender, share);
        emit PrizeClaimed(id, msg.sender);
    }

    /// @notice When nobody was eligible to win, the escrow goes back to the creator (anyone may trigger it).
    function claimRefund(uint256 id) external exists(id) nonReentrant {
        Match storage m = matches[id];
        if (m.state != State.Complete || !m.prizeFunded || winnersMask[id] != 0) revert WrongState(m.state);
        if (refundClaimed[id]) revert AlreadyClaimed();
        refundClaimed[id] = true;
        euint64 pool = m.prizePool;
        FHE.allowTransient(pool, address(prizeToken));
        prizeToken.confidentialTransfer(m.creator, pool);
        emit PrizeRefunded(id, m.creator);
    }

    /// @notice ERC-7984 receiver hook. The match creator escrows a confidential prize with
    ///         `cUSDT.confidentialTransferAndCall(shadowProtocol, amount, proof, abi.encode(matchId))`.
    ///         Invalid deposits return an encrypted `false`, which makes the token refund the sender.
    function onConfidentialTransferReceived(address, address from, euint64 amount, bytes calldata data)
        external
        override
        returns (ebool)
    {
        if (address(prizeToken) == address(0) || msg.sender != address(prizeToken)) revert PrizeDisabled();
        ebool ok;
        uint256 id = data.length == 32 ? abi.decode(data, (uint256)) : 0;
        bool valid = id != 0 && id <= matchCount;
        if (valid) {
            Match storage m = matches[id];
            // Escrow is only accepted once the match has started (so a lobby cancel can never strand it)
            // and before final scores are known.
            valid = from == m.creator
                && (m.state == State.AwaitingSeed || m.state == State.Commit || m.state == State.Resolving);
            if (valid) {
                euint64 pool = m.prizeFunded ? FHE.add(m.prizePool, amount) : amount;
                m.prizePool = FHE.allowThis(pool);
                m.prizeFunded = true;
                emit PrizeFunded(id, from);
            }
        }
        ok = FHE.asEbool(valid);
        FHE.allowTransient(ok, msg.sender);
        return ok;
    }
}
