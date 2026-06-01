#!/usr/bin/env bash
#
# Cut a release: bump the extension version, commit, tag, and push.
# Pushing the tag triggers .github/workflows/publish.yml, which publishes the
# extension to both the VS Code Marketplace and Open VSX.
#
# Usage: scripts/release.sh [patch|minor|major]   (default: patch)
set -euo pipefail

RELEASE_TYPE="${1:-patch}"
case "$RELEASE_TYPE" in
  major|minor|patch) ;;
  *) echo "❌ Usage: release.sh [patch|minor|major]"; exit 1 ;;
esac

# Run from the repo root regardless of where the task invokes us.
cd "$(dirname "$0")/.."

# Refuse to release with uncommitted changes (so the release commit is clean).
if [ -n "$(git status --porcelain)" ]; then
  echo "❌ Working tree is not clean. Commit or stash your changes first."
  git status --short
  exit 1
fi

echo "⬆️  Bumping $RELEASE_TYPE version of the extension…"
npm version "$RELEASE_TYPE" --no-git-tag-version -w ai-code-search >/dev/null

VERSION="$(node -p "require('./packages/vscode-extension/package.json').version")"
TAG="v$VERSION"

echo "📝 Committing and tagging $TAG…"
git commit -am "Release $TAG"
git tag "$TAG"

echo "🚀 Pushing…"
git push
git push origin "$TAG"

echo "✅ Released $TAG. The 'Publish Extension' GitHub Action will now build and publish"
echo "   to the VS Code Marketplace and Open VSX. Watch it under the repo's Actions tab."
