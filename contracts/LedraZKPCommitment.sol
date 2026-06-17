// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title LedraZKPCommitment
 * @notice Merkle ルートを使った ZKP コミットメント記録コントラクト
 *
 * @dev 部品装着の Merkle ルートを記録し、保険会社が選択的開示証明を
 *      オフチェーンで検証できるようにする。
 *
 *      プライバシー設計:
 *        - オンチェーンに記録するのは Merkle ルート (bytes32) のみ
 *        - 顧客情報・シリアル番号・価格は一切記録しない
 *        - 保険会社はオフチェーン API で選択的開示を受け取り、
 *          このコントラクトでルートの真正性を確認する
 *
 *      検証フロー:
 *        1. Ledra バックエンドが anchor(commitmentId, merkleRoot) を呼ぶ
 *        2. 保険会社が isCommitted(commitmentId) + getMerkleRoot(commitmentId)
 *           で真正性を確認
 *        3. オフチェーンで Merkle 証明を検証してクレームを確定
 *
 *      ガスコスト: 約 50,000 gas/tx (~$0.001 on Polygon mainnet)
 */
contract LedraZKPCommitment {

    /// @notice 新しいコミットメントが記録されたときに発行
    event Committed(
        bytes32 indexed commitmentId,
        bytes32 indexed merkleRoot,
        address indexed sender,
        uint256 timestamp
    );

    /// @notice オーナー変更イベント
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    /// @notice コミッター（書き込み権限）の追加・削除
    event CommitterSet(address indexed committer, bool allowed);

    /// @notice 緊急停止
    event PausedSet(bool paused);

    /// @notice commitmentId → Merkle ルートのマッピング
    mapping(bytes32 => bytes32) public merkleRoots;

    /// @notice commitmentId → アンカー時刻
    mapping(bytes32 => uint256) public commitTimestamps;

    address public owner;
    mapping(address => bool) public committers;
    bool public paused;

    modifier onlyOwner() {
        require(msg.sender == owner, "LedraZKP: not owner");
        _;
    }

    modifier onlyCommitter() {
        require(committers[msg.sender], "LedraZKP: not committer");
        _;
    }

    modifier whenNotPaused() {
        require(!paused, "LedraZKP: paused");
        _;
    }

    constructor() {
        owner = msg.sender;
        committers[msg.sender] = true;
        emit OwnershipTransferred(address(0), msg.sender);
        emit CommitterSet(msg.sender, true);
    }

    /**
     * @notice 部品装着コミットメントを記録する
     * @param commitmentId Ledra システム内のコミットメント UUID (bytes32 として渡す)
     * @param merkleRoot   クレーム Merkle ツリーのルートハッシュ
     * @dev 冪等: 同一 commitmentId の再記録は無視する (ガス節約)
     */
    function anchor(bytes32 commitmentId, bytes32 merkleRoot) external onlyCommitter whenNotPaused {
        if (commitTimestamps[commitmentId] != 0) return;
        require(merkleRoot != bytes32(0), "LedraZKP: zero merkle root");

        merkleRoots[commitmentId] = merkleRoot;
        commitTimestamps[commitmentId] = block.timestamp;

        emit Committed(commitmentId, merkleRoot, msg.sender, block.timestamp);
    }

    /**
     * @notice コミットメントが記録されているか確認する
     * @param commitmentId 確認する commitmentId
     */
    function isCommitted(bytes32 commitmentId) external view returns (bool) {
        return commitTimestamps[commitmentId] != 0;
    }

    /**
     * @notice 記録された Merkle ルートを取得する
     * @param commitmentId 取得する commitmentId
     * @return root Merkle ルート (未記録は bytes32(0))
     */
    function getMerkleRoot(bytes32 commitmentId) external view returns (bytes32 root) {
        return merkleRoots[commitmentId];
    }

    /**
     * @notice アンカー時刻を取得する
     * @param commitmentId 取得する commitmentId
     * @return Unix タイムスタンプ (未記録は 0)
     */
    function getCommitTimestamp(bytes32 commitmentId) external view returns (uint256) {
        return commitTimestamps[commitmentId];
    }

    /// @notice コミッターの追加・削除
    function setCommitter(address committer, bool allowed) external onlyOwner {
        require(committer != address(0), "LedraZKP: zero address");
        committers[committer] = allowed;
        emit CommitterSet(committer, allowed);
    }

    /// @notice 緊急停止
    function setPaused(bool _paused) external onlyOwner {
        paused = _paused;
        emit PausedSet(_paused);
    }

    /// @notice オーナー変更
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "LedraZKP: zero address");
        address prev = owner;
        owner = newOwner;
        emit OwnershipTransferred(prev, newOwner);
    }
}
