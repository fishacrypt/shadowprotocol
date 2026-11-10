# Playing Shadow Protocol

This guide walks through creating a match, inviting opponents, choosing encrypted tactics, resolving rounds, and claiming an optional prize.

## Before you start

1. Open [Shadow Protocol](https://shadowpro.vercel.app/).
2. Switch your wallet to **Ethereum Sepolia** (chain ID `11155111`).
3. Connect your wallet using the **Connect Wallet** control.
4. Make sure your wallet has Sepolia ETH for transaction gas.

Shadow Protocol is a testnet game. Gameplay credits are simulated and have no cash value. The optional cUSDT prize uses testnet tokens only.

## 1. Create a match

1. Open the **Lobby** from the navigation or select **Play now** on the landing page.
2. In the **Create a match** panel, choose the table size:
   - 2 players
   - 3 players
   - 4 players
3. Choose a round timer: 2 minutes, 5 minutes, 15 minutes, or 1 hour.
4. Select **Create match** and approve the transaction in your wallet.
5. When the transaction completes, the match room opens.

A match has five rounds. The creator can start once at least two players have joined; a full lobby can begin automatically.

## 2. Invite other players

1. In the waiting room, copy the **Invite link**.
2. Send the link to your opponents.
3. Each opponent opens the link, connects a Sepolia wallet, and selects **Join match**.
4. Wait until at least two players are in the lobby.

The waiting room shows player addresses and open seats. The match creator can cancel the lobby before play begins.

## 3. Start and generate the artifact schedule

When the match starts, the game enters the seed-generation phase.

The artifact seed is generated inside the FHE coprocessor. It is not predictable by the match creator or players. The seed is then published with a KMS signature that the smart contract verifies. Once verified, the five-round artifact schedule becomes public.

This step establishes the sequence of artifacts for the match.

## 4. Understand your resources

Each player begins with **1,000 credits**.

- Taking part in a round gives you **100 credits of round income**.
- Choosing **Pass** adds a **150-credit rest bonus** on top of round income.
- Missing the round causes an automatic pass but does not grant the round income.
- Your balance is encrypted onchain. You can request an authorized private decryption of your own balance from the match screen.

Credits are only an in-game resource. They are not ETH, cUSDT, or a withdrawable token.

## 5. Choose a tactic each round

During the open round, select one of the five tactics in the action panel.

### Bid

Make a sealed offer for the current artifact. The highest effective bid wins and pays the bid. Players who do not win keep their credits.

### Shield

Choose a bid amount and a shield strength. The shield spends credits to absorb incoming sabotage. The spend is burned whether or not an opponent attacks you.

### Sabotage

Choose a bid amount, sabotage strength, and an opponent as your target. Sabotage reduces that opponent's bid. A shield can absorb the attack, and choosing the wrong target can waste the credits spent.

### Double

Choose a bid and a stake. The stake must be at least half the bid for the Double tactic to apply.

- If you win the artifact, you earn double its point value and get the stake back.
- If you lose, the stake is burned and you lose 1 point.

If the stake is too small, the move is treated as a regular bid instead.

### Pass

Spend nothing on the artifact contest. You receive the 150-credit rest bonus in addition to the normal round income.

### Budget and encrypted inputs

The action panel displays your best-known available balance when it has been decrypted. If the balance is still hidden, the contract still enforces the real limit: it clamps spending to the credits you actually have.

For tactics that use both a bid and power, the interface shows the total committed amount. Review the trade-off and target before submitting.

## 6. Seal your move

1. Select your tactic.
2. Set the bid, power or stake, and target if the tactic requires them.
3. Review the tactic description and total committed credits.
4. Select **Seal and submit move**.
5. Confirm the transaction in your wallet.

The move is encrypted in the browser before submission. After it is sealed, it cannot be changed. Your opponents can see that you submitted, but they cannot see your tactic, bid, power, or target.

You only submit one move per round.

## 7. Wait for the round to resolve

The board shows the round timer and which players have submitted. It does not reveal their move contents.

A round can be resolved when everyone has submitted or the timer has expired. Anyone can select **Resolve round** once the game is ready.

The contract evaluates the encrypted bids and applies the rules without publicly decrypting the players' balances or running scores. The round winner is shown by player slot; the bids remain hidden.

If the timer expires before you submit, the contract treats your round as an automatic pass. You do not receive that round's income. Three missed rounds make you ineligible to win the prize.

## 8. Play all five rounds

Repeat the move-selection and resolution process for each artifact.

The artifact schedule is public after seed verification, so you can plan how aggressively to spend your credits. The order used to break tied effective bids rotates each round.

Your running score remains encrypted during the match. You may privately decrypt your own credit balance when the interface offers that action.

## 9. Finalize the match

After the fifth round, the match enters finalization.

1. Select **Reveal and verify final scores** when the control is available.
2. The application requests the authorized decryption of the score values.
3. The KMS-signed proof is submitted to the contract.
4. The contract verifies the proof before publishing the final scores and ranking.

The match is complete once the final scores have been verified.

## 10. Optional: fund and claim a confidential prize

A match does not need a prize to be played. If the creator wants to add one, the prize panel supports a separate confidential cUSDT escrow.

### Creator: add a prize

1. Open the prize panel after the match has started.
2. Enter the desired cUSDT amount.
3. If you need test tokens, select **Get test cUSDT**. This mints public test USDT, approves the wrapper, and wraps the tokens into confidential cUSDT.
4. Select **Escrow prize** and approve the wallet transaction.

The amount is encrypted during transfer. The prize is separate from the gameplay credits.

### Winners: claim

After finalization, eligible winners can use the claim control in the results view. If the final result has no eligible winner, the creator can use the refund flow to reclaim the escrow.

Only use testnet tokens on this deployment.

## What other players can see

**Hidden by FHE during play**
- Your chosen tactic
- Your bid, power, and target
- Your credit balance
- Your running score and intermediate calculations

**Visible onchain**
- Player addresses and match participation
- Whether each player has submitted a move
- Match phase, round deadlines, and artifact schedule after seed reveal
- Round winner slot
- Final scores and ranking after finalization
- Missed-round counters

Transactions still reveal which wallet acted and when. FHE protects move contents; it does not hide transaction metadata or prevent coordination between multiple wallets controlled by the same person.

## Quick strategy reminders

- A large bid can win an artifact, but it can also leave you short of credits in later rounds.
- Shield is defensive, but the credits spent are burned even when no sabotage arrives.
- Sabotage is targeted; a wrong guess or a shield can make the spend ineffective.
- Double offers higher point potential but puts the stake at risk.
- Pass can be useful when you want to preserve credits and take the rest bonus.
- Keep track of the timer. A missed round costs you its income, and three misses disqualify you from winning the prize.

## Troubleshooting

**The wallet will not connect**
- Confirm that your wallet is set to Ethereum Sepolia.
- Refresh the page and reconnect.
- Check that your wallet extension is unlocked.

**A transaction is pending or fails**
- Wait for the wallet to finish processing.
- Check that you have Sepolia ETH for gas.
- Open the transaction link in the transaction notice to inspect its status.

**The match is not progressing**
- Check whether every player has submitted or the round timer has expired.
- If the round is ready, any participant or observer can trigger **Resolve round**.
- Encrypted operations depend on the Zama relayer and KMS. If those services are slow, wait and retry when the interface allows it.

**I cannot see my balance**
- The balance is encrypted by design.
- Use the private decrypt action when available and approve the wallet signature.

---

**Remember:** Shadow Protocol is a Sepolia testnet experience. Gameplay credits have no monetary value, cUSDT here is a testnet prize asset, and the contracts have not been independently audited.
