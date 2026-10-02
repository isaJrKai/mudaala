#!/usr/bin/env bash
# Push Mudaala to a PRIVATE GitHub repo named "mudaala".
#
# Usage (token = Personal Access Token with `repo` scope, classic, or
# fine-grained with Administration + Contents read/write on this account):
#
#   GH_TOKEN=ghp_xxxx bash scripts/push-to-github.sh
#   GH_TOKEN=ghp_xxxx GH_USER=myname bash scripts/push-to-github.sh   # skip login lookup
#
# What it does:
#   1. Resolves your GitHub login from the token (unless GH_USER given)
#   2. Creates the PRIVATE repo <login>/mudaala via the REST API (idempotent —
#      continues if it already exists)
#   3. Adds remote "origin" WITHOUT embedding the token in .git/config
#   4. Pushes main and mudaala-redesign with -u (token passed one-shot via
#      credential helper, never persisted)
set -euo pipefail

: "${GH_TOKEN:?Set GH_TOKEN (a GitHub PAT with repo scope)}"
REPO_NAME="${REPO_NAME:-mudaala}"

api() { curl -sS -H "Authorization: Bearer ${GH_TOKEN}" -H "Accept: application/vnd.github+json" "$@"; }

if [ -z "${GH_USER:-}" ]; then
  GH_USER=$(api https://api.github.com/user | sed -n 's/.*"login": *"\([^"]*\)".*/\1/p' | head -1)
  [ -n "$GH_USER" ] || { echo "Could not resolve login from token — check the token or pass GH_USER=..."; exit 1; }
fi
echo "GitHub account: ${GH_USER}"

HTTP=$(api -o /tmp/mudaala-repo.json -w '%{http_code}' https://api.github.com/user/repos \
  -X POST -d "{\"name\":\"${REPO_NAME}\",\"private\":true,\"has_issues\":true,\"has_wiki\":false}")
if [ "$HTTP" = "201" ]; then
  echo "Created private repo ${GH_USER}/${REPO_NAME}"
elif [ "$HTTP" = "422" ]; then
  echo "Repo ${GH_USER}/${REPO_NAME} already exists — continuing"
else
  # 403 = token can't create repos. That's fine if the repo already exists
  # (created manually) and the token has Contents write — verify via GET.
  EXISTS=$(api -o /dev/null -w '%{http_code}' "https://api.github.com/repos/${GH_USER}/${REPO_NAME}")
  if [ "$EXISTS" = "200" ]; then
    echo "Repo ${GH_USER}/${REPO_NAME} already exists (creation skipped: token lacks Administration) — continuing"
  else
    echo "Cannot create repo (HTTP $HTTP) and repo does not exist (GET $EXISTS):"
    cat /tmp/mudaala-repo.json; echo
    exit 1
  fi
fi

git remote remove origin 2>/dev/null || true
git remote add origin "https://github.com/${GH_USER}/${REPO_NAME}.git"
echo "Remote origin set: $(git remote get-url origin)"

# One-shot askpass: token supplied at push time, never written to .git/config
ASKPASS="$(mktemp)"
trap 'rm -f "$ASKPASS"' EXIT
printf '#!/bin/sh\ncase "$1" in *Username*) echo "%s" ;; *) echo "$GH_TOKEN" ;; esac\n' "$GH_USER" > "$ASKPASS"
chmod +x "$ASKPASS"
export GIT_ASKPASS="$ASKPASS" GIT_TERMINAL_PROMPT=0

echo "--- pushing main ---"
git push -u origin main
echo "--- pushing mudaala-redesign ---"
git push -u origin mudaala-redesign

echo
echo "DONE. Private repo: https://github.com/${GH_USER}/${REPO_NAME}"
