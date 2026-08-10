# Nazareman Deployment Guide

## Prerequisites

- Node.js 18+ (recommended: 20 LTS)
- PostgreSQL 14+
- Access to a PostgreSQL database (local or cloud)

---

## Environment Variables

Create a `.env` file in the project root:

```env
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/nazareman?schema=public"
# One-time admin bootstrap: this phone number is promoted to UserRole.ADMIN
# when it signs in. Remove it after the first admin exists.
ADMIN_PHONE=""
```

## Admin Authentication

Admin access uses the normal phone session plus `UserRole.ADMIN` — there is no
shared admin password. To create the first admin:

1. Set `ADMIN_PHONE` to the phone number that should become admin.
2. Let that phone complete the normal OTP sign-in once.
3. The account is promoted to `UserRole.ADMIN`; it can now access `/admin`.
4. Remove `ADMIN_PHONE` from the environment (optional but recommended).

All admin operations thereafter are authorized server-side from the
authenticated session user's role.
