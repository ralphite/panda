#!/bin/sh
# Build cross-platform binaries and publish them to a GitHub release, which is
# where install.sh pulls from (releases/latest/download).
#
# Usage: scripts/release.sh vX.Y.Z
set -eu
VERSION="${1:?usage: scripts/release.sh vX.Y.Z}"
cd "$(dirname "$0")/.."

make release
gh release create "$VERSION" dist/panda-* --title "$VERSION" --generate-notes
echo "Published $VERSION — install.sh now resolves from releases/latest/download."
