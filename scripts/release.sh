#!/usr/bin/env bash
#
# Cut a release: bump the extension version, commit, tag, and push.
# Pushing the tag triggers .github/workflows/publish.yml, which publishes the
# extension to both the VS Code Marketplace and Open VSX.
#
# Usage: scripts/release.sh [patch|minor|major]   (default: patch)
set -euo pipefail

RELEASE_TYPE="${1:-patch}"
case "${RELEASE_TYPE}" in
  major|minor|patch) ;;
  *) echo "[release] Usage: release.sh [patch|minor|major]"; exit 1 ;;
esac

# Run from the repo root regardless of where the task invokes us.
cd "$(dirname "$0")/.."

# Refuse to release with uncommitted changes (so the release commit is clean).
if [ -n "$(git status --porcelain)" ]; then
  echo "[release] Working tree is not clean. Commit or stash your changes first."
  git status --short
  exit 1
fi

echo "[release] Bumping ${RELEASE_TYPE} version of the extension..."
npm version "${RELEASE_TYPE}" --no-git-tag-version -w ai-semantic-search >/dev/null

VERSION="$(node -p "require('./packages/vscode-extension/package.json').version")"
TAG="v${VERSION}"

echo "[release] Committing and tagging ${TAG} ..."
git commit -am "Release ${TAG}"
git tag "${TAG}"

echo "[release] Pushing ..."
git push
git push origin "${TAG}"

echo "[release] Done: ${TAG} pushed. The 'Publish Extension' GitHub Action will build and"
echo "[release] publish to the VS Code Marketplace and Open VSX. Watch the repo's Actions tab."
