# Specification (EN, for PCT): Integrity Proof of Vehicle Service History Distributed Across Businesses

> Status: **English draft for PCT/foreign filing (attorney review required).** Adapted from `drafts/明細書-01-メタアンカー.md`; Japanese text is the authoritative priority basis.
> ⚠️ The broad concept (cross-business aggregation keyed by VIN) is self-disclosed; the independent claims are limited to the **mechanism** (order-independent digest → single transaction → third-party recomputation). Note: foreign grace periods differ from Japan's Art.30 — see `pct-filing-notes.en.md`.

## Title of the Invention
Method, system and program for proving integrity of vehicle service history distributed across a plurality of businesses

## Technical Field
[0001] The invention enables verification, on a per-vehicle basis and without relying on a server of the operating entity, of the integrity of the entire service history that a plurality of mutually independent businesses have separately recorded on a distributed ledger for the same vehicle.

## Background Art
[0002] Recording a cryptographic hash of evidence (e.g. installation photos) on a distributed ledger (individual anchoring) to detect tampering is known, as are efforts to record vehicle information on a distributed ledger.

### Citation List
[0003] PTL1: WO 2018/014123 A1 (distributed ledger platform for vehicle records).

## Summary of Invention

### Technical Problem
[0004] Conventionally, (1) records are fragmented per business with no means to verify the entire history of one vehicle at once; (2) verifying the whole history requires individually collating many transactions, which is impractical for a third party; and (3) verification tends to depend on the operator's server, becoming impossible if the operator ceases business or the server data is tampered. A means is needed by which a third party can verify, by a single value collation and without relying on any business's server, records made by mutually independent businesses.

### Solution to Problem
[0005] Above individual anchoring of units such as images, a per-vehicle aggregate-anchor (meta-anchor) layer is provided. A method executed by at least one processor comprises: a first recording step in which each of a plurality of mutually independent business terminals individually records, on a distributed ledger, a cryptographic hash of evidence data of installation performed on a vehicle and holds a transaction identifier of that record; a collection step of cross-collecting, based on a normalized vehicle identifier, the transaction identifiers of the plurality of businesses associated with the vehicle; a computation step of normalizing the collected set of transaction identifiers to be order-independent by de-duplication and sorting in a predetermined order, and computing an aggregate digest of concatenated data obtained by concatenating the set with the normalized vehicle identifier; and a second recording step of recording the aggregate digest on the distributed ledger as a single transaction.

[0006] Optionally, the second recording step is not executed when the computed aggregate digest matches an aggregate digest already recorded for the vehicle (idempotency/cost optimization). Optionally, the normalized vehicle identifier, the aggregate digest and the set of transaction identifiers are provided externally so that a third party can recompute the aggregate digest by the same procedure as the computation step and collate it with the record on the distributed ledger (server-independent verification).

### Advantageous Effects
[0007] The integrity of the entire cross-business service history of one vehicle can be proven and verified by a single transaction identifier. Verification cost approaches a constant independent of the number of history items. Verification does not depend on the operator's server and is robust against the operator ceasing business or server tampering. No write occurs unless the set changes, minimizing cost. No personal information is recorded on the ledger, consistent with deletion of the original.

## Brief Description of Drawings
[0008] Fig.1 system; Fig.2 flow from individual anchoring to aggregate anchoring; Fig.3 order-independent computation of the aggregate digest; Fig.4 sequence of server-independent verification.

## Description of Embodiments
[0009] The system 1 includes an aggregation device 10 (processor 11, memory 12, communication circuit 13, storage 14), a plurality of business terminals 50 (50a–50c) operated by mutually independent businesses, a distributed ledger 20, and a verifier terminal 30. The invention is concretely realized by software-based information processing using these hardware resources.

[0010] First recording: each business terminal 50 computes a cryptographic hash of its installation evidence, records it individually on the ledger 20, and holds the resulting transaction identifier.

[0011] Collection: the processor 11 uses a key obtained by normalizing the VIN (e.g. upper-casing, full-/half-width unification, removal of delimiters) and cross-collects the transaction identifiers from the installation records held by the plurality of mutually independent businesses associated with that key; records of businesses set to be excluded from aggregation are excluded.

[0012] Computation: the processor 11 normalizes the collected set to be order-independent by lower-casing, de-duplication and ascending sort, concatenates the normalized vehicle identifier with the normalized set using a predetermined delimiter (e.g. a newline), and computes the cryptographic hash (e.g. SHA-256) of the concatenated data as the aggregate digest. Owing to the sort, the same aggregate digest is deterministically obtained from the set independently of installation order or recording order, so any party holding the set arrives at the same digest.

[0013] Second recording and idempotency: the processor 11 records the aggregate digest on the ledger 20 as a single transaction and stores the result in the per-vehicle record. If the recomputed digest matches the already-recorded digest, the second recording step is not executed; thus a new transaction is issued only when the set changes. On failure, the digest is retained while the transaction identifier field is left empty, and a periodic process retries.

[0014] Server-independent verification: the device 10 provides the verifier terminal 30 with the normalized vehicle identifier, the aggregate digest, its recording transaction identifier, and the set of constituent transaction identifiers. The verifier processes the identifiers by the same rule (lower-case, de-duplicate, ascending sort, concatenate with the vehicle identifier, hash) to recompute the aggregate digest and collates it with the digest recorded on the ledger 20; a match confirms the integrity of the whole history without trusting the server of the device 10 or of any business terminal 50.

[0015] Privacy: no personal information is recorded on the ledger 20; only fixed-length hashes are recorded, so deleting the original data renders the personal information unrecoverable.

[0016] Variations: the hash is not limited to SHA-256; normalization may compute a Merkle-tree root over the transaction identifiers as the aggregate digest with per-element inclusion proofs; the ledger is not limited to a particular blockchain; the aggregation target may include hashes of other evidence associated with the vehicle, such as content hashes of part installations.

## Reference Signs
[0017] 1 system; 10 aggregation device; 11 processor; 12 memory; 13 communication circuit; 14 storage; 20 distributed ledger; 30 verifier terminal; 50 (50a–50c) business terminals.

## Industrial Applicability
[0018] Applicable to used-vehicle distribution, insurance assessment and integrity proof of service history, providing efficient and robust proof of the integrity of vehicle history distributed across businesses.

---

## Claims

**1.** A method for proving integrity of vehicle service history, executed by at least one processor, comprising: a first recording step in which each of a plurality of mutually independent business terminals individually records, on a distributed ledger, a cryptographic hash of evidence data of installation performed on a vehicle, and holds a transaction identifier of that record; a collection step of cross-collecting, based on a normalized vehicle identifier, the transaction identifiers of the plurality of businesses associated with the vehicle; a computation step of normalizing the collected set of transaction identifiers to be order-independent by de-duplication and sorting in a predetermined order, and computing an aggregate digest of concatenated data obtained by concatenating the set with the normalized vehicle identifier; and a second recording step of recording the aggregate digest on the distributed ledger as a single transaction.

**2.** The method of claim 1, wherein the second recording step is not executed when the aggregate digest computed in the computation step matches an aggregate digest already recorded for the vehicle.

**3.** The method of claim 1 or 2, wherein the normalized vehicle identifier, the aggregate digest and the set of transaction identifiers are provided externally so that a third party can recompute the aggregate digest by the same procedure as the computation step and collate it with the record on the distributed ledger.

**4.** The method of any one of claims 1 to 3, wherein the collection step excludes records of a business, among the plurality of businesses, that is set to be excluded from aggregation.

**5.** The method of any one of claims 1 to 4, wherein personal information contained in the evidence data is not recorded on the distributed ledger, and deletion of an original of the evidence data renders the personal information unrecoverable.

**6.** The method of any one of claims 1 to 5, wherein, when the second recording step fails, the aggregate digest is retained while the transaction identifier is left empty, and the second recording step is retried by a periodic process.

**7.** The method of any one of claims 1 to 6, wherein computing the aggregate digest comprises computing a root of a hash tree having each of the transaction identifiers as a leaf.

**8.** A vehicle service history integrity proving system comprising at least one processor, a memory and a communication circuit, the processor being configured to: cross-collect, based on a normalized vehicle identifier, transaction identifiers obtained when cryptographic hashes of evidence data of installation performed on a vehicle by a plurality of mutually independent businesses were individually recorded on a distributed ledger; normalize the collected set of transaction identifiers to be order-independent by de-duplication and sorting in a predetermined order and compute an aggregate digest of concatenated data obtained by concatenating the set with the normalized vehicle identifier; and record the aggregate digest on the distributed ledger as a single transaction.

**9.** A program for causing a computer to execute the steps of any one of claims 1 to 7.

## Abstract
Each business records a hash of its installation evidence individually on a distributed ledger and holds a transaction identifier. An aggregation device cross-collects the transaction identifiers of plural businesses by a normalized vehicle identifier, normalizes the set to be order-independent by de-duplication and ascending sort, concatenates it with the vehicle identifier, and computes an aggregate digest, which is recorded as a single transaction. No re-recording occurs while the set is unchanged. By publishing the identifier set and the aggregate digest, a third party recomputes the digest by the same procedure and collates it with the recorded value, verifying the integrity of the whole history without relying on any server; only hashes are recorded on the ledger so deleting the original renders personal information unrecoverable. (Fig.2)
