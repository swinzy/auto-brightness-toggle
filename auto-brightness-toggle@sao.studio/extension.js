/* extension.js
 * Application: GNOME Extension - Auto Brightness Toggle
 * Author: Stephen Zhang
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

import Gio from "gi://Gio";
import GLib from 'gi://GLib';
import GObject from "gi://GObject";
import St from "gi://St";
import * as Main from "resource:///org/gnome/shell/ui/main.js";
import * as QuickSettings from "resource:///org/gnome/shell/ui/quickSettings.js";
import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";

const SCHEMA = "org.gnome.settings-daemon.plugins.power";
const KEY = "ambient-enabled";
const PREFS_SCHEMA = "org.gnome.shell.extensions.auto-brightness-toggle";
const SYSTEM_BT_SLIDER_KEY = "override-system-brightness-slider";
const SHOW_QUICK_SETTINGS_KEY = "show-in-quick-settings";
const AUTO_INIT_BT_KEY = "auto-initial-brightness";

const FIND_SYS_BT_SLIDER_TIMEOUT = 1000;
const FIND_SYS_BT_SLIDER_MAX_RETRY = 10;
const INIT_AB_TIMEOUT = 3000;

// This is generated from "Icon Library"
const AUTO_ICON_SVG = "icons/auto-brightness-symbolic.svg";

// You can use `journalctl -f | grep '\[AutoBrightnessToggle\]'` to see realtime logs.
const EXT_LOG_NAME = "[AutoBrightnessToggle]";
const extLog = (msg) => {
    console.log(EXT_LOG_NAME, msg);
}

const AutoBrightnessToggle = GObject.registerClass(
    class AutoBrightnessToggle extends QuickSettings.QuickToggle {
        
        _init() {
            super._init({
                "title": "Auto Brightness",
                iconName: "display-brightness-symbolic", // Default logo
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
        _init(gicon) {
            super._init();
            let toggle = new AutoBrightnessToggle();
            // Custom logo
            toggle._icon.gicon = gicon;
            this.quickSettingsItems.push(toggle);
            Main.panel.statusArea.quickSettings.addExternalIndicator(this);
        }

        destroy() {
            this.quickSettingsItems.forEach(item => item.destroy());
            super.destroy();
        }
    });

export default class AutoBrightnessToggleExtension extends Extension {
    constructor(metadata) {
        super(metadata);
        this._indicator = null;
        this._prefsListener = [];
    }

    // TODO: This is NOT working as per my test
    // Check if the feature is supported on the system
    isAutoBrightnessSupported() {
        // Borrowed from diegonz/toggle-auto-brightness
        return Gio.Settings.list_schemas().indexOf(SCHEMA) != -1;
    }

    enable() {
        // If we can find brightness slider then enable now
        if (Main.panel.statusArea.quickSettings._brightness) {
            extLog("Brightness slider found.");
            this._enable();
        } else {
            extLog("Brightness slider not found. Waiting for it to appear...");
            let tries = 0;

            // Remove previous timer
            if (this._hBtSliderTimer) {
                GLib.source_remove(this._hBtSliderTimer);
                this._hBtSliderTimer = null;
            }

            // Set timer loop to try finding system brightness slider
            this._hBtSliderTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, FIND_SYS_BT_SLIDER_TIMEOUT, () => {
                // If too many retries
                if (tries >= FIND_SYS_BT_SLIDER_MAX_RETRY) {
                    extLog("Too many retries. Aborting.");
                    // TODO: For some reason this does not throw in my gnome-extensions app
                    throw new Error("Cannot find system brightness slider.");
                    return false;
                }

                // FOUND
                if (Main.panel.statusArea.quickSettings._brightness) {
                    extLog("Brightness slider found.");
                    this._enable();
                    return false;
                }

                // NOT FOUND
                extLog(`Brightness slider still not found. Retrying: (${tries}/${FIND_SYS_BT_SLIDER_MAX_RETRY})`);
                tries++;
                return true;
            });
        }
    }

    _enable() {
        // If auto brightness is not supported, throw error 
        if (!this.isAutoBrightnessSupported()) {
            throw new Error("Auto brightness is not supported on this system. \n" +
                "Visit https://github.com/swinzy/auto-brightness-toggle/wiki for more information.");
            return;
        }
        // Get the system brightness slider
        this._systemBtSlider = Main.panel.statusArea.quickSettings
            ._brightness.quickSettingsItems[0];

        // Backup system original icon
        this._backupGicon = this._systemBtSlider._icon.gicon; 

        // Load preferences
        this._settings = this.getSettings(PREFS_SCHEMA);
        
        // Disconnect all listeners if any
        while (this._prefsListener.length != 0) {
            this._settings.disconnect(this._prefsListener.pop());
        }
        
        // Get system auto brightnesss schema
        this._autoBrightnessSettings = new Gio.Settings({
            schema_id: SCHEMA,
        });

        // Get icon for this extension
        this._autoGicon = Gio.icon_new_for_string(`${this.path}/${AUTO_ICON_SVG}`);
 
        // Watch preferences changes
        this._prefsListener.push(this._settings.connect(`changed::${SYSTEM_BT_SLIDER_KEY}`, (settings, key) => {
            this.overrideSystemBrightnessSlider(settings.get_boolean(key));
        }));
        this._prefsListener.push(this._settings.connect(`changed::${SHOW_QUICK_SETTINGS_KEY}`, (settings, key) => {
            this.showInQuickSettings(settings.get_boolean(key));
        }));

        // Load preferences initially
        this.overrideSystemBrightnessSlider(this._settings.get_boolean(SYSTEM_BT_SLIDER_KEY));
        this.showInQuickSettings(this._settings.get_boolean(SHOW_QUICK_SETTINGS_KEY));

        if (this._hInitAbTimer) {
            clearTimeout(this._hInitAbTimer);
            this._hInitAbTimer = null;
        }
        // Perform initial auto brightness
        let isAbOn = this._autoBrightnessSettings.get_boolean(KEY); 
        if (!isAbOn) {
            let isInitAbOn = this._settings.get_boolean(AUTO_INIT_BT_KEY);
            if (isInitAbOn) {
                this._autoBrightnessSettings.set_boolean(KEY, true);
                this._hInitAbTimer = setTimeout(() => {
                    this._autoBrightnessSettings.set_boolean(KEY, false);
                    this._hInitAbTimer = null;
                }, INIT_AB_TIMEOUT);
            }
        }

        extLog("Extension activated.");
    }

    overrideSystemBrightnessSlider(enable) {
        if (enable) {
            // Set system brightness slider to be clickable and register click event
            this._systemBtSlider.icon_reactive = true;

            // Always keep only one event listener
            if (this._hBtSliderBtnClicked !== null) {
                // This should not produce an error even if the listener doesn't exist
                this._systemBtSlider.disconnect(this._hBtSliderBtnClicked);
            }
            this._hBtSliderBtnClicked = this._systemBtSlider.connect("icon-clicked", () => {
                let abEnabled = this._autoBrightnessSettings.get_boolean(KEY);
                this._autoBrightnessSettings.set_boolean(KEY, !abEnabled);
            })

            // Listen to auto brightness change and update icon
            if (this._hAbChanged != null) {
                this._autoBrightnessSettings.disconnect(this._hAbChanged);
            }
            this._hAbtSettingsChanged = this._autoBrightnessSettings.connect(`changed::${KEY}`, () => {
                let abEnabled = this._autoBrightnessSettings.get_boolean(KEY);
                this._systemBtSlider._icon.gicon = abEnabled ? this._autoGicon : this._backupGicon;
            });

            // Update icon once when the extension first start
            let abEnabled = this._autoBrightnessSettings.get_boolean(KEY);
            this._systemBtSlider._icon.gicon = abEnabled ? this._autoGicon : this._backupGicon;
        } else {
            // Revert changes and clean up "pointers"
            if (this._systemBtSlider !== undefined) {
                this._systemBtSlider.icon_reactive = false;
                this._systemBtSlider.disconnect(this._hBtSliderBtnClicked);
                this._systemBtSlider._icon.gicon = this._backupGicon;
            }
            this._hBtSliderBtnClicked = null;
            this._autoBrightnessSettings?.disconnect(this._hAbtSettingsChanged);
            this._hAbtSettingsChanged = null;
        }
    }

    showInQuickSettings(enable) {
        if (enable) {
            this._indicator = new AutoBrightnessIndicator(this._autoGicon);
        } else {
            this._indicator?.destroy();
            this._indicator = null;
        }
    }

    disable() {
        // Disconnect all listeners if any
        while (this._prefsListener.length != 0) {
            this._settings.disconnect(this._prefsListener.pop());
        }
        // If init ab timer ticking, stop & clear time and revert auto brightness settings
        if (this._hInitAbTimer) {
            clearTimeout(this._hInitAbTimer);
            this._autoBrightnessSettings.set_boolean(KEY, false);
            this._hInitAbTimer = null;
        }
        if (this._hBtSliderTimer) {
            GLib.source_remove(this._hBtSliderTimer);
            this._hBtSliderTimer = null;
        }
        this.showInQuickSettings(false);
        this.overrideSystemBrightnessSlider(false);
        this._settings = null;
        this._autoBrightnessSettings = null;
    }
}

