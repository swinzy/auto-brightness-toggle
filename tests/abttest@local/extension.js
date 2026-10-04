// SPDX-License-Identifier: GPL-2.0-or-later
// Test harness for Auto Brightness Toggle, used by tests/run.sh only. Drives the
// extension inside a headless GNOME Shell and writes the result to $ABT_TEST_DIR/done.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

const UUID = 'auto-brightness-toggle@sao.studio';
const PREFS_SCHEMA = 'org.gnome.shell.extensions.auto-brightness-toggle';
const ACTIVE = 1;

const log = msg => console.log(`ABTTEST: ${msg}`);
const sleep = ms => new Promise(resolve => GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
    resolve();
    return GLib.SOURCE_REMOVE;
}));

async function waitFor(what, fn, timeoutMs = 15000) {
    for (let t = 0; t < timeoutMs; t += 100) {
        if (fn())
            return;
        await sleep(100);
    }
    throw new Error(`timed out waiting for ${what}`);
}

export default class AbtTest extends Extension {
    enable() {
        // enable() can run twice if the shell rebases extensions; only start once
        if (globalThis.__abtTestStarted)
            return;
        globalThis.__abtTestStarted = true;
        this._run().then(
            () => this._finish('ok'),
            e => {
                log(`FAIL: ${e.message}`);
                this._finish(`fail: ${e.message}`);
            });
    }

    disable() {}

    _finish(result) {
        const dir = GLib.getenv('ABT_TEST_DIR');
        log(`RESULT ${result}`);
        if (dir)
            GLib.file_set_contents(`${dir}/done`, result);
    }

    _check(cond, msg) {
        if (!cond)
            throw new Error(msg);
        log(`pass: ${msg}`);
    }

    async _run() {
        const manager = Main.extensionManager;
        const ext = () => manager.lookup(UUID);
        const ambient = new Gio.Settings({schema_id: 'org.gnome.settings-daemon.plugins.power'});
        ambient.set_boolean('ambient-enabled', false);

        log(`GNOME Shell ${(await import('resource:///org/gnome/shell/misc/config.js')).PACKAGE_VERSION}`);
        await waitFor('extension active', () => ext()?.state === ACTIVE && ext().stateObj._systemBtSlider);
        const abt = ext().stateObj;
        const prefs = abt.getSettings(PREFS_SCHEMA);
        const slider = Main.panel.statusArea.quickSettings._brightness.quickSettingsItems[0];
        const menuToggles = () => Main.panel.statusArea.quickSettings.menu._grid.get_children()
            .filter(c => c.title === 'Auto Brightness');
        const isAutoIcon = () => slider._icon.gicon?.equal?.(abt._autoGicon) ?? false;

        this._check(abt._systemBtSlider === slider, 'extension holds the system brightness slider');
        this._check(slider.icon_reactive, 'slider icon is clickable when override is on');
        this._check(!isAutoIcon(), 'icon is the normal one while auto brightness is off');

        // Click the icon (the button's clicked signal is what the shell turns into icon-clicked)
        slider._iconButton.emit('clicked', 1);
        await sleep(300);
        this._check(ambient.get_boolean('ambient-enabled'), 'clicking the icon turns auto brightness on');
        this._check(isAutoIcon(), 'icon switches to the auto brightness icon');
        slider._iconButton.emit('clicked', 1);
        await sleep(300);
        this._check(!ambient.get_boolean('ambient-enabled'), 'clicking again turns auto brightness off');
        this._check(!isAutoIcon(), 'icon switches back');

        // Override preference off and on
        prefs.set_boolean('override-system-brightness-slider', false);
        await sleep(300);
        this._check(!slider.icon_reactive, 'override off: icon no longer clickable');
        slider.emit('icon-clicked');
        await sleep(300);
        this._check(!ambient.get_boolean('ambient-enabled'), 'override off: icon-clicked does not toggle');
        prefs.set_boolean('override-system-brightness-slider', true);
        await sleep(300);
        this._check(slider.icon_reactive, 'override on again: icon clickable');

        // Separate quick settings toggle
        prefs.set_boolean('show-in-quick-settings', true);
        await sleep(300);
        const toggle = abt._indicator?.quickSettingsItems[0];
        this._check(toggle && menuToggles().length === 1, 'quick settings toggle is added to the menu');
        ambient.set_boolean('ambient-enabled', true);
        await sleep(300);
        this._check(toggle.checked, 'quick settings toggle follows auto brightness');
        this._check(isAutoIcon(), 'slider icon follows auto brightness changed elsewhere');
        ambient.set_boolean('ambient-enabled', false);
        await sleep(300);
        prefs.set_boolean('show-in-quick-settings', false);
        await sleep(300);
        this._check(abt._indicator === null && menuToggles().length === 0, 'quick settings toggle is removed');

        // Disable: everything must be reverted and no listener may survive
        await manager.disableExtension(UUID);
        await waitFor('extension inactive', () => ext().state !== ACTIVE);
        await sleep(300);
        this._check(!slider.icon_reactive, 'disabled: icon no longer clickable');
        slider.emit('icon-clicked');
        ambient.set_boolean('ambient-enabled', true);
        await sleep(300);
        this._check(!isAutoIcon(), 'disabled: no leftover listener changes the icon');
        ambient.set_boolean('ambient-enabled', false);

        // Enable again
        await manager.enableExtension(UUID);
        await waitFor('extension active again', () => ext()?.state === ACTIVE && ext().stateObj._systemBtSlider);
        await sleep(300);
        this._check(slider.icon_reactive, 're-enabled: icon clickable again');
        prefs.reset('override-system-brightness-slider');
        prefs.reset('show-in-quick-settings');

        // Preferences window (runs in the separate org.gnome.Shell.Extensions process)
        manager.openExtensionPrefs(UUID, '', {});
        const prefsWindow = () => global.get_window_actors()
            .map(a => a.meta_window)
            .find(w => w.get_title() === 'Auto Brightness Toggle');
        await waitFor('preferences window', () => prefsWindow(), 20000);
        this._check(true, `preferences window opened (${prefsWindow().get_wm_class()})`);
    }
}
