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

import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import St from "gi://St";
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as QuickSettings from 'resource:///org/gnome/shell/ui/quickSettings.js';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

const SCHEMA = "org.gnome.settings-daemon.plugins.power";
const KEY = "ambient-enabled";

const AUTO_ICON_SVG = "icons/auto-brightness-symbolic.svg"

const EXT_LOG_NAME = "[AutoBrightnessToggle]"
const extLog = (msg) => {
    log(EXT_LOG_NAME, msg);
}

const AutoBrightnessToggle = GObject.registerClass(
    class AutoBrightnessToggle extends QuickSettings.QuickToggle {
        
        _init() {
            super._init({
                'title': "Auto Brightness",
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
            Main.panel.statusArea.quickSettings.addExternalIndicator(this);
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

export default class AutoBrightnessToggleExtension extends Extension {
    constructor(metadata) {
        super(metadata);
        this._indicator = null;
        this._autoBrightnessSettings = new Gio.Settings({
            schema_id: SCHEMA,
        });
        this._autoGicon = Gio.icon_new_for_string(`${this.path}/${AUTO_ICON_SVG}`);
    }

    // Check if the feature is supported on the system
    isAutoBrightnessSupported() {
        // Borrowed from diegonz/toggle-auto-brightness
        return Gio.Settings.list_schemas().indexOf(SCHEMA) != -1;
    }

    enable() {
        this._indicator = new AutoBrightnessIndicator(); 

        // Get the system brightness slider
        this._systemBtSlider = Main.panel.statusArea.quickSettings
            ._brightness.quickSettingsItems[0];
        
        // Backup system original icon
        this._backupGicon = this._systemBtSlider._icon.gicon; 

        // Set system brightness slider to be clickable and register click event
        this._systemBtSlider.icon_reactive = true;

        // Always keep only one event listener
        if (this._hBtSliderBtn != null) {
            // This should not produce an error even if the listener doesn't exist
            this._systemBtSlider.disconnect(this._hBtSliderBtn);
        }
        this._hBtSliderBtnClicked = this._systemBtSlider.connect("icon-clicked", () => {
            let abEnabled = this._autoBrightnessSettings.get_boolean(KEY);
            this._autoBrightnessSettings.set_boolean(KEY, !abEnabled);
        })
        
        // Listen to auto brightness change and update icon
        if (this._hAbChanged != null) {
            this._autoBrightnessSettings.disconnect(this._hAbChanged);
        }
        this._hAbChanged = this._autoBrightnessSettings.connect(`changed::${KEY}`, () => {
            let abEnabled = this._autoBrightnessSettings.get_boolean(KEY);
            this._systemBtSlider._icon.gicon = abEnabled ? this._autoGicon : this._backupGicon;
        });
        
        // Update icon once when the exrension first start
        let abEnabled = this._autoBrightnessSettings.get_boolean(KEY);
        this._systemBtSlider._icon.gicon = abEnabled ? this._autoGicon : this._backupGicon;

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
        if (!this.isAutoBrightnessSupported()) {
            throw new Error("Auto brightness is not supported on this system. \n" +
                "Visit https://github.com/m1nicrusher/auto-brightness-toggle/wiki for more information.");
            log("Auto brightness is not supported on this system. Toggle is disabled.");
            this._indicator.set_enable(false);
        }
        extLog("Extension activated.");
    }

    disable() {
        this._systemBtSlider.icon_reactive = false;
        this._systemBtSlider.disconnect(this._hBtSliderBtn);
        this._systemBtSlider._icon.gicon = this._backupGicon;
        this._hBtSliderBtn = null;
        this._autoBrightnessSettings.disconnect(this._hAbChanged);
        this._hAbChanged = null;
        log("[EXTENSION_LOG]", "Disconnected", this._hBtSliderBtn);
        if (this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }
    }
}
