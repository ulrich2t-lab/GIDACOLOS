/**
 * Dirty Dozen adversarial verification cases for Qolock Maradi Firestore rules.
 */
export const QOLOCK_DIRTY_DOZEN = [
  { name: '01. Landlord creates listing already published', path: 'listings/l1', expected: 'PERMISSION_DENIED' },
  { name: '02. Landlord sets isVerifiedQolock or isTop', path: 'listings/l1', expected: 'PERMISSION_DENIED' },
  { name: '03. Visitor reads private contact info', path: 'listings/l1/private/contact', expected: 'PERMISSION_DENIED' },
  { name: '04. Student without PassAccess reads private contact', path: 'listings/l1/private/contact', expected: 'PERMISSION_DENIED' },
  { name: '05. Student creates pre-verified serviceOrder', path: 'serviceOrders/o1', expected: 'PERMISSION_DENIED' },
  { name: '06. Student forges passAccess document', path: 'passAccess/u1_l1', expected: 'PERMISSION_DENIED' },
  { name: '07. Unverified email spoofing admin', path: 'listings/l1', expected: 'PERMISSION_DENIED' },
  { name: '08. Cross-owner listing or colocProfile modification', path: 'colocProfiles/cp1', expected: 'PERMISSION_DENIED' },
  { name: '09. Non-admin modifies platformConfig/settings', path: 'platformConfig/settings', expected: 'PERMISSION_DENIED' },
  { name: '10. Cross-user private PII read', path: 'users/u1/private/info', expected: 'PERMISSION_DENIED' },
  { name: '11. Terminal serviceOrder rollback', path: 'serviceOrders/o1', expected: 'PERMISSION_DENIED' },
  { name: '12. Visitor lists pending/rejected listings or orphaned colocInterests', path: 'listings/l1/colocInterests/u2', expected: 'PERMISSION_DENIED' },
  { name: '13. Visitor reads videoClip of pending listing or non-owner uploads clip', path: 'listings/l1/videoClips/clip1', expected: 'PERMISSION_DENIED' },
] as const;
