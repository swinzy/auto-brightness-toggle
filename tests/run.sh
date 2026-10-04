#!/bin/bash
# Runs the extension in an isolated headless GNOME Shell and drives it with
# tests/abttest@local. Needs no graphical session (works over SSH) and does not
# touch the user's real settings: HOME, XDG dirs and the session bus are all
# temporary, and a fake systemctl stops anything from rebooting or powering off.
#
# Needs gnome-shell, dbus-run-session, gsettings, glib-compile-schemas and, for
# the preferences window check, gjs.
#
# Usage: tests/run.sh [extension dir]   (defaults to the one in this repo)
# Exit status is 0 if all checks pass and no GLib/GJS criticals were logged
# before the shell started shutting down.
set -u

TESTS=$(cd "$(dirname "$0")" && pwd)
REPO=$(dirname "$TESTS")
UUID=auto-brightness-toggle@sao.studio
EXT=$(cd "${1:-$REPO/$UUID}" && pwd)
TIMEOUT=90

T=$(mktemp -d "${TMPDIR:-/tmp}/abt-test.XXXXXX")
mkdir -p "$T"/{home,config,data/gnome-shell/extensions,cache}
cp -r "$EXT" "$T/data/gnome-shell/extensions/$UUID"
glib-compile-schemas "$T/data/gnome-shell/extensions/$UUID/schemas"
cp -r "$TESTS/abttest@local" "$T/data/gnome-shell/extensions/"

export HOME=$T/home XDG_CONFIG_HOME=$T/config XDG_DATA_HOME=$T/data XDG_CACHE_HOME=$T/cache
export ABT_TEST_DIR=$T PATH=$TESTS/bin:$PATH TIMEOUT UUID
unset DBUS_SESSION_BUS_ADDRESS DISPLAY WAYLAND_DISPLAY

dbus-run-session -- bash -c '
    # Test harness first, so disabling the extension under test does not reload it
    gsettings set org.gnome.shell enabled-extensions "[\"abttest@local\", \"$UUID\"]"
    gsettings set org.gnome.shell welcome-dialog-last-shown-version "999"
    # D-Bus activated services (e.g. the preferences process) need the display,
    # and not every distro exports it to the activation environment
    dbus-update-activation-environment WAYLAND_DISPLAY=abt-test-0 2>/dev/null
    gnome-shell --headless --wayland --no-x11 --wayland-display=abt-test-0 \
        --virtual-monitor 1280x800 > "$ABT_TEST_DIR/shell.log" 2>&1 &
    pid=$!
    for _ in $(seq 1 "$TIMEOUT"); do
        [ -f "$ABT_TEST_DIR/done" ] && break
        kill -0 "$pid" 2>/dev/null || break
        sleep 1
    done
    kill "$pid" 2>/dev/null
    wait "$pid" 2>/dev/null
' > /dev/null 2>&1

# Some GNOME versions log criticals from their own UI while shutting down; ignore those
sed '/Shutting down GNOME Shell/q' "$T/shell.log" > "$T/run.log"

grep -aE "ABTTEST:|JS ERROR|AutoBrightness|CRITICAL|$UUID" "$T/run.log" | sed -E "s/^.*ABTTEST: //"
RESULT=$(cat "$T/done" 2>/dev/null || echo "no result (timeout or crash)")
CRITICALS=$(grep -ac CRITICAL "$T/run.log")
echo "RESULT: $RESULT ($CRITICALS criticals)"
echo "Full log: $T/shell.log"
[ "$RESULT" = ok ] && [ "$CRITICALS" -eq 0 ]
