#!/bin/sh
# Build cross-platform binaries and publish them to a GitHub release, which is
# where install.sh pulls from (releases/latest/download).
#
# Usage: scripts/release.sh vX.Y.Z
set -eu
VERSION="${1:?usage: scripts/release.sh vX.Y.Z}"
cd "$(dirname "$0")/.."

EXPECTED="panda-darwin-amd64 panda-darwin-arm64 panda-linux-amd64 panda-linux-arm64 panda-windows-amd64.exe panda-windows-arm64.exe"

make release

# Never publish a release the installer can't resolve: every binary must exist
# locally before we create it, and must be attached after.
for a in $EXPECTED; do
	[ -f "dist/$a" ] || { echo "error: dist/$a was not built — aborting release" >&2; exit 1; }
done

gh release create "$VERSION" dist/panda-* --title "$VERSION" --generate-notes

for a in $EXPECTED; do
	gh release view "$VERSION" --json assets --jq '.assets[].name' | grep -qx "$a" \
		|| { echo "error: $a did not attach to $VERSION" >&2; exit 1; }
done

echo "Published $VERSION with all six binaries — install.sh now resolves from releases/latest/download."
