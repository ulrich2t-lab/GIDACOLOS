# Qolock Maradi — Security Specification (Phase 0)

## 1. Data Invariants

1. **Public vs Private Listing Separation**: Public visitors can read/list `listings` with `status in ['published', 'reserved', 'rented']`, while landlord phone numbers live strictly in `/listings/{listingId}/private/contact`, accessible only to the listing owner, Admin (`ulrich2t@gmail.com` verified), or a user possessing an Admin-verified `/passAccess/{uid}_{listingId}` unlock record.
2. **Moderation Gate**: Non-admin landlords can only create listings with `status == 'pending'`, `isVerifiedQolock == false`, and `isTop == false`. Only Admin can approve (`published`), reject (`rejected`), award the `Vérifié Qolock` badge, or activate `isTop`. Once approved, owners may toggle their own listing strictly among `published`, `reserved`, and `rented`.
3. **Pass Visite & Payment Integrity**: Users submit `serviceOrders` strictly with `status == 'pending'` and `userId == request.auth.uid`. Only Admin can transition `status` to `'verified'` or `'rejected'` (terminal states) and issue `/passAccess/{uid}_{listingId}`.
4. **PII Isolation**: User email and phone live strictly in `/users/{uid}/private/info` readable only by the user or Admin. Public roommate profiles (`/colocProfiles`) and per-listing colocation introductions (`/listings/{id}/colocInterests`) never contain private email or phone fields.
5. **Verified Identity & Admin Bootstrapping**: Standard writes require either a verified email token (`email_verified == true`) or a verified Firebase Phone Auth token (`phone_number` present). Admin privileges strictly require `request.auth.token.email_verified == true` matching `ulrich2t@gmail.com` or an entry in `/admins/{uid}`.
6. **Media & Video Clip Isolation**: Uploaded listing video clips live in `/listings/{listingId}/videoClips/{clipId}` under strict size/MIME bounds and Master Gate checks so unapproved (`pending`/`rejected`) listing clips remain hidden from the public and only the listing owner or Admin can write/delete them.

## 2. The "Dirty Dozen" Adversarial Payloads

1. **Self-Publishing Listing Bypass**: Landlord creates listing with `status: 'published'`. Expected: `PERMISSION_DENIED`.
2. **Badge / TOP Self-Promotion**: Landlord creates/updates listing with `isVerifiedQolock: true` or `isTop: true`. Expected: `PERMISSION_DENIED`.
3. **Unauthenticated Private Contact Scrape**: Visitor reads `/listings/l1/private/contact` without PassAccess. Expected: `PERMISSION_DENIED`.
4. **Non-Paying Student Contact Read**: Authenticated student without `/passAccess/{uid}_l1` reads `/listings/l1/private/contact`. Expected: `PERMISSION_DENIED`.
5. **Self-Verified Pass Order**: Student creates `/serviceOrders/o1` with `status: 'verified'`. Expected: `PERMISSION_DENIED`.
6. **Student Forging PassAccess**: Student writes `/passAccess/{uid}_l1` directly. Expected: `PERMISSION_DENIED`.
7. **Unverified Admin Email Spoof**: Unverified token with admin email attempts to approve a listing. Expected: `PERMISSION_DENIED`.
8. **Cross-Owner Listing Hijack**: User B updates User A's listing or colocation profile. Expected: `PERMISSION_DENIED`.
9. **Tariff Tampering**: Non-admin updates `/platformConfig/settings`. Expected: `PERMISSION_DENIED`.
10. **PII Cross-Read**: User B reads `/users/userA/private/info`. Expected: `PERMISSION_DENIED`.
11. **Terminal Order Replay**: Student or user edits a `'verified'` order back to `'pending'`. Expected: `PERMISSION_DENIED`.
12. **Unscoped Pending Listing Scrape**: Visitor lists `/listings` without filtering `status in ['published', 'rented']` to read unapproved `'pending'` listings. Expected: `PERMISSION_DENIED`.
