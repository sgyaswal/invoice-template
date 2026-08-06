#!/usr/bin/env bash
# Copies the deployable site into a staging directory (default: _site).
#
# Both deploy jobs call this, so "what actually ships" is defined in one place:
# the page and its assets, without the repo scaffolding (git metadata, CI,
# these scripts, the GitHub README, editor cruft).
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
