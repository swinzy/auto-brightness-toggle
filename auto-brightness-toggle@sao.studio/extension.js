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

const SCHEMA = 'org.gnome.settings-daemon.plugins.power';
const KEY = 'ambient-enabled';

let indicator = null;

function init() { }

function enable() {
    indicator = new AutoBrightnessIndicator();
}

function disable() {
    indicator.destroy();
    indicator = null;
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
    });
        