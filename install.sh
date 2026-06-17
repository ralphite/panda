#!/bin/sh
# Panda Screenshot installer (macOS / Linux).
#
# Hosted use (later):   curl -fsSL https://.../install.sh | sh
# Local use (now):      ./install.sh          (run from the repo, uses ./panda)
#
# Non-interactive overrides (also used for `curl | sh` without a tty):
#   PANDA_DATA=<dir>        data directory          (default: ~/panda)
#   PANDA_AUTOSTART=1|0     start at login + restart on crash
#   PANDA_BIN_DIR=<dir>     where to install panda  (default: ~/.local/bin)
#   PANDA_OPEN=1|0          open the browser        (default: 1)
#   PANDA_LOCAL=1           force local mode (copy ./panda instead of download)
set -eu

LABEL="com.panda.app"
PORT=8088
URL="http://localhost:${PORT}/screenshot"
BIN_DIR="${PANDA_BIN_DIR:-$HOME/.local/bin}"
BIN="$BIN_DIR/panda"
DEFAULT_DATA="$HOME/panda"
RELEASE_BASE="${PANDA_RELEASE_BASE:-https://github.com/ralphite/panda/releases/latest/download}"
# Skip touching shell rc files when the caller set a custom install dir.
MANAGE_RC=1
[ -n "${PANDA_BIN_DIR:-}" ] && MANAGE_RC=0

say()  { printf '\033[1;36m==>\033[0m %s\n' "$1"; }
warn() { printf '\033[1;33mwarning:\033[0m %s\n' "$1" >&2; }
die()  { printf '\033[1;31merror:\033[0m %s\n' "$1" >&2; exit 1; }

# ask VAR "prompt" "default" — reads from the terminal, falling back to default
# (so `curl | sh`, where stdin is the script, does not hang or read garbage).
ask() {
	__ans=""
	if [ -r /dev/tty ]; then
		printf '%s' "$2" > /dev/tty
		IFS= read -r __ans < /dev/tty || __ans=""
	fi
	[ -z "$__ans" ] && __ans="$3"
	eval "$1=\$__ans"
}

ask_yes_no() { # prompt; returns 0 for yes, default no
	__a=""
	if [ -r /dev/tty ]; then
		printf '%s' "$1" > /dev/tty
		IFS= read -r __a < /dev/tty || __a=""
	fi
	case "$__a" in y | Y | yes | YES) return 0 ;; *) return 1 ;; esac
}

add_line_once() { # file line
	[ -f "$1" ] || : > "$1"
	grep -qF "$2" "$1" 2>/dev/null || printf '\n%s\n' "$2" >> "$1"
}

shell_rc() {
	case "$(basename "${SHELL:-sh}")" in
		zsh) echo "$HOME/.zshrc" ;;
		bash) [ "$PLATFORM" = darwin ] && echo "$HOME/.bash_profile" || echo "$HOME/.bashrc" ;;
		*) echo "$HOME/.profile" ;;
	esac
}

detect_platform() {
	case "$(uname -s)" in
		Darwin) PLATFORM=darwin ;;
		Linux) PLATFORM=linux ;;
		*) die "unsupported OS '$(uname -s)' — Windows uses install.ps1" ;;
	esac
	case "$(uname -m)" in
		x86_64 | amd64) ARCH=amd64 ;;
		arm64 | aarch64) ARCH=arm64 ;;
		*) die "unsupported architecture '$(uname -m)'" ;;
	esac
}

# Sets BIN_SRC to the binary to install. Local mode copies ./panda (repo
# checkout); otherwise the matching build is downloaded from the releases.
obtain_binary() {
	if [ "${PANDA_FORCE_REMOTE:-}" != "1" ] && { [ "${PANDA_LOCAL:-}" = "1" ] || [ -x "./panda" ]; }; then
		[ -x "./panda" ] || die "local mode needs a built ./panda — run: make build"
		BIN_SRC="$(pwd)/panda"
		say "Using local binary: $BIN_SRC ($PLATFORM/$ARCH)"
		return
	fi
	asset="panda-${PLATFORM}-${ARCH}"
	BIN_SRC="$(mktemp)"
	say "Downloading $asset from $RELEASE_BASE ..."
	curl -fsSL "$RELEASE_BASE/$asset" -o "$BIN_SRC" || die "download failed: $RELEASE_BASE/$asset"
	chmod +x "$BIN_SRC"
}

main() {
	command -v curl >/dev/null 2>&1 || die "curl is required"
	detect_platform
	obtain_binary

	# 1. Data directory.
	if [ -n "${PANDA_DATA:-}" ]; then
		DATA="$PANDA_DATA"
	else
		ask DATA "Data folder [$DEFAULT_DATA]: " "$DEFAULT_DATA"
	fi
	# Expand a literal leading ~ that the user typed or passed via PANDA_DATA.
	# The quoted "~/" are literal match/strip patterns, not paths to expand.
	# shellcheck disable=SC2088
	case "$DATA" in
		"~") DATA="$HOME" ;;
		"~/"*) DATA="$HOME/${DATA#"~/"}" ;;
	esac
	mkdir -p "$DATA"
	say "Data folder: $DATA"

	# 2. Install the panda command onto PATH.
	mkdir -p "$BIN_DIR"
	cp "$BIN_SRC" "$BIN.tmp"
	chmod +x "$BIN.tmp"
	mv "$BIN.tmp" "$BIN" # atomic replace, safe even if panda is running
	say "Installed: $BIN"

	case ":$PATH:" in
		*":$BIN_DIR:"*) ;;
		*)
			if [ "$MANAGE_RC" = 1 ]; then
				RC="$(shell_rc)"
				add_line_once "$RC" "export PATH=\"$BIN_DIR:\$PATH\""
				warn "$BIN_DIR was added to PATH in $RC — open a new terminal or 'source $RC'."
			else
				warn "$BIN_DIR is not on PATH; add it to run 'panda' directly."
			fi
			;;
	esac

	# Persist a non-default data dir so a bare `panda` in the terminal finds it.
	if [ "$MANAGE_RC" = 1 ] && [ "$DATA" != "$DEFAULT_DATA" ]; then
		add_line_once "$(shell_rc)" "export PANDA_DATA=\"$DATA\""
	fi

	# 2b. Drop the Chrome extension into the data folder for "Load unpacked".
	EXT_DIR="$DATA/extension"
	"$BIN" -export-extension "$EXT_DIR"
	say "Chrome extension: $EXT_DIR"

	# 3. Optional auto-start at login + restart on crash.
	if [ -n "${PANDA_AUTOSTART:-}" ]; then
		case "$PANDA_AUTOSTART" in 1 | y | Y | yes) AUTOSTART=1 ;; *) AUTOSTART=0 ;; esac
	elif ask_yes_no "Auto-start panda at login and restart it if it crashes? [y/N]: "; then
		AUTOSTART=1
	else
		AUTOSTART=0
	fi

	SERVICE_STARTED=0
	if [ "$AUTOSTART" = 1 ]; then
		if [ "$PLATFORM" = darwin ]; then
			setup_launchd && SERVICE_STARTED=1
		elif command -v systemctl >/dev/null 2>&1; then
			setup_systemd && SERVICE_STARTED=1
		else
			warn "no systemd --user found; skipping auto-start."
		fi
	fi

	# 4. Make sure it is running, then open the browser.
	if curl -fs -o /dev/null "$URL" 2>/dev/null; then
		say "panda already running at $URL"
	elif [ "$SERVICE_STARTED" = 1 ]; then
		say "Started panda via the system service manager."
	else
		say "Starting panda in the background..."
		nohup "$BIN" -data "$DATA" >> "$DATA/panda.log" 2>&1 &
	fi

	if wait_for_server; then
		[ "${PANDA_OPEN:-1}" = 1 ] && open_url "$URL"
		summary
	else
		die "panda did not become reachable at $URL — see $DATA/panda.log"
	fi
}

setup_launchd() {
	plist="$HOME/Library/LaunchAgents/$LABEL.plist"
	mkdir -p "$HOME/Library/LaunchAgents"
	cat > "$plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>Label</key><string>$LABEL</string>
	<key>ProgramArguments</key>
	<array>
		<string>$BIN</string>
		<string>-data</string><string>$DATA</string>
	</array>
	<key>RunAtLoad</key><true/>
	<key>KeepAlive</key><true/>
	<key>StandardOutPath</key><string>$DATA/panda.log</string>
	<key>StandardErrorPath</key><string>$DATA/panda.log</string>
</dict>
</plist>
EOF
	uid="$(id -u)"
	launchctl bootout "gui/$uid/$LABEL" 2>/dev/null || true
	launchctl bootstrap "gui/$uid" "$plist"
	launchctl kickstart -k "gui/$uid/$LABEL"
	say "Installed launchd agent: $plist"
}

setup_systemd() {
	unit_dir="$HOME/.config/systemd/user"
	mkdir -p "$unit_dir"
	cat > "$unit_dir/panda.service" <<EOF
[Unit]
Description=Panda Screenshot
After=network.target

[Service]
ExecStart=$BIN -data $DATA
Restart=always
RestartSec=2

[Install]
WantedBy=default.target
EOF
	systemctl --user daemon-reload
	systemctl --user enable --now panda.service
	loginctl enable-linger "$(id -un)" 2>/dev/null || true
	say "Installed systemd user service: $unit_dir/panda.service"
}

wait_for_server() {
	i=0
	while [ "$i" -lt 50 ]; do
		curl -fs -o /dev/null "$URL" 2>/dev/null && return 0
		sleep 0.2
		i=$((i + 1))
	done
	return 1
}

open_url() {
	if command -v open >/dev/null 2>&1; then
		open "$1"
	elif command -v xdg-open >/dev/null 2>&1; then
		xdg-open "$1" >/dev/null 2>&1 &
	else
		say "Open $1 in your browser."
	fi
}

summary() {
	echo
	say "Panda is ready."
	echo "  URL:        $URL"
	echo "  Command:    $BIN  (run 'panda' once PATH is reloaded)"
	echo "  Data:       $DATA"
	if [ "$AUTOSTART" = 1 ]; then
		echo "  Auto-start: on (restarts on crash and at login)"
	else
		echo "  Auto-start: off — run 'panda' to start it again"
	fi
	echo
	say "Last step — load the Chrome extension so you can capture screenshots:"
	echo "    1. Open     chrome://extensions"
	echo "    2. Turn on  Developer mode   (toggle, top-right)"
	echo "    3. Click    Load unpacked"
	echo "    4. Choose   $EXT_DIR"
}

main "$@"
