/* extension.js
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

const {Gio, GObject} = imports.gi;

const QuickSettings = imports.ui.quickSettings;
const QuickSettingsMenu = imports.ui.main.panel.statusArea.quickSettings;

const SCHEMA = "org.gnome.settings-daemon.plugins.power";
const KEY = "ambient-enabled";

let indicator = null;

function init() { }

function enable() {
    indicator = new AutoBrightnessIndicator();

    // If auto brightness is not supported, make the toggle grey out
    /* Note:
     * I'm not sure if greying out is a good idea.
     * From the perspective of GNOME itself, for example, when Wi-Fi hardware
     * is not available, Wi-Fi toggle will not show in quick settings (rather
     * than greying out).
     * However, from UX perspective, not showing any option may confuse users
     * i.e. they may wonder if the extension itself is not working rather than
     * thinking of system compatibility because there is no direct cue for it.
     */ 
    if (!isAutoBrightnessSupported()) {
        log("Auto brightness is not supported on this system. Toggle is disabled.");
        indicator.set_enable(false);
    }


}

function disable() {
    if (indicator) {
        indicator.destroy();
        indicator = null;
    }
}

const AutoBrightnessToggle = GObject.registerClass(
    class AutoBrightnessToggle extends QuickSettings.QuickToggle {
        
        _init() {
            super._init({
                label: "Auto Brightness",
                iconName: "display-brightness-symbolic",
                toggleMode: true,
            });
          
            // Binding the toggle to the GSettings key
            this._settings = new Gio.Settings({
                schema_id: SCHEMA,
            });
            this._settings.bind(KEY,
                this, "checked",
                Gio.SettingsBindFlags.DEFAULT);
        }
    });

// No indicator, only toggle button
var AutoBrightnessIndicator = GObject.registerClass(
    class AutoBrightnessIndicator extends QuickSettings.SystemIndicator {
        _init() {
            super._init();
        
            this.quickSettingsItems.push(new AutoBrightnessToggle());
            QuickSettingsMenu._indicators.add_child(this);
            QuickSettingsMenu._addItems(this.quickSettingsItems);
        }

        destroy() {
            this.quickSettingsItems.forEach(item => item.destroy());
            super.destroy();
        }

        // Grey out/ungrey the toggle button
        set_enable(enable) {
            this.quickSettingsItems.forEach(item => item.set_reactive(enable));
        }
    });

// Check if the feature is supported on the system
function isAutoBrightnessSupported() {
    // Borrowed from diegonz/toggle-auto-brightness
    return Gio.Settings.list_schemas().indexOf(SCHEMA) != -1;
}
