// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.24;

import {FHE, ebool, euint64, externalEuint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {IConfidentialTransferReceiver} from "../interfaces/IConfidentialToken.sol";

/// @notice TEST-ONLY confidential token used by the FHE test-suite to exercise the prize flow locally.
///         It follows the ERC-7984 call shapes Shadow Protocol relies on. It is never deployed to Sepolia:
///         live rewards use the official cUSDT contract configured in the ShadowProtocol constructor.
contract MockConfidentialToken is ZamaEthereumConfig {
    mapping(address => euint64) internal _balances;

    function mint(address to, uint64 amount) external {
        euint64 current = _balances[to];
        euint64 next = FHE.isInitialized(current) ? FHE.add(current, amount) : FHE.asEuint64(amount);
        _balances[to] = FHE.allowThis(next);
        FHE.allow(next, to);
    }

    function confidentialBalanceOf(address account) external view returns (euint64) {
        return _balances[account];
    }

    function confidentialTransfer(address to, euint64 amount) external returns (euint64) {
        require(FHE.isAllowed(amount, msg.sender), "unauthorized amount");
        return _move(msg.sender, to, amount);
    }

    function confidentialTransferAndCall(
        address to,
        externalEuint64 encryptedAmount,
        bytes calldata inputProof,
        bytes calldata data
    ) external returns (euint64 transferred) {
        euint64 amount = FHE.fromExternal(encryptedAmount, inputProof);
        euint64 sent = _move(msg.sender, to, amount);
        FHE.allowTransient(sent, to);
        ebool ok = IConfidentialTransferReceiver(to).onConfidentialTransferReceived(msg.sender, msg.sender, sent, data);
        euint64 refund = FHE.select(ok, FHE.asEuint64(0), sent);
        FHE.allowThis(refund);
        _move(to, msg.sender, refund);
        transferred = FHE.sub(sent, refund);
        FHE.allowTransient(transferred, msg.sender);
    }

    function _move(address from, address to, euint64 amount) internal returns (euint64 sent) {
        euint64 fromBal = _balances[from];
        if (!FHE.isInitialized(fromBal)) fromBal = FHE.asEuint64(0);
        euint64 toBal = _balances[to];
        if (!FHE.isInitialized(toBal)) toBal = FHE.asEuint64(0);
        sent = FHE.select(FHE.ge(fromBal, amount), amount, FHE.asEuint64(0));
        euint64 newFrom = FHE.sub(fromBal, sent);
        euint64 newTo = FHE.add(toBal, sent);
        _balances[from] = FHE.allowThis(newFrom);
        FHE.allow(newFrom, from);
        _balances[to] = FHE.allowThis(newTo);
        FHE.allow(newTo, to);
        FHE.allowThis(sent);
    }
}
