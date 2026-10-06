#!/bin/bash
# Runs the extension in an isolated headless GNOME Shell and drives it with
# tests/abttest@local. Needs no graphical session (works over SSH) and does not
# touch the user's real settings: HOME, XDG dirs and the session bus are all
# temporary, and a fake systemctl stops anything from rebooting or powering off.
#
# The system bus is replaced by a private one too, where tests/mock-sensor-proxy.js
# plays iio-sensor-proxy so the ambient light sensor can come and go.
#
# Needs gnome-shell, dbus-daemon, dbus-run-session, gsettings, glib-compile-schemas,
# gjs and msgfmt (gettext, to compile translations).
#
# Usage: tests/run.sh [extension dir]   (defaults to tools/build.sh output for this repo)
# LANG is passed through to the shell. Set ABT_EXPECT_TRANSLATED=1 with a LANG the
# extension has a translation for, e.g. LANG=zh_CN.UTF-8 ABT_EXPECT_TRANSLATED=1 tests/run.sh
# Exit status is 0 if all checks pass and no GLib/GJS criticals were logged
# before the shell started shutting down.
set -u

TESTS=$(cd "$(dirname "$0")" && pwd)
REPO=$(dirname "$TESTS")
UUID=auto-brightness-toggle@sao.studio
TIMEOUT=90

T=$(mktemp -d "${TMPDIR:-/tmp}/abt-test.XXXXXX")
mkdir -p "$T"/{home,config,data/gnome-shell/extensions,cache}
if [ $# -gt 0 ]; then
    cp -r "$(cd "$1" && pwd)" "$T/data/gnome-shell/extensions/$UUID"
else
    # Install what would be packed, including compiled translations
    "$REPO/tools/build.sh" "$T/data/gnome-shell/extensions" || { echo "RESULT: build failed"; exit 1; }
fi
glib-compile-schemas "$T/data/gnome-shell/extensions/$UUID/schemas"
cp -r "$TESTS/abttest@local" "$T/data/gnome-shell/extensions/"

export HOME=$T/home XDG_CONFIG_HOME=$T/config XDG_DATA_HOME=$T/data XDG_CACHE_HOME=$T/cache
export ABT_TEST_DIR=$T ABT_TESTS=$TESTS PATH=$TESTS/bin:$PATH TIMEOUT UUID
unset DBUS_SESSION_BUS_ADDRESS DISPLAY WAYLAND_DISPLAY

# Private stand-in for the system bus, so the test controls what "iio-sensor-proxy" reports.
# Its socket goes in /tmp because $T can be longer than a socket path may be.
{ read -r DBUS_SYSTEM_BUS_ADDRESS; read -r SYSTEM_BUS_PID; } < <(
    dbus-daemon --session --address=unix:tmpdir=/tmp --fork --print-address=1 --print-pid=1)
[ -n "$DBUS_SYSTEM_BUS_ADDRESS" ] || { echo "RESULT: cannot start the private system bus"; exit 1; }
export DBUS_SYSTEM_BUS_ADDRESS

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
kill "$SYSTEM_BUS_PID" 2>/dev/null

# Some GNOME versions log criticals from their own UI while shutting down; ignore those
sed '/Shutting down GNOME Shell/q' "$T/shell.log" > "$T/run.log"

grep -aE "ABTTEST:|JS ERROR|AutoBrightness|CRITICAL|$UUID" "$T/run.log" | sed -E "s/^.*ABTTEST: //"
RESULT=$(cat "$T/done" 2>/dev/null || echo "no result (timeout or crash)")
# The private system bus has no logind, which the shell's own user menu complains about
CRITICALS=$(grep -a CRITICAL "$T/run.log" | grep -vc "Could not get a proxy for user")
echo "RESULT: $RESULT ($CRITICALS criticals)"
echo "Full log: $T/shell.log"
[ "$RESULT" = ok ] && [ "$CRITICALS" -eq 0 ]
