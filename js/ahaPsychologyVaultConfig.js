// Feature gate: OFF until a separately approved Supabase migration, RLS
// tenancy rehearsal, and end-to-end restore verification in hosted staging.
// This is a UX feature gate, NOT an authorization boundary (Postgres RLS is).
window.AHA_PSYCHOLOGY_ACCOUNT_VAULT_ENABLED = false;

// Restricted operator-approved pilot on the exact AHA origin. The module
// offers a clearly labeled pilot link; ordinary navigation stays disabled.
window.AHA_PSYCHOLOGY_ACCOUNT_VAULT_PILOT_ENABLED = true;
