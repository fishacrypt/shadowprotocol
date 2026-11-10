import { FhevmType } from "@fhevm/hardhat-plugin";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers, fhevm } from "hardhat";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

// Action codes (see ShadowProtocol.sol)
const BID = 0, SHIELD = 1, SABOTAGE = 2, DOUBLE = 3, PASS = 4;
const NO_WINNER = 255;
const DURATION = 300;

describe("ShadowProtocol (FHE)", function () {
  let shadow: any, token: any;
  let shadowAddr: string, tokenAddr: string;
  let p: HardhatEthersSigner[];

  beforeEach(async function () {
    if (!fhevm.isMock) this.skip();
    p = await ethers.getSigners();
    token = await (await ethers.getContractFactory("MockConfidentialToken")).deploy();
    tokenAddr = await token.getAddress();
    // ShadowProtocol owns the state; ShadowRounds (the encrypted round engine) is reached via delegatecall,
    // so the merged ABI of both is what a client talks to at the ShadowProtocol address.
    const roundsF = await ethers.getContractFactory("ShadowRounds");
    const rounds = await roundsF.deploy();
    const coreF = await ethers.getContractFactory("ShadowProtocol");
    const core = await coreF.deploy(tokenAddr, await rounds.getAddress());
    shadowAddr = await core.getAddress();
    const seen = new Set<string>();
    const fragments = [...coreF.interface.fragments, ...roundsF.interface.fragments].filter((f) => {
      const key = `${f.type}:${f.format("full")}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    shadow = new ethers.Contract(shadowAddr, fragments, p[0]);
  });

  // ---- helpers ---------------------------------------------------------
  async function lobby(n: number, duration = DURATION) {
    await shadow.connect(p[0]).createMatch(n, duration);
    const id = await shadow.matchCount();
    for (let i = 1; i < n; i++) await shadow.connect(p[i]).joinMatch(id);
    return id;
  }

  async function reveal(id: bigint) {
    const handle = await shadow.seedHandle(id);
    const res = await fhevm.publicDecrypt([handle]);
    const seed = BigInt(res.clearValues[handle as `0x${string}`] as bigint);
    await shadow.revealSeed(id, seed, res.decryptionProof);
  }

  async function startedMatch(n: number, duration = DURATION) {
    const id = await lobby(n, duration);
    if ((await shadow.getMatch(id)).state === 0n) await shadow.connect(p[0]).startMatch(id);
    await reveal(id);
    return id;
  }

  async function encryptMove(user: HardhatEthersSigner, action: number, bid: number, power: number, target: number) {
    const input = fhevm.createEncryptedInput(shadowAddr, user.address);
    input.add32(action).add32(bid).add32(power).add32(target);
    return input.encrypt();
  }

  async function submit(user: HardhatEthersSigner, id: bigint, action: number, bid: number, power = 0, target = 0) {
    const e = await encryptMove(user, action, bid, power, target);
    return shadow.connect(user).submitMove(id, e.handles[0], e.handles[1], e.handles[2], e.handles[3], e.inputProof);
  }

  async function resolve(id: bigint) {
    await shadow.closeRound(id);
    await shadow.applyRound(id);
  }

  async function creditsOf(id: bigint, user: HardhatEthersSigner) {
    const [c] = await shadow.getPlayerHandles(id, user.address);
    return Number(await fhevm.userDecryptEuint(FhevmType.euint32, c, shadowAddr, user));
  }

  async function scoreOf(id: bigint, user: HardhatEthersSigner) {
    const [, s] = await shadow.getPlayerHandles(id, user.address);
    return Number(await fhevm.userDecryptEuint(FhevmType.euint32, s, shadowAddr, user));
  }

  // Round winners are made publicly decryptable by the contract; anyone can read the KMS-verified result.
  async function publishedWinner(id: bigint, round: number) {
    const handle = await shadow.roundResultHandle(id, round);
    const res = await fhevm.publicDecrypt([handle]);
    return Number(res.clearValues[handle as `0x${string}`]);
  }

  async function finalize(id: bigint) {
    const handles: string[] = await shadow.scoreHandles(id);
    const res = await fhevm.publicDecrypt(handles);
    const values = handles.map((h) => Number(res.clearValues[h as `0x${string}`]));
    await shadow.finalizeMatch(id, values, res.decryptionProof);
    return values;
  }

  // ---- lobby ------------------------------------------------------------
  describe("match creation and joining", function () {
    it("creates a match and registers the creator in slot 0", async function () {
      await expect(shadow.connect(p[0]).createMatch(3, DURATION)).to.emit(shadow, "MatchCreated");
      const m = await shadow.getMatch(1);
      expect(m.creator).to.eq(p[0].address);
      expect(m.playerCount).to.eq(1);
      expect(m.maxPlayers).to.eq(3);
      expect(m.state).to.eq(0);
      expect((await shadow.getPlayers(1))[0]).to.eq(p[0].address);
    });

    it("rejects out-of-range player counts and durations", async function () {
      await expect(shadow.createMatch(1, DURATION)).to.be.revertedWithCustomError(shadow, "InvalidConfig");
      await expect(shadow.createMatch(5, DURATION)).to.be.revertedWithCustomError(shadow, "InvalidConfig");
      await expect(shadow.createMatch(2, 10)).to.be.revertedWithCustomError(shadow, "InvalidConfig");
    });

    it("lets players join, blocks duplicates and full matches, and auto-starts when full", async function () {
      await shadow.connect(p[0]).createMatch(2, DURATION);
      await expect(shadow.connect(p[0]).joinMatch(1)).to.be.revertedWithCustomError(shadow, "AlreadyJoined");
      await shadow.connect(p[1]).joinMatch(1);
      expect((await shadow.getMatch(1)).state).to.eq(1); // AwaitingSeed
      await expect(shadow.connect(p[2]).joinMatch(1)).to.be.revertedWithCustomError(shadow, "WrongState");
    });

    it("enforces the 2-player minimum and creator-only start", async function () {
      await shadow.connect(p[0]).createMatch(3, DURATION);
      await expect(shadow.connect(p[0]).startMatch(1)).to.be.revertedWithCustomError(shadow, "NotEnoughPlayers");
      await shadow.connect(p[1]).joinMatch(1);
      await expect(shadow.connect(p[1]).startMatch(1)).to.be.revertedWithCustomError(shadow, "NotCreator");
      await shadow.connect(p[0]).startMatch(1);
    });

    it("supports 4 players and rejects a fifth", async function () {
      await lobby(4);
      await expect(shadow.connect(p[4]).joinMatch(1)).to.be.revertedWithCustomError(shadow, "WrongState");
      expect((await shadow.getPlayers(1)).length).to.eq(4);
    });

    it("cancels a lobby (creator immediately, others only after the timeout)", async function () {
      await shadow.connect(p[0]).createMatch(2, DURATION);
      await expect(shadow.connect(p[1]).cancelMatch(1)).to.be.revertedWithCustomError(shadow, "CannotCancel");
      await shadow.connect(p[0]).cancelMatch(1);
      expect((await shadow.getMatch(1)).state).to.eq(6);
    });
  });

  // ---- seed / fairness ----------------------------------------------------
  describe("verifiable artifact seed", function () {
    it("only accepts a KMS-signed seed and then opens round one", async function () {
      const id = await lobby(2);
      await expect(shadow.revealSeed(id, 12345n, "0x")).to.be.reverted;
      // a proof for a different handle set must not verify a forged seed
      const handle = await shadow.seedHandle(id);
      const res = await fhevm.publicDecrypt([handle]);
      const real = BigInt(res.clearValues[handle as `0x${string}`] as bigint);
      await expect(shadow.revealSeed(id, real + 1n, res.decryptionProof)).to.be.reverted;
      await shadow.revealSeed(id, real, res.decryptionProof);
      expect((await shadow.getMatch(id)).state).to.eq(2);
      await expect(shadow.revealSeed(id, real, res.decryptionProof)).to.be.revertedWithCustomError(shadow, "WrongState");
    });

    it("derives a deterministic public artifact schedule from the seed", async function () {
      const id = await startedMatch(2);
      for (let r = 0; r < 5; r++) {
        const pts = await shadow.artifactPoints(id, r);
        expect([2n, 3n, 4n, 5n, 6n]).to.include(pts);
        expect(await shadow.artifactKind(id, r)).to.be.lessThan(6n);
      }
    });

    it("blocks moves until the seed is revealed", async function () {
      const id = await lobby(2);
      await expect(submit(p[0], id, BID, 10)).to.be.revertedWithCustomError(shadow, "WrongState");
    });
  });

  // ---- encrypted submissions ------------------------------------------------
  describe("encrypted move submission", function () {
    it("accepts one sealed move per player per round and exposes only who submitted", async function () {
      const id = await startedMatch(2);
      await expect(submit(p[0], id, BID, 100)).to.emit(shadow, "MoveSubmitted").withArgs(id, 0, p[0].address);
      await expect(submit(p[0], id, BID, 100)).to.be.revertedWithCustomError(shadow, "AlreadySubmitted");
      expect((await shadow.getMatch(id)).submittedMask).to.eq(1);
    });

    it("rejects non-players", async function () {
      const id = await startedMatch(2);
      await expect(submit(p[3], id, BID, 100)).to.be.revertedWithCustomError(shadow, "NotPlayer");
    });

    it("rejects inputs bound to another user or another contract, and malformed proofs", async function () {
      const id = await startedMatch(2);
      const forUser1 = await encryptMove(p[1], BID, 100, 0, 0);
      await expect(
        shadow.connect(p[0]).submitMove(id, forUser1.handles[0], forUser1.handles[1], forUser1.handles[2], forUser1.handles[3], forUser1.inputProof),
      ).to.be.reverted;
      const e = await encryptMove(p[0], BID, 100, 0, 0);
      await expect(shadow.connect(p[0]).submitMove(id, e.handles[0], e.handles[1], e.handles[2], e.handles[3], "0x")).to.be.reverted;
      const otherContract = fhevm.createEncryptedInput(tokenAddr, p[0].address);
      otherContract.add8(BID).add32(100).add32(0).add8(0);
      const o = await otherContract.encrypt();
      await expect(shadow.connect(p[0]).submitMove(id, o.handles[0], o.handles[1], o.handles[2], o.handles[3], o.inputProof)).to.be.reverted;
    });

    it("keeps opponents unable to decrypt each other's credits (ACL)", async function () {
      const id = await startedMatch(2);
      // Starting balances are the same public constant, so play a round to get private balances.
      await submit(p[0], id, BID, 300);
      await submit(p[1], id, BID, 200);
      await resolve(id);
      const [c0] = await shadow.getPlayerHandles(id, p[0].address);
      expect(await creditsOf(id, p[0])).to.eq(800);
      await expect(fhevm.userDecryptEuint(FhevmType.euint32, c0, shadowAddr, p[1])).to.be.rejected;
      await expect(fhevm.userDecryptEuint(FhevmType.euint32, c0, shadowAddr, p[2])).to.be.rejected;
    });

    it("refuses submissions after the deadline", async function () {
      const id = await startedMatch(2);
      await time.increase(DURATION + 1);
      await expect(submit(p[0], id, BID, 10)).to.be.revertedWithCustomError(shadow, "DeadlinePassed");
    });
  });

  // ---- encrypted comparison + tactics -------------------------------------------
  describe("round resolution under encryption", function () {
    it("highest sealed bid wins, pays its bid, losers keep their credits", async function () {
      const id = await startedMatch(2);
      await submit(p[0], id, BID, 300);
      await submit(p[1], id, BID, 200);
      await resolve(id);
      expect(await creditsOf(id, p[0])).to.eq(1000 - 300 + 100);
      expect(await creditsOf(id, p[1])).to.eq(1000 + 100);
      expect(await scoreOf(id, p[0])).to.eq(Number(await shadow.artifactPoints(id, 0)));
      expect(await scoreOf(id, p[1])).to.eq(0);
      expect(await publishedWinner(id, 0)).to.eq(0);
    });

    it("cannot resolve while the round is open, then resolves once all have submitted", async function () {
      const id = await startedMatch(2);
      await submit(p[0], id, BID, 10);
      await expect(shadow.closeRound(id)).to.be.revertedWithCustomError(shadow, "RoundStillOpen");
      await submit(p[1], id, BID, 20);
      await shadow.closeRound(id);
      await expect(shadow.closeRound(id)).to.be.revertedWithCustomError(shadow, "WrongState");
      await shadow.applyRound(id);
      await expect(shadow.applyRound(id)).to.be.revertedWithCustomError(shadow, "WrongState");
      expect((await shadow.getMatch(id)).round).to.eq(1);
    });

    it("SABOTAGE cuts the target's effective bid and flips the winner (sunk cost paid)", async function () {
      const id = await startedMatch(2);
      await submit(p[0], id, BID, 300);
      await submit(p[1], id, SABOTAGE, 200, 150, 0); // 300 - 150 = 150 < 200
      await resolve(id);
      expect(await publishedWinner(id, 0)).to.eq(1);
      expect(await creditsOf(id, p[1])).to.eq(1000 - 150 - 200 + 100);
      expect(await creditsOf(id, p[0])).to.eq(1100);
    });

    it("SHIELD absorbs sabotage so the shielded bid still wins", async function () {
      const id = await startedMatch(2);
      await submit(p[0], id, SHIELD, 300, 200);
      await submit(p[1], id, SABOTAGE, 200, 150, 0);
      await resolve(id);
      expect(await publishedWinner(id, 0)).to.eq(0);
      expect(await creditsOf(id, p[0])).to.eq(1000 - 200 - 300 + 100);
      expect(await creditsOf(id, p[1])).to.eq(1000 - 150 + 100);
    });

    it("a mis-aimed SABOTAGE (self / out of range) lands on nobody but still burns its power", async function () {
      const id = await startedMatch(2);
      await submit(p[0], id, SABOTAGE, 300, 100, 0); // self-target
      await submit(p[1], id, SABOTAGE, 200, 100, 3); // slot 3 does not exist
      await resolve(id);
      expect(await publishedWinner(id, 0)).to.eq(0);
      expect(await creditsOf(id, p[0])).to.eq(1000 - 100 - 300 + 100);
      expect(await creditsOf(id, p[1])).to.eq(1000 - 100 + 100);
    });

    it("DOUBLE doubles artifact points on a win and returns the stake", async function () {
      const id = await startedMatch(2);
      await submit(p[0], id, DOUBLE, 300, 150);
      await submit(p[1], id, BID, 100);
      await resolve(id);
      expect(await scoreOf(id, p[0])).to.eq(2 * Number(await shadow.artifactPoints(id, 0)));
      expect(await creditsOf(id, p[0])).to.eq(1000 - 300 + 100);
    });

    it("a lost DOUBLE burns the stake and costs a point; too-small stakes degrade to a plain BID", async function () {
      const id = await startedMatch(2);
      await submit(p[0], id, BID, 200);
      await submit(p[1], id, BID, 100);
      await resolve(id); // p0 scores
      const base = Number(await shadow.artifactPoints(id, 0));
      await submit(p[0], id, DOUBLE, 100, 50);
      await submit(p[1], id, BID, 300);
      await resolve(id);
      expect(await scoreOf(id, p[0])).to.eq(base - 1);
      expect(await creditsOf(id, p[0])).to.eq(800 + 100 - 50 + 100);
      // stake 10 < bid/2 => DOUBLE ignored: wins as plain BID, no x2
      await submit(p[0], id, DOUBLE, 250, 10);
      await submit(p[1], id, BID, 100);
      await resolve(id);
      expect(await scoreOf(id, p[0])).to.eq(base - 1 + Number(await shadow.artifactPoints(id, 2)));
    });

    it("PASS preserves credits, earns the rest bonus and yields no winner when everyone passes", async function () {
      const id = await startedMatch(2);
      await submit(p[0], id, PASS, 999);
      await submit(p[1], id, PASS, 999);
      await resolve(id);
      expect(await publishedWinner(id, 0)).to.eq(NO_WINNER);
      expect(await creditsOf(id, p[0])).to.eq(1000 + 100 + 150);
      expect(await creditsOf(id, p[1])).to.eq(1000 + 100 + 150);
    });

    it("clamps over-sized bids to the credits a player holds", async function () {
      const id = await startedMatch(2);
      await submit(p[0], id, BID, 4_000_000_000);
      await submit(p[1], id, BID, 500);
      await resolve(id);
      expect(await creditsOf(id, p[0])).to.eq(0 + 100);
      expect(await publishedWinner(id, 0)).to.eq(0);
    });

    it("breaks ties with a start order that rotates each round", async function () {
      const id = await startedMatch(2);
      await submit(p[0], id, BID, 100);
      await submit(p[1], id, BID, 100);
      await resolve(id);
      expect(await publishedWinner(id, 0)).to.eq(0);
      await submit(p[0], id, BID, 100);
      await submit(p[1], id, BID, 100);
      await resolve(id);
      expect(await publishedWinner(id, 1)).to.eq(1);
    });

    it("resolves a 4-player round with sabotage across several targets", async function () {
      const id = await startedMatch(4);
      await submit(p[0], id, BID, 100);
      await submit(p[1], id, BID, 200);
      await submit(p[2], id, BID, 300);
      await submit(p[3], id, SABOTAGE, 250, 100, 2); // p2: 300-100=200, p3 keeps 250
      await resolve(id);
      expect(await publishedWinner(id, 0)).to.eq(3);
      expect(await creditsOf(id, p[3])).to.eq(1000 - 100 - 250 + 100);
      expect(await creditsOf(id, p[2])).to.eq(1100);
    });
  });

  // ---- timeouts / inactivity ---------------------------------------------------
  describe("timeouts and disconnected players", function () {
    it("lets anyone close a stalled round after the deadline; absent players miss out", async function () {
      const id = await startedMatch(2);
      await submit(p[0], id, BID, 100);
      await time.increase(DURATION + 1);
      await expect(shadow.closeRound(id)).to.emit(shadow, "RoundClosed");
      await shadow.applyRound(id);
      expect(await shadow.missedRounds(id, 1)).to.eq(1);
      expect(await shadow.missedRounds(id, 0)).to.eq(0);
      expect(await creditsOf(id, p[1])).to.eq(1000); // no income for the absent player
      expect(await creditsOf(id, p[0])).to.eq(1000 - 100 + 100);
      expect(await publishedWinner(id, 0)).to.eq(0);
    });

    it("a round with no submissions ends with no winner", async function () {
      const id = await startedMatch(2);
      await time.increase(DURATION + 1);
      await resolve(id);
      expect(await publishedWinner(id, 0)).to.eq(NO_WINNER);
    });
  });

  // ---- full match, rewards ----------------------------------------------------------
  describe("match completion and confidential rewards", function () {
    async function fundPrize(id: bigint, amount: number) {
      await token.mint(p[0].address, 1_000_000);
      const input = fhevm.createEncryptedInput(tokenAddr, p[0].address);
      input.add64(amount);
      const enc = await input.encrypt();
      await token
        .connect(p[0])
        .confidentialTransferAndCall(shadowAddr, enc.handles[0], enc.inputProof, ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [id]));
    }

    async function balanceOf(user: HardhatEthersSigner) {
      const h = await token.confidentialBalanceOf(user.address);
      if (h === ethers.ZeroHash) return 0n;
      return fhevm.userDecryptEuint(FhevmType.euint64, h, tokenAddr, user);
    }

    it("plays 5 rounds, verifies final scores from the KMS and pays the cUSDT-style prize to the winner", async function () {
      const id = await startedMatch(2);
      await fundPrize(id, 600_000);
      expect(await balanceOf(p[0])).to.eq(400_000n);
      for (let r = 0; r < 5; r++) {
        await submit(p[0], id, PASS, 0);
        await submit(p[1], id, BID, 50);
        await resolve(id);
      }
      expect((await shadow.getMatch(id)).state).to.eq(4); // Finalizing
      const values = await finalize(id);
      expect(values[0]).to.eq(0);
      expect(values[1]).to.be.greaterThan(0);
      expect(await shadow.winnersMask(id)).to.eq(2);
      await expect(shadow.connect(p[0]).claimPrize(id)).to.be.revertedWithCustomError(shadow, "NotWinner");
      await shadow.connect(p[1]).claimPrize(id);
      await expect(shadow.connect(p[1]).claimPrize(id)).to.be.revertedWithCustomError(shadow, "AlreadyClaimed");
      expect(await balanceOf(p[1])).to.eq(600_000n);
      const s = await shadow.stats(p[1].address);
      expect(s.wins).to.eq(1);
      expect(s.matches).to.eq(1);
      expect(await shadow.completedMatches()).to.eq(1);
      await expect(shadow.finalizeMatch(id, values, "0x")).to.be.revertedWithCustomError(shadow, "WrongState");
    });

    it("returns the escrow to the creator when nobody is eligible", async function () {
      const id = await startedMatch(2);
      await fundPrize(id, 600_000);
      for (let r = 0; r < 5; r++) {
        await submit(p[0], id, PASS, 0);
        await submit(p[1], id, PASS, 0);
        await resolve(id);
      }
      const values = await finalize(id);
      expect(values).to.deep.eq([0, 0]);
      expect(await shadow.winnersMask(id)).to.eq(0);
      expect(await balanceOf(p[0])).to.eq(400_000n);
      await shadow.claimRefund(id); // no eligible winner: escrow returns to the creator
      await expect(shadow.claimRefund(id)).to.be.revertedWithCustomError(shadow, "AlreadyClaimed");
      expect(await balanceOf(p[0])).to.eq(1_000_000n);
    });

    it("disqualifies a player with 3+ missed rounds even if they lead on score", async function () {
      const id = await startedMatch(2);
      await fundPrize(id, 500_000);
      for (let r = 0; r < 5; r++) {
        await submit(p[0], id, PASS, 0);
        if (r < 2) {
          await submit(p[1], id, BID, 100);
          await resolve(id);
        } else {
          await time.increase(DURATION + 1);
          await resolve(id);
        }
      }
      const values = await finalize(id);
      expect(values[1]).to.be.greaterThan(values[0]);
      expect(await shadow.missedRounds(id, 1)).to.eq(3);
      expect(await shadow.winnersMask(id)).to.eq(0);
      await expect(shadow.connect(p[1]).claimPrize(id)).to.be.revertedWithCustomError(shadow, "NotWinner");
      await shadow.claimRefund(id);
      expect(await balanceOf(p[1])).to.eq(0n);
      expect(await balanceOf(p[0])).to.eq(1_000_000n);
    });

    it("rejects forged final scores, wrong lengths and malformed proofs", async function () {
      const id = await startedMatch(2);
      for (let r = 0; r < 5; r++) {
        await submit(p[0], id, BID, 10);
        await submit(p[1], id, PASS, 0);
        await resolve(id);
      }
      const handles: string[] = await shadow.scoreHandles(id);
      const res = await fhevm.publicDecrypt(handles);
      const values = handles.map((h) => Number(res.clearValues[h as `0x${string}`]));
      await expect(shadow.finalizeMatch(id, [values[0] + 10, values[1]], res.decryptionProof)).to.be.reverted;
      await expect(shadow.finalizeMatch(id, [values[0]], res.decryptionProof)).to.be.revertedWithCustomError(shadow, "BadLength");
      await expect(shadow.finalizeMatch(id, values, "0x")).to.be.reverted;
      await shadow.finalizeMatch(id, values, res.decryptionProof);
    });

    it("refunds deposits that do not target a valid match the sender created", async function () {
      const id = await startedMatch(2);
      await token.mint(p[1].address, 1000);
      const input = fhevm.createEncryptedInput(tokenAddr, p[1].address);
      input.add64(500);
      const enc = await input.encrypt();
      await token
        .connect(p[1])
        .confidentialTransferAndCall(shadowAddr, enc.handles[0], enc.inputProof, ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [id]));
      expect(await balanceOf(p[1])).to.eq(1000n); // non-creator deposit refunded
      expect((await shadow.getMatch(id)).prizeFunded).to.eq(false);
    });

    it("only the configured token may call the receiver hook", async function () {
      await expect(
        shadow.onConfidentialTransferReceived(p[0].address, p[0].address, ethers.ZeroHash, "0x"),
      ).to.be.revertedWithCustomError(shadow, "PrizeDisabled");
    });
  });
});
