#!/usr/bin/env bash
# Deploys the Decibel backend to your Supabase project:
#   1. links the project
#   2. pushes Edge Function secrets from supabase/functions/.env (empty values skipped)
#   3. deploys every Edge Function
#   4. applies migration 0003 (0001 and 0002 were run by hand in the SQL editor,
#      so they are marked as applied first)
#
# Prerequisite: `supabase login` with an account that can access the project.
set -euo pipefail

REF="${SUPABASE_PROJECT_REF:-fkjwglvztyyerewldnty}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

ENV_FILE="supabase/functions/.env"
[ -f "$ENV_FILE" ] || { echo "Missing $ENV_FILE (copy supabase/functions/.env.example)"; exit 1; }

echo "==> Linking project $REF"
supabase link --project-ref "$REF"

echo "==> Setting Edge Function secrets"
TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT
grep -Ev '^\s*#|^\s*$|=\s*$|=""\s*$' "$ENV_FILE" > "$TMP"
supabase secrets set --env-file "$TMP"

echo "==> Deploying Edge Functions"
supabase functions deploy

echo "==> Applying migrations"
supabase migration repair --status applied 0001 0002
supabase db push

cat <<MSG

Done. Remaining one-off steps in the Supabase dashboard:
  - Authentication > URL configuration: add your app URL and <app>/auth/callback
  - Authentication > Providers: enable Google if you want Google sign-in
  - Authentication > Sign in / Providers > Email: turn off "Confirm email" if
    onboarding should start before the address is verified (PRD section 5)
MSG
