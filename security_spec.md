# Security Specification & Payload-First TDD (`firestore.rules`)

## 1. Data Invariants
1. **Wholesale Cost & Supplier Isolation**: Wholesale `costPriceUsd`, markup configs (`pricing_config`), supplier metadata (`suppliers`), and `manager_cost_shards` are strictly readable and writable ONLY by verified admins (`isAdmin()`). Unauthenticated users and regular clients can NEVER read or list them.
2. **Public Catalog Integrity**: `public_catalog_shards` and `registry_meta` are readable by storefront clients (containing zero PII and zero wholesale costs) and writable ONLY by verified admins (`isAdmin()`).
3. **Customer Order PII Isolation**: `orders/{orderId}` documents contain customer name, phone, and email. `get` and `list` are strictly restricted to the owning `request.auth.uid` (`resource.data.userId == request.auth.uid`) or `isAdmin()`.
4. **Immutable Ownership & Timestamps**: `orders.userId` and `orders.createdAt` cannot change after creation; `createdAt` and `updatedAt` MUST equal `request.time`.
5. **Terminal State Lock**: Once an order reaches `status == 'completed'`, non-admin mutations are strictly blocked.
6. **Strict Schema & Bounded Arrays**: Every document validates exact required/allowed keys (`hasAll` + `hasOnly`), string `.size()` bounds, array `.size()` bounds + first-element type check, and `isValidId()` regex on all single-doc path variables.

## 2. The "Dirty Dozen" Attack Payloads (Expected: `PERMISSION_DENIED`)
1. **Unauthenticated Cost Scrape**: `GET /manager_cost_shards/shard_0` with `auth = null`.
2. **Regular User Cost Scrape**: `LIST /manager_cost_shards` as signed-in non-admin user.
3. **Spoofed Admin Email (Unverified)**: `WRITE /pricing_config/default` with `email = "imenielordovo@gmail.com"` and `email_verified = false`.
4. **Shadow Field Injection on Order**: `CREATE /orders/ord_1` including ghost field `isApproved: true`.
5. **Identity Spoofing on Order**: `CREATE /orders/ord_2` with `userId = "other_user_uid"` when `auth.uid = "user_a"`.
6. **PII Cross-User Read**: `GET /orders/ord_user_a` when `auth.uid = "user_b"` (non-admin).
7. **Unfiltered Order List Scrape**: `LIST /orders` as `user_b` without `where("userId", "==", "user_b")`.
8. **Client-Forged Timestamp**: `CREATE /orders/ord_3` with client timestamp `createdAt != request.time`.
9. **ID Poisoning**: `CREATE /orders/` + 300-char junk string with invalid chars (`../../bad`).
10. **Status Shortcutting on Order Create**: `CREATE /orders/ord_4` with `status: "completed"`.
11. **Value Poisoning on Update**: `UPDATE /orders/ord_1` changing `status` to boolean `true` or oversized 2000-char comment.
12. **Self-Assigned Admin Escalation**: `CREATE /admins/user_b` by non-admin `user_b` with `{ role: "admin" }`.
