// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.24;

import {euint64, externalEuint64, ebool} from "encrypted-types/EncryptedTypes.sol";

/// @notice The slice of the ERC-7984 confidential token interface that Shadow Protocol uses.
/// @dev Signatures match the OpenZeppelin / Zama ERC-7984 implementation (cUSDT is a wrapper built on it).
interface IConfidentialToken {
    /// @dev Moves an already-encrypted amount the caller is allowed to use.
    function confidentialTransfer(address to, euint64 amount) external returns (euint64 transferred);

    /// @dev Moves a freshly encrypted amount and calls `onConfidentialTransferReceived` on `to`.
    function confidentialTransferAndCall(
        address to,
        externalEuint64 encryptedAmount,
        bytes calldata inputProof,
        bytes calldata data
    ) external returns (euint64 transferred);
}

/// @notice Receiver hook defined by ERC-7984 for `confidentialTransferAndCall`.
interface IConfidentialTransferReceiver {
    /// @return success Encrypted boolean. When false the token refunds the sender.
    function onConfidentialTransferReceived(
        address operator,
        address from,
        euint64 amount,
        bytes calldata data
    ) external returns (ebool success);
}
