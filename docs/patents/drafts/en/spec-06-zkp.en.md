# Specification (EN, for PCT): Selective Disclosure Proof for Vehicle Part Installation

> Status: **English draft for PCT/foreign filing (attorney review required).** This is a translation/adaptation of the Japanese specification (`drafts/明細書-06-zkp選択的開示.md`); the Japanese text remains the authoritative priority basis. Final claim scope, patent-eligibility and prior-art clearance are for the attorney.

## Title of the Invention
Method, system and program for selective disclosure proof regarding installation of a vehicle part

## Technical Field
[0001] The present invention relates to selective disclosure proof technology that enables a verifier to verify the authenticity of a fact regarding a part installed in a vehicle while only a minimal subset of attributes is disclosed to the verifier, and without the verifier having to rely on a server of the entity that performs the method.

## Background Art
[0002] It is known to record a cryptographic hash of evidence data of installation/servicing on a distributed ledger (anchoring) to detect later tampering. Selective disclosure, in which only some items of held information are revealed using a hash tree or verifiable credentials, is also generally known.

[0003] However, in insurance assessment and accident handling, a verifier such as an insurer only needs to confirm that "a part of a given grade was installed in the vehicle at a given time" and need not obtain the customer's personal information, the part's serial number, the procurement price, or the complete value of the vehicle identification number (VIN). Disclosing such items should rather be avoided for privacy and trade-secret reasons.

### Citation List
[0004] PTL1: JP 2024-022912 A (concealment of cumulative value in a supply chain). NPL1: literature on selective disclosure using a Merkle tree.

## Summary of Invention

### Technical Problem
[0005] Full disclosure of evidence reveals unnecessary personal information and trade secrets. Querying the operator's server makes verification depend on that server (failing if the operator ceases business or the server data is tampered) and does not let the verifier independently confirm that concealed attributes have not been altered after the fact. A means is needed by which a third party can verify, without relying on the operator's server, that only the necessary attributes are truthfully disclosed while the others remain concealed yet fixed as of a given time. Resistance to brute-force (dictionary) reconstruction of low-entropy concealed values, and control of disclosure granularity, are also required.

### Solution to Problem
[0006] A selective disclosure proof method executed by at least one processor comprises: a claim generation step of generating a plurality of claims regarding a part installed in a vehicle, each claim being assigned a disclosed or non-disclosed designation; a computation step of computing, for each claim, a leaf commitment based on the value of the claim and a nonce derived by a deterministic function keyed by a secret value; a recording step of computing a root of a tree structure from the leaf commitments and recording the root on a distributed ledger; and a disclosure step of providing, for a claim designated by a verifier, an inclusion path in the tree structure, and providing the value of the claim only for a claim whose designation is disclosed. The verifier reconstructs a root from the provided inclusion path and collates it with the root recorded on the distributed ledger, thereby verifying the authenticity of the installation of the part without relying on the values of the non-disclosed claims or on a server of the entity performing the method.

[0007] Optionally, the claims include a coarse-grained time-of-installation claim obtained by rounding the installation time to a predetermined period unit. Optionally, the nonce is derived by a keyed hash taking a server-secret salt as key and a commitment identifier, a claim type and the value of the claim as input, such that a third party not knowing the salt cannot invert the value from the leaf commitment. Optionally, disclosed claims and claims whose value is concealed but whose fixation is proven are mixed within a single said tree structure. Optionally, the verification requires, in addition to verification of the inclusion path, that the root is already recorded on the distributed ledger.

### Advantageous Effects
[0008] The verifier can mathematically verify that a part of a given grade was installed at a given time without obtaining personal information, the part serial number, the price, or the complete VIN. Verification does not depend on the operator's server and is robust against the operator ceasing business or server tampering. Because the concealed attributes are also fixed as of a given time, fraud that later swaps only disclosed attributes is prevented. Only the root is recorded on the ledger, so no personal information or trade secret remains on the ledger.

## Brief Description of Drawings
[0009] Fig.1 block diagram of the system; Fig.2 generation/recording flow; Fig.3 claim classification and tree structure; Fig.4 sequence of server-independent verification; Fig.5 derivation of nonce and leaf.

## Description of Embodiments
[0010] The system 1 includes a generation device 10 (processor 11, memory 12, communication circuit 13, storage 14), a distributed ledger 20, and a verifier terminal 30. The invention is concretely realized by software-based information processing using these hardware resources; the distributed ledger 20 is a ledger in which post-recording tampering is computationally hard (e.g., a blockchain). Part installation may be performed by each of a plurality of mutually independent businesses.

[0011] In the claim generation step, the processor 11 generates, for one installation event, a plurality of claims each having a key (claim type), a value, and a disclosed/non-disclosed designation. Disclosed claims are e.g. part category, brand tier, assurance grade of identity verification, and time of installation; non-disclosed (committed-only) claims are e.g. quantity, a fingerprint indicating possession of a part serial, and a boolean of whether identity was verified.

[0012] The time-of-installation claim is generated by rounding the ISO time value to a monthly bucket (e.g. "2026-06") so that only the approximate period is disclosable. The bucket unit may be a quarter, a year, or any period.

[0013] In the computation step, the nonce N is derived deterministically as a keyed hash (HMAC) keyed by the server-secret salt S over a concatenation of the commitment identifier, claim type and value (N = HMAC_S(id ∥ type ∥ value)). The leaf commitment L is the cryptographic hash (e.g. SHA-256) of the concatenation of the type, value and nonce (L = H(type ∥ value ∥ N)). Because N is deterministic, the generation device can later regenerate the same leaf and inclusion path; a third party not knowing S cannot invert even a low-entropy concealed value from L.

[0014] In the recording step, a root R is computed as a binary hash tree (each internal node is the hash of the concatenation of its children; if the number of leaves is odd the last leaf is duplicated), and only R is recorded on the ledger. No claim value or pre-hash value is recorded. On failure the commitment id is still returned and recording may be retried later.

[0015] In the disclosure step, for each claim designated by the verifier, the generation device provides an inclusion path P (the sibling hashes and their left/right positions from the leaf to R); the value is attached only for disclosed claims. The verifier reconstructs a root from the leaf and P and collates it with the recorded R; matching proves the disclosed values are authentic members of the tree and the non-disclosed claims are fixed, without querying the operator's server. The verifier additionally requires R to be recorded on the ledger (existence + inclusion). No PII, serial, price or complete VIN is provided.

[0016] Variations: the tree may use any cryptographic hash; the selective-disclosure mechanism may instead be implemented with a zero-knowledge circuit (e.g. Groth16, PLONK, Noir) — the claimed "leaf commitment", "root" and "inclusion path" are construed as commitments, an aggregate value and a proof of equivalent function. The deterministic keyed function may be any keyed hash/PRF. A non-disclosed claim may represent a finalization state of installation confirmation bound to the user's possession proof (cooperating with a separate invention).

## Reference Signs
[0017] 1 system; 10 generation device; 11 processor; 12 memory; 13 communication circuit; 14 storage; 20 distributed ledger; 30 verifier terminal.

## Industrial Applicability
[0018] Applicable to proving the authenticity of vehicle servicing/part-replacement records to third parties (insurers, assessors, buyers) while protecting personal information and trade secrets.

---

## Claims

**1.** A selective disclosure proof method executed by at least one processor, comprising: a claim generation step of generating a plurality of claims regarding a part installed in a vehicle, each claim being assigned a disclosed or non-disclosed designation; a computation step of computing, for each claim, a leaf commitment based on a value of the claim and a nonce derived by a deterministic function keyed by a secret value; a recording step of computing a root of a tree structure from the leaf commitments and recording the root on a distributed ledger; and a disclosure step of providing, for a claim designated by a verifier, an inclusion path in the tree structure and providing the value of the claim only for a claim whose designation is disclosed; wherein the verifier collates a root reconstructed from the provided inclusion path with the root recorded on the distributed ledger, thereby being able to verify authenticity of the installation of the part without relying on values of the non-disclosed claims or on a server of an entity that performs the method.

**2.** The method of claim 1, wherein the claims include a coarse-grained time-of-installation claim obtained by rounding an installation time to a predetermined period unit.

**3.** The method of claim 1 or 2, wherein the nonce is derived by a keyed hash that takes a server-secret salt as a key and a commitment identifier, a claim type and the value of the claim as inputs, such that a third party not knowing the salt cannot invert the value from the leaf commitment.

**4.** The method of any one of claims 1 to 3, wherein the plurality of claims include, mixed within a single said tree structure, a claim that is disclosed and a claim whose value is concealed while only its fixation is proven.

**5.** The method of any one of claims 1 to 4, wherein the verification by the verifier determines overall validity on a condition that the root is already recorded on the distributed ledger, in addition to verification of the inclusion path.

**6.** The method of any one of claims 1 to 5, wherein, in the disclosure step, none of personal information, a part serial identifier, a price, and a complete value of a vehicle identifier is provided to the verifier.

**7.** The method of any one of claims 1 to 6, wherein a said non-disclosed claim includes a claim representing a state of installation confirmation finalized by being bound to a possession proof of the user.

**8.** The method of any one of claims 1 to 7, wherein the tree structure is a binary hash tree in which each internal node is computed based on hashes of its left and right children and the last leaf is duplicated when the number of leaves is odd.

**9.** A selective disclosure proof system comprising at least one processor, a memory and a communication circuit, the processor being configured to: generate a plurality of claims regarding a part installed in a vehicle, each assigned a disclosed or non-disclosed designation; compute, for each claim, a leaf commitment based on a value of the claim and a nonce derived by a deterministic function keyed by a secret value; compute a root of a tree structure from the leaf commitments and record the root on a distributed ledger; and provide, for a claim designated by a verifier, an inclusion path in the tree structure and provide the value of the claim only for a disclosed claim; whereby the verifier can verify authenticity of the installation without relying on values of the non-disclosed claims or on a server of the system.

**10.** A program for causing a computer to execute the steps of any one of claims 1 to 8.

## Abstract
A generation device generates, from an installation event, a plurality of claims each designated disclosed or non-disclosed, and computes a leaf commitment from each claim value and a deterministic nonce keyed by a secret. A root of a tree is computed and only the root is recorded on a distributed ledger. The verifier is given inclusion paths for designated claims, with values only for disclosed claims, and collates a reconstructed root with the recorded root, thereby verifying the authenticity of disclosed attributes and the fixation of concealed attributes without relying on the operator's server. The installation time is coarse-grained and the keyed nonce prevents inversion of low-entropy concealed values. (Fig.1)
