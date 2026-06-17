#!/bin/sh
# Integration tests for install.sh (macOS / Linux).
#
# Runs the installer end-to-end in throwaway directories and asserts the
# documented outcomes from spec/install.spec.md. Safe to run locally (it never
# touches your real $HOME, shell rc files, or a pre-existing panda on :8088) and
# in CI, where a clean runner also exercises the cold background-start path.
#
# Requires a built ./panda and dist/panda-<os>-<arch> (run `make build` and,
# for the download-path cases, `make release` first — CI does both).
set -eu

CDPATH=''  # keep `cd` from wandering or echoing if the caller exported CDPATH
ROOT="$(cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$ROOT"

PORT=8088
URL="http://localhost:$PORT/screenshot"
PASS=0
FAIL=0

ok()   { PASS=$((PASS + 1)); printf '  \033[1;32mok\033[0m   %s\n' "$1"; }
bad()  { FAIL=$((FAIL + 1)); printf '  \033[1;31mFAIL\033[0m %s\n' "$1"; }
note() { printf '  \033[1;33m--\033[0m   %s\n' "$1"; }
head() { printf '\n\033[1;36m# %s\033[0m\n' "$1"; }

# assert "label" <command...> — passes when the command exits 0.
assert() { label="$1"; shift; if "$@"; then ok "$label"; else bad "$label"; fi; }
refute() { label="$1"; shift; if "$@"; then bad "$label"; else ok "$label"; fi; }

# Platform asset name, matching install.sh's detect_platform.
case "$(uname -s)" in
	Darwin) PLATFORM=darwin ;;
	Linux) PLATFORM=linux ;;
	*) echo "unsupported OS for this test"; exit 2 ;;
esac
case "$(uname -m)" in
	x86_64 | amd64) ARCH=amd64 ;;
	arm64 | aarch64) ARCH=arm64 ;;
	*) echo "unsupported arch for this test"; exit 2 ;;
esac
ASSET="panda-$PLATFORM-$ARCH"

[ -x ./panda ] || { echo "missing ./panda — run: make build"; exit 2; }

# Sandbox + cleanup. We kill only listeners on :8088 that appear during the run,
# never a panda you already had running.
SANDBOX="$(mktemp -d)"
listeners() { lsof -nP -iTCP:"$PORT" -sTCP:LISTEN -t 2>/dev/null | sort -u; }
PRE_LISTENERS="$(listeners | tr '\n' ' ')"

cleanup() {
	for pid in $(listeners); do
		case " $PRE_LISTENERS " in
			*" $pid "*) : ;;            # was already running before the tests
			*) kill "$pid" 2>/dev/null || true ;;
		esac
	done
	rm -rf "$SANDBOX"
}
trap cleanup EXIT INT TERM

reachable() { curl -fs -o /dev/null "$URL" 2>/dev/null; }

# run_install <case-name> [extra env=val ...] — runs install.sh in a fresh
# isolated HOME, never auto-starting a login service or opening a browser.
# Sets CASE_DIR, CASE_HOME, CASE_DATA, CASE_BIN for follow-up assertions.
run_install() {
	name="$1"; shift
	CASE_DIR="$SANDBOX/$name"
	CASE_HOME="$CASE_DIR/home"
	CASE_DATA="$CASE_DIR/data"
	CASE_BIN="$CASE_DIR/bin"
	mkdir -p "$CASE_HOME"
	env -i \
		PATH="$PATH" HOME="$CASE_HOME" SHELL=/bin/sh \
		PANDA_LOCAL=1 PANDA_AUTOSTART=0 PANDA_OPEN=0 \
		PANDA_DATA="$CASE_DATA" PANDA_BIN_DIR="$CASE_BIN" \
		"$@" \
		sh "$ROOT/install.sh" >"$CASE_DIR.log" 2>&1
}

# ---------------------------------------------------------------------------
head "install.sh parses (sh -n)"
assert "install.sh is valid POSIX sh" sh -n install.sh

# ---------------------------------------------------------------------------
head "local install (PANDA_LOCAL=1)"
if run_install local; then
	ok "installer exits 0"
else
	bad "installer exits 0"; cat "$SANDBOX/local.log" || true
fi
assert "panda command installed to BIN_DIR" test -x "$CASE_BIN/panda"
assert "data folder created"                test -d "$CASE_DATA"
assert "extension exported"                 test -f "$CASE_DATA/extension/manifest.json"
assert "server reachable at /screenshot"    reachable
assert "/api/screenshots returns JSON" sh -c \
	'curl -fs http://localhost:'"$PORT"'/api/screenshots | grep -q "\"screenshots\""'

# ---------------------------------------------------------------------------
head "re-run upgrades in place (idempotent)"
if run_install local-again; then ok "second run exits 0"; else bad "second run exits 0"; fi
assert "still reachable after re-run" reachable

# ---------------------------------------------------------------------------
head "data-folder override + ~ expansion"
# PANDA_DATA wins over the prompt; a leading ~ resolves against HOME.
CASE_DIR="$SANDBOX/tilde"; CASE_HOME="$CASE_DIR/home"; mkdir -p "$CASE_HOME"
env -i PATH="$PATH" HOME="$CASE_HOME" SHELL=/bin/sh \
	PANDA_LOCAL=1 PANDA_AUTOSTART=0 PANDA_OPEN=0 \
	PANDA_DATA="~/pandadata" PANDA_BIN_DIR="$CASE_DIR/bin" \
	sh "$ROOT/install.sh" >"$CASE_DIR.log" 2>&1 || true
assert "~ expanded to \$HOME/pandadata" test -d "$CASE_HOME/pandadata"

# ---------------------------------------------------------------------------
head "custom BIN_DIR leaves shell rc files untouched"
# MANAGE_RC=0 when PANDA_BIN_DIR is set: no rc file should be written.
refute ".zshrc not created in sandbox HOME" test -f "$SANDBOX/local/home/.zshrc"

# ---------------------------------------------------------------------------
head "remote download path (file:// release base)"
if [ -f "dist/$ASSET" ]; then
	CASE_DIR="$SANDBOX/remote"; CASE_HOME="$CASE_DIR/home"; mkdir -p "$CASE_HOME"
	if env -i PATH="$PATH" HOME="$CASE_HOME" SHELL=/bin/sh \
		PANDA_AUTOSTART=0 PANDA_OPEN=0 PANDA_FORCE_REMOTE=1 \
		PANDA_RELEASE_BASE="file://$ROOT/dist" \
		PANDA_DATA="$CASE_DIR/data" PANDA_BIN_DIR="$CASE_DIR/bin" \
		sh "$ROOT/install.sh" >"$CASE_DIR.log" 2>&1
	then ok "remote-mode install exits 0"; else bad "remote-mode install exits 0"; cat "$CASE_DIR.log" || true; fi
	assert "downloaded binary installed" test -x "$CASE_DIR/bin/panda"
else
	note "skipped: dist/$ASSET missing (run: make release)"
fi

# ---------------------------------------------------------------------------
head "missing release asset fails loudly"
# An empty release base must make the installer exit non-zero, not silently
# install nothing — this is the failure mode behind a binary-less release.
EMPTY="$SANDBOX/empty-release"; mkdir -p "$EMPTY"
CASE_DIR="$SANDBOX/missing"; CASE_HOME="$CASE_DIR/home"; mkdir -p "$CASE_HOME"
refute "installer exits non-zero on 404 asset" \
	env -i PATH="$PATH" HOME="$CASE_HOME" SHELL=/bin/sh \
		PANDA_AUTOSTART=0 PANDA_OPEN=0 PANDA_FORCE_REMOTE=1 \
		PANDA_RELEASE_BASE="file://$EMPTY" \
		PANDA_DATA="$CASE_DIR/data" PANDA_BIN_DIR="$CASE_DIR/bin" \
		sh "$ROOT/install.sh"

# ---------------------------------------------------------------------------
printf '\n\033[1m%d passed, %d failed\033[0m\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
