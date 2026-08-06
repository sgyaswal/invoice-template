#!/usr/bin/env bash
# Copies the deployable site into a staging directory (default: _site).
#
# Defines "what actually ships" in one place: the page and its assets, without
# the repo scaffolding (git metadata, CI, these scripts, the README, editor
# cruft). The CI gate and the Pages deploy both run it, so a green test means
# the artifact that deploys is the one that was checked.
set -euo pipefail

DEST="${1:-_site}"
cd "$(dirname "$0")/.."

rm -rf "$DEST"
mkdir -p "$DEST"

rsync -a \
  --exclude "/.git" \
  --exclude "/.github" \
  --exclude "/scripts" \
  --exclude "/README.md" \
  --exclude "/.gitignore" \
  --exclude "/$DEST" \
  --exclude ".DS_Store" \
  --exclude "_*" \
  ./ "$DEST/"

echo "staged into $DEST:"
find "$DEST" -type f | sort
