#!/usr/bin/env bash
# Zameen Register: publish/update on GitHub Pages (free HTTPS, needed for phone GPS).
# Safe to run again any time; it only pushes changes.
set -euo pipefail
cd "$(dirname "$0")"
REPO="${1:-zameen}"
say(){ printf '\n\033[1;32m▶ %s\033[0m\n' "$*"; }
warn(){ printf '\033[1;33m! %s\033[0m\n' "$*"; }

# 1) git + gh: install only if missing
if ! command -v git >/dev/null; then say "Installing git (needs your sudo password)"; sudo apt-get update -qq; sudo apt-get install -y git; else echo "✓ git $(git --version | awk '{print $3}') already installed"; fi
if ! command -v gh >/dev/null; then
  say "Installing GitHub CLI (gh)"
  if ! sudo apt-get install -y gh 2>/dev/null; then
    # official GitHub repository (newer gh)
    sudo mkdir -p -m 755 /etc/apt/keyrings
    curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo tee /etc/apt/keyrings/githubcli-archive-keyring.gpg >/dev/null
    sudo chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list >/dev/null
    sudo apt-get update -qq && sudo apt-get install -y gh
  fi
else echo "✓ gh $(gh --version | head -1 | awk '{print $3}') already installed"; fi

# 2) GitHub login (once)
if ! gh auth status >/dev/null 2>&1; then
  say "Log in to GitHub — a code will appear; your browser opens, paste the code, approve"
  gh auth login --hostname github.com --git-protocol https --web
fi
gh auth setup-git >/dev/null 2>&1 || true
OWNER="$(gh api user -q .login)"
echo "✓ Logged in as $OWNER"

# 3) commit + push
[ -d .git ] || { git init -q; git checkout -q -b main 2>/dev/null || git branch -M main; }
git add -A
git -c user.name="$OWNER" -c user.email="$OWNER@users.noreply.github.com" commit -qm "Zameen Register $(date '+%F %T')" && echo "✓ Changes committed" || echo "✓ Nothing new to commit"
if ! git remote get-url origin >/dev/null 2>&1; then
  if gh repo view "$OWNER/$REPO" >/dev/null 2>&1; then
    warn "Repo $OWNER/$REPO already exists on GitHub — pushing to it"
    git remote add origin "https://github.com/$OWNER/$REPO.git"
  else
    say "Creating public repo $OWNER/$REPO (only app code — your land data stays on your phone)"
    gh repo create "$REPO" --public --description "Zameen Register – offline land records PWA" >/dev/null
    git remote add origin "https://github.com/$OWNER/$REPO.git"
  fi
fi
say "Uploading"
git push -q -u origin main --force-with-lease 2>/dev/null || git push -q -u origin main

# 4) turn on GitHub Pages (ignored if already on) and wait for it
gh api -X POST "repos/$OWNER/$REPO/pages" -f "source[branch]=main" -f "source[path]=/" >/dev/null 2>&1 || true
URL="https://$OWNER.github.io/$REPO/"
say "Waiting for GitHub Pages to publish (usually under 2 min)…"
for i in $(seq 1 40); do
  st="$(gh api "repos/$OWNER/$REPO/pages/builds/latest" -q .status 2>/dev/null || echo pending)"
  [ "$st" = "built" ] && break
  [ "$st" = "errored" ] && { warn "Pages build errored — check https://github.com/$OWNER/$REPO/actions"; break; }
  sleep 5; printf '.'
done
echo
printf '\n\033[1;32m✅ Your app: %s\033[0m\n' "$URL"
if command -v qrencode >/dev/null; then echo "Scan with your phone:"; qrencode -t ansiutf8 "$URL"; else echo "(Tip: 'sudo apt install qrencode' then run again to get a QR code to scan with your phone.)"; fi
echo "On the phone: open the link in Chrome → ⋮ → Add to Home screen. Allow location when asked."
command -v xdg-open >/dev/null && xdg-open "$URL" >/dev/null 2>&1 || true
