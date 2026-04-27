// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title LedraBatchAnchor
 * @notice Stores Merkle roots representing batches of certificate digests.
 * @dev Deployed on Polygon PoS for the steady-state anchoring path.
 *      One transaction per batch (typically daily) anchors thousands of
 *      certificates at near-constant gas cost.
 *
 * Verification:
 *   1. Off-chain: client computes a certificate digest and walks the Merkle
 *      proof up to the root.
 *   2. On-chain: client checks `roots[merkleRoot] != 0` to confirm the
 *      root was anchored.
 *   3. Together this proves the certificate's existence at `roots[merkleRoot]`.
 *
 * The Merkle tree must use OpenZeppelin's `StandardMerkleTree` encoding
 * (leaf = keccak256(keccak256(abi.encode(value))), sorted pairs) for
 * compatibility with off-the-shelf verifiers.
 */
contract LedraBatchAnchor {
    /// @notice Emitted when a batch is anchored.
    /// @param merkleRoot  The Merkle root of the batch.
    /// @param leafCount   Number of certificates in this batch (for analytics).
    /// @param timestamp   Block timestamp.
    event BatchAnchored(
        bytes32 indexed merkleRoot,
        uint256 leafCount,
        uint256 timestamp
    );

    /// @notice Anchored Merkle roots → block timestamp.
    mapping(bytes32 => uint256) public roots;

    /// @notice Anchored Merkle roots → leaf count (for transparency).
    mapping(bytes32 => uint256) public leafCounts;

    /// @notice Owner address (for potential future access control).
    address public owner;

    modifier onlyOwner() {
        require(msg.sender == owner, "LedraBatchAnchor: not owner");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    /**
     * @notice Anchor a Merkle root for a batch of certificates.
     * @param merkleRoot  Root of the Merkle tree built from the batch's cert digests.
     * @param leafCount   Number of leaves in the tree (for record).
     * @dev Idempotent — re-anchoring an existing root is a no-op.
     */
    function anchorBatch(bytes32 merkleRoot, uint256 leafCount) external {
        if (roots[merkleRoot] != 0) return; // Already anchored, skip
        roots[merkleRoot] = block.timestamp;
        leafCounts[merkleRoot] = leafCount;
        emit BatchAnchored(merkleRoot, leafCount, block.timestamp);
    }

    /**
     * @notice Check if a Merkle root has been anchored.
     */
    function isAnchored(bytes32 merkleRoot) external view returns (bool) {
        return roots[merkleRoot] != 0;
    }

    /**
     * @notice Get the timestamp when a root was anchored, or 0 if not anchored.
     */
    function getAnchorTimestamp(bytes32 merkleRoot) external view returns (uint256) {
        return roots[merkleRoot];
    }

    /**
     * @notice Get the leaf count for an anchored root, or 0 if not anchored.
     */
    function getLeafCount(bytes32 merkleRoot) external view returns (uint256) {
        return leafCounts[merkleRoot];
    }

    /**
     * @notice Transfer ownership (for key rotation).
     */
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "LedraBatchAnchor: zero address");
        owner = newOwner;
    }
}
