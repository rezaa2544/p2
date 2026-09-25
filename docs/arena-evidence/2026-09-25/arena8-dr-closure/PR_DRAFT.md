# DR semantic recovery contracts and measured E3 regression

Base: 5d4a48f7f3cc0bc8ba144c61fb3996e1b458a7f2
Head: 452c7c10eed0274544c71422a772b6448e04a09b
Branch: arena8/dr-closure-20260923

Fix PITR argv/config/identity/hash validation; complete Redis AOF/native source attestation; fail-closed S3 publication with versioned readback; PG fencing/SQL guards; Sentinel response parsing; unknown DR metadata by default. Add five-round real E3 restore/HA tests and explicit S3 mocks, CI, and operator contract.

Five fresh PG restore/failover rounds and five Redis snapshot/Sentinel rounds PASS on this head. Thirteen regression entrypoints PASS. Detailed local evidence/report supplied separately.

Not merged. Push currently fails 128 (HTTPS auth unavailable), so this is a draft, NOT an existing GitHub PR. Real S3/E4 and completed remote CI NOT VERIFIED. No Production GO. Tech Lead owns review/merge.

Compatibility changes: verified PITR requires approved expected manifest; PG promotion requires executable fencing proof even with force; configured S3 requires owner/version/readback; API defaults now unknown/null. Read docs/DR_EVIDENCE_CONTRACT.md before rollout.
