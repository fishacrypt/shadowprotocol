// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.24;

import {ebool, euint32, euint64} from "@fhevm/solidity/lib/FHE.sol";
import {IConfidentialToken} from "./interfaces/IConfidentialToken.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @dev Shared storage layout, events and errors. ShadowProtocol (state owner) and ShadowRounds (encrypted
///      round engine, executed through delegatecall) both inherit this, so their storage layouts are identical.
abstract contract ShadowStorage is ReentrancyGuard {
    // ---------------------------------------------------------------------
    // Types
    // ---------------------------------------------------------------------
    enum State {
        Lobby,
        AwaitingSeed,
        Commit,
        Resolving,
        Finalizing,
        Complete,
        Cancelled
    }

    struct Match {
        address creator;
        uint8 maxPlayers;
        uint8 playerCount;
        State state;
        uint8 round;
        uint32 roundDuration;
        uint64 deadline;
        uint64 createdAt;
        uint64 seed;
        bool seedRevealed;
        bool prizeFunded;
        euint64 seedCt;
        euint64 prizePool;
    }

    struct Move {
        bool submitted;
        euint32 bid;
        euint32 sunk; // shield + sabotage power, burned regardless of outcome
        euint32 stake; // DOUBLE stake, burned only on a lost DOUBLE
        euint32 shield;
        ebool isDouble;
        ebool isPass;
        euint32[4] sabOut; // sabotage power aimed at each player slot
    }

    struct Stats {
        uint32 matches;
        uint32 wins;
        uint32 bestScore;
        uint32 totalScore;
    }

    // ---------------------------------------------------------------------
    // Constants
    // ---------------------------------------------------------------------
    uint8 internal constant MIN_PLAYERS = 2;
    uint8 internal constant MAX_PLAYERS = 4;
    uint8 internal constant ROUNDS = 5;
    uint32 internal constant START_CREDITS = 1000;
    uint32 internal constant ROUND_INCOME = 100;
    uint32 internal constant PASS_BONUS = 150;
    uint8 internal constant MAX_MISSES = 3;
    uint32 internal constant MIN_ROUND_DURATION = 60;
    uint32 internal constant MAX_ROUND_DURATION = 1 days;
    uint64 internal constant LOBBY_TIMEOUT = 1 days;
    uint32 internal constant NO_WINNER = 255;

    uint32 internal constant ACT_SHIELD = 1;
    uint32 internal constant ACT_SABOTAGE = 2;
    uint32 internal constant ACT_DOUBLE = 3;
    uint32 internal constant ACT_PASS = 4;

    // ---------------------------------------------------------------------
    // Storage
    // ---------------------------------------------------------------------
    /// @notice Confidential reward token (cUSDT, an ERC-7984). address(0) disables prize pools.
    IConfidentialToken public prizeToken;

    uint256 public matchCount;
    uint256 public completedMatches;

    mapping(uint256 => Match) internal matches;
    mapping(uint256 => address[]) internal players;
    mapping(uint256 => mapping(address => uint8)) internal slotPlusOne;
    mapping(uint256 => mapping(uint8 => euint32)) internal credits;
    mapping(uint256 => mapping(uint8 => euint32)) internal scores;
    mapping(uint256 => mapping(uint8 => mapping(uint8 => Move))) internal moves; // id => round => slot
    mapping(uint256 => mapping(uint8 => ebool)) internal wonFlag; // id => slot (round being resolved)
    mapping(uint256 => mapping(uint8 => euint32)) internal roundResultCt;
    mapping(uint256 => mapping(uint8 => uint8)) public missedRounds;
    mapping(uint256 => uint8) public winnersMask;
    mapping(address => Stats) public stats;
    mapping(uint256 => euint64) internal prizeShare;
    mapping(uint256 => mapping(uint8 => bool)) public prizeClaimed;
    mapping(uint256 => bool) public refundClaimed;

    // ---------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------
    event MatchCreated(uint256 indexed id, address indexed creator, uint8 maxPlayers, uint32 roundDuration);
    event PlayerJoined(uint256 indexed id, address indexed player, uint8 slot);
    event MatchStarted(uint256 indexed id, bytes32 seedHandle);
    event SeedRevealed(uint256 indexed id, uint64 seed);
    event MoveSubmitted(uint256 indexed id, uint8 indexed round, address indexed player);
    event RoundClosed(uint256 indexed id, uint8 indexed round, bytes32 resultHandle, uint8 missedMask);
    event RoundApplied(uint256 indexed id, uint8 indexed round);
    event MatchFinalized(uint256 indexed id, uint32[] finalScores, uint8 winnersMask);
    event MatchCancelled(uint256 indexed id);
    event PrizeFunded(uint256 indexed id, address indexed from);
    event PrizeAllocated(uint256 indexed id, uint8 winners);
    event PrizeClaimed(uint256 indexed id, address indexed winner);
    event PrizeRefunded(uint256 indexed id, address indexed creator);

    // ---------------------------------------------------------------------
    // Errors
    // ---------------------------------------------------------------------
    error InvalidConfig();
    error WrongState(State current);
    error NotCreator();
    error AlreadyJoined();
    error MatchFull();
    error NotPlayer();
    error AlreadySubmitted();
    error DeadlinePassed();
    error RoundStillOpen();
    error NotEnoughPlayers();
    error BadLength();
    error PrizeDisabled();
    error UnknownMatch();
    error CannotCancel();
    error NotWinner();
    error AlreadyClaimed();

    modifier exists(uint256 id) {
        if (id == 0 || id > matchCount) revert UnknownMatch();
        _;
    }

    /// @notice Public, deterministic artifact schedule derived from the verified seed.
    function artifactKind(uint256 id, uint8 round) public view returns (uint8) {
        return uint8(uint256(keccak256(abi.encode(matches[id].seed, id, round))) % 6);
    }

    function artifactPoints(uint256 id, uint8 round) public view returns (uint32) {
        uint8 k = artifactKind(id, round);
        if (k == 0) return 2; // Ember Shard
        if (k == 1) return 3; // Veil Mirror
        if (k == 2) return 4; // Null Crown
        if (k == 3) return 5; // Echo Core
        if (k == 4) return 3; // Phantom Sigil
        return 6; // Singularity
    }

}
