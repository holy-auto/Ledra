# Specification (EN, for PCT): Finalization of a Part Installation Record

> Status: **English draft for PCT/foreign filing (attorney review required).** Adapted from `drafts/明細書-07-確定ゲート.md`; the Japanese text is the authoritative priority basis.

## Title of the Invention
Method, system and program for finalizing a part installation record

## Technical Field
[0001] The invention relates to information-security technology that, for a record of a part installed in a vehicle or the like, suppresses fraud by the very entity that creates the record (impersonated finalization, alteration of content) and makes a finalized record an immutable record that no one, including an operator of the system, can alter.

## Background Art
[0002] Recording hashes on a distributed ledger to detect tampering, electronic signatures, one-time-password (OTP) identity verification, time-stamping by a third-party time-stamping authority (TSA), and append-only constraints for immutable records are each individually known, as is securing part authenticity along a supply chain using part serial identifiers.

### Citation List
[0003] PTL1: US 2021/0119771 A1 (provenance and anti-counterfeiting of a part using blockchain). NPL1: literature on RFC3161 time-stamping.

## Summary of Invention

### Technical Problem
[0004] In servicing/part replacement, the entity that creates and finalizes the record (the shop) can itself be the wrongdoer. Controlling the object, terminal and time, the shop can (1) perform the confirmation operation in place of the user to finalize the record without authorization (impersonated finalization), or (2) register its own contact in the user's contact field and itself receive the confirmation code or signature request and self-sign (control of contact). Conventional electronic signatures/OTP, relying on email delivery or application-layer judgment, can be bypassed by direct rewriting of the record or by swapping the contact when the finalizing entity is itself the attacker.

[0005] A mechanism is needed by which finalization — a legally/economically irreversible state transition — is bound to the user's physical possession and is enforced at the database layer rather than the application layer, so that neither the record creator nor the operator can act on the user's behalf or forge it.

### Solution to Problem
[0006] A method executed by at least one processor comprises: a computation step of computing, on a server side, a content hash from hashes of installation content and evidence; a possession-verification step of verifying, at a destination of a confirmation request, that a confirming party possesses a registered telephone number of the user by means of a one-time code, and obtaining a possession-proof value as a keyed hash of a normalized value of the telephone number; a signing step of obtaining an electronic signature binding the content hash to the possession-proof value; and a finalization step of transitioning the record to a finalized state, wherein, by a database-layer constraint and independently of an application, it is verified that (a) a signature is associated with the record and a signed object hash matches a current content hash, (b) the possession-proof value of the signature matches a registered possession-proof value of the user, and (c) an assurance grade of the signature satisfies a required grade derived from a risk of the part, the transition being refused if any of (a)–(c) is lacking; and wherein the database-layer constraint provides no exception even for a privileged service account.

[0007] Optionally, an achievable assurance grade via a contact whose provenance is the record creator is limited, such that for a part of at least a predetermined risk the required grade cannot be satisfied unless via a contact registered by the user. Optionally, after finalization, no change to content/signature/identity data is permitted and only a transition to a voided state with a recorded reason is permitted, correction being expressed only by issuing a new record and re-signature by the user. Optionally, for a part having an individual identifier, a keyed hash of the identifier and the individual number is uniquely registered platform-wide and only the presence/absence of a collision is returned, without disclosing the individual number or the consuming party to other parties.

### Advantageous Effects
[0008] Finalization is bound to the user's physical possession and enforced at the database layer, so neither the record creator nor the operator can perform impersonated finalization or alteration. Grade limitation by contact provenance prevents the creator from finalizing via its own contact. Cross-party individual collation detects reuse without leaking trade secrets. Combining TSA time-stamping with ledger recording also prevents after-the-fact alteration of the signing time.

## Brief Description of Drawings
[0009] Fig.1 system; Fig.2 database-layer finalization gate; Fig.3 grade limitation by contact provenance; Fig.4 immutability after finalization; Fig.5 cross-party individual collation.

## Description of Embodiments
[0010] The system 1 includes a server 10 (processor 11, memory 12, communication circuit 13), a storage 14 (a relational database in which constraints/triggers are defined), a distributed ledger 20, and a user terminal 40. The invention is concretely realized by software-based information processing using these hardware resources and a database management system. A record takes at least the states "installed", "user-verified" and "voided".

[0011] The content hash is computed server-side by canonicalizing the installation content (part name, identifier, lot, serial fingerprint, quantity, amount), a list of hashes of all evidence, the user identity, the finalization time, and a nonce; client-sent values are not trusted.

[0012] In possession verification, a single-use, short-lived, rate-limited one-time code is sent to the destination; the user inputs it on the user terminal 40 to prove possession of the telephone number. The raw number is neither stored nor transmitted; only a possession-proof value — a keyed hash over the normalized value (e.g. E.164) with a tenant identifier and pepper — is used for collation. Because a hash of only lower digits has a small value space, the primary key for collation uses a keyed hash of the whole normalized number.

[0013] In signing, a deterministic payload concatenating a version identifier, the content hash, the signing time, the record identifier, the signature identifier and the possession-proof value is signed with a signing key; a RFC3161-compliant time token is obtained from a third-party TSA over the signature or content hash and stored, proving the content existed at that time and has not since been altered.

[0014] In finalization, an update transitioning the record from "installed" to "user-verified" is intercepted by a before-update trigger defined in the storage 14, which permits the transition only if (a)–(b)–(c) all hold and otherwise raises an exception. Critically, the constraint provides no exception for a privileged service account (operator); thus even via direct database access bypassing the application, and even by the operator, the record cannot be finalized unless the user's signature, the possession match and the assurance-grade satisfaction all hold.

[0015] Grade limitation by provenance: each contact carries whether it was registered by the user (provenance = user) or input by the record creator (provenance = creator); the achievable grade via a creator-input contact is capped, so the top grade required by high-value or serialized parts cannot be met by a creator-input contact. The confirmation channel may prefer a first channel (e.g. a messaging app) and fall back to a second (e.g. SMS).

[0016] Immutability/voiding: after finalization, changes/deletions to content/signature/identity are uniformly refused by the constraint; only a reasoned transition to "voided" is allowed, with content/signature/identity held unchanged. Correction is expressed only by issuing a new record and obtaining re-signature; evidence and signatures are append-only.

[0017] Cross-party individual collation: for serialized parts, a keyed hash (individual fingerprint) of the identifier and the individual number is registered under a platform-wide uniqueness constraint and collated via a definer-privilege function that returns only the presence/absence of a collision, without disclosing the raw individual number or the consuming party. A vehicle-level aggregate of content hashes may additionally be recorded on the ledger. Mutual contradictions among independent records (photo, individual/quantity, three-way procurement reconciliation, ML anomaly) may be detected and recorded.

[0018] Variations: the possession-proof means is not limited to telephone possession (e.g. a secure element, public personal authentication); the database-layer constraint is not limited to a trigger (stored procedure, view privilege, row-level security). Application is not limited to vehicle parts.

## Reference Signs
[0019] 1 system; 10 server; 11 processor; 12 memory; 13 communication circuit; 14 storage/DB; 20 distributed ledger; 40 user terminal.

## Industrial Applicability
[0020] Applicable to suppressing fraud (impersonated finalization, content alteration, part substitution, individual reuse) in vehicle servicing/part replacement.

---

## Claims

**1.** A method for finalizing a part installation record, executed by at least one processor, comprising: a computation step of computing, on a server side, a content hash from hashes of installation content and evidence; a possession-verification step of verifying, at a destination of a confirmation request, that a confirming party possesses a registered telephone number of a user by a one-time code, and obtaining a possession-proof value as a keyed hash of a normalized value of the telephone number; a signing step of obtaining an electronic signature binding the content hash to the possession-proof value; and a finalization step of transitioning the record to a finalized state, wherein, by a database-layer constraint independent of an application, it is verified that (a) a signature is associated with the record and a signed object hash matches a current content hash, (b) the possession-proof value of the signature matches a registered possession-proof value of the user, and (c) an assurance grade of the signature satisfies a required grade derived from a risk of the part, and the transition is refused if any of (a) to (c) is lacking; the database-layer constraint providing no exception even for a privileged service account.

**2.** The method of claim 1, wherein an achievable assurance grade via a contact whose provenance is a creator of the record is limited, such that for a part of at least a predetermined risk the required grade cannot be satisfied unless via a contact registered by the user.

**3.** The method of claim 1 or 2, wherein after the transition to the finalized state, no change to content, signature and identity data is permitted, only a transition to a voided state with a recorded reason is permitted, and correction is expressed only by issuing a new record and re-signature by the user.

**4.** The method of any one of claims 1 to 3, wherein, for a part having an individual identifier, a keyed hash of the identifier and an individual number is uniquely registered across a platform, only presence or absence of a collision is returned, and the individual number and a consuming party are not disclosed to other parties.

**5.** The method of any one of claims 1 to 4, wherein the required grade is derived from a kind or an amount threshold of the part.

**6.** The method of any one of claims 1 to 5, wherein both a time token by a third-party time-stamping authority and recording, on a distributed ledger, of an aggregate value bundling a plurality of content hashes per vehicle are applied to the content hash.

**7.** The method of any one of claims 1 to 6, wherein the confirmation request prefers a first channel and falls back to a second channel when the first channel is unavailable.

**8.** The method of any one of claims 1 to 7, further comprising detecting and recording mutual contradiction among a plurality of independent records relating to the installation.

**9.** A part installation record finalization system comprising at least one processor, a memory, a communication circuit and a storage holding a database, the processor being configured to compute a content hash server-side from hashes of installation content and evidence, verify by a one-time code that a confirming party possesses a registered telephone number of a user and obtain a possession-proof value as a keyed hash of a normalized value thereof, and obtain an electronic signature binding the content hash to the possession-proof value; wherein a constraint defined in the storage verifies, independently of an application, that (a) a signature is associated with the record and its signed object hash matches a current content hash, (b) the possession-proof value matches a registered possession-proof value of the user, and (c) an assurance grade satisfies a required grade derived from a risk of the part, refuses the transition of the record to a finalized state if any is lacking, and provides no exception even for a privileged service account.

**10.** A program for causing a computer to execute the steps of any one of claims 1 to 8.

## Abstract
A content hash is computed server-side from installation content and evidence hashes; a one-time code verifies the user's telephone possession, yielding a possession-proof value (a keyed hash of the normalized number). The content hash is signed bound to the possession-proof value, and the transition to a finalized state is permitted by a database-layer constraint only if signature match, possession match and assurance-grade satisfaction all hold; the constraint allows no exception even for a privileged service account. Achievable assurance is capped by contact provenance, and after finalization only a reasoned voiding is allowed. Serial identifiers are collated cross-party by keyed hash without revealing raw values; TSA time-stamping and ledger aggregation are combined. (Fig.2)
