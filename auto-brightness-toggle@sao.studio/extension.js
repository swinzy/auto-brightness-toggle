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

// iio-sensor-proxy, which GNOME uses to read the ambient light sensor
const SENSOR_PROXY_NAME = "net.hadess.SensorProxy";
const SENSOR_PROXY_PATH = "/net/hadess/SensorProxy";
// Worded as "not detected" rather than "not present": detection can be wrong
const NO_SENSOR_SUBTITLE = "No ambient sensor detected";

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

        setSensorDetected(detected) {
            this.subtitle = detected ? null : NO_SENSOR_SUBTITLE;
            this.reactive = detected;
        }
    });

// No indicator, only toggle button
var AutoBrightnessIndicator = GObject.registerClass(
    class AutoBrightnessIndicator extends QuickSettings.SystemIndicator {
        _init(gicon) {
            super._init();
            this._toggle = new AutoBrightnessToggle();
            // Custom logo
            this._toggle._icon.gicon = gicon;
            this.quickSettingsItems.push(this._toggle);
            Main.panel.statusArea.quickSettings.addExternalIndicator(this);
        }

        setSensorDetected(detected) {
            this._toggle.setSensorDetected(detected);
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
        this._sensorProxy = null;
        // null until the first check, so that first result is always logged
        this._sensorDetected = null;
    }

    // Same check GNOME Settings uses to show "Automatic Screen Brightness":
    // iio-sensor-proxy must be running and report an ambient light sensor
    isAutoBrightnessSupported() {
        return this._sensorProxy?.g_name_owner != null &&
            this._sensorProxy.get_cached_property("HasAmbientLight")?.unpack() === true;
    }

    _watchSensor() {
        this._sensorCancellable = new Gio.Cancellable();
        const proxy = new Gio.DBusProxy({
            g_bus_type: Gio.BusType.SYSTEM,
            g_name: SENSOR_PROXY_NAME,
            g_object_path: SENSOR_PROXY_PATH,
            g_interface_name: SENSOR_PROXY_NAME,
            // Like GNOME Settings, only watch the service and never start it
            g_flags: Gio.DBusProxyFlags.DO_NOT_AUTO_START,
        });
        proxy.init_async(GLib.PRIORITY_DEFAULT, this._sensorCancellable, (_proxy, result) => {
            try {
                proxy.init_finish(result);
            } catch (e) {
                if (!e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
                    extLog(`Cannot watch the ambient light sensor: ${e.message}`);
                return;
            }
            this._sensorProxy = proxy;
            // Follow iio-sensor-proxy starting or stopping and sensors being hotplugged
            this._hSensorOwner = proxy.connect("notify::g-name-owner", () => this._syncSensor());
            this._hSensorProps = proxy.connect("g-properties-changed", () => this._syncSensor());
            this._syncSensor();
        });
    }

    _unwatchSensor() {
        this._sensorCancellable?.cancel();
        this._sensorCancellable = null;
        if (this._sensorProxy) {
            this._sensorProxy.disconnect(this._hSensorOwner);
            this._sensorProxy.disconnect(this._hSensorProps);
            this._sensorProxy = null;
        }
        this._sensorDetected = null;
    }

    _syncSensor() {
        const detected = this.isAutoBrightnessSupported();
        if (detected !== this._sensorDetected) {
            this._sensorDetected = detected;
            extLog(detected
                ? "Ambient light sensor detected."
                : "No ambient light sensor detected. Leaving the system brightness slider unchanged.");
        }
        this._syncSystemBrightnessSlider();
        this._indicator?.setSensorDetected(detected);
    }

    _syncSystemBrightnessSlider() {
        this.overrideSystemBrightnessSlider(
            this._sensorDetected && this._settings.get_boolean(SYSTEM_BT_SLIDER_KEY));
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
                    // Throwing here would not reach the extension manager, as this runs outside enable()
                    extLog("Cannot find system brightness slider. Too many retries, aborting.");
                    this._hBtSliderTimer = null;
                    return false;
                }

                // FOUND
                if (Main.panel.statusArea.quickSettings._brightness) {
                    extLog("Brightness slider found.");
                    this._hBtSliderTimer = null;
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
        // Get the system brightness slider
        this._systemBtSlider = Main.panel.statusArea.quickSettings
            ._brightness.quickSettingsItems[0];

        // Backup system original icon
        this._backupGicon = this._systemBtSlider._icon.gicon; 

        // Disconnect listeners left on the previous settings object, if any
        this._disconnectPrefs();

        // Load preferences
        this._settings = this.getSettings(PREFS_SCHEMA);
        
        // Get system auto brightnesss schema
        this._autoBrightnessSettings = new Gio.Settings({
            schema_id: SCHEMA,
        });

        // Get icon for this extension
        this._autoGicon = Gio.icon_new_for_string(`${this.path}/${AUTO_ICON_SVG}`);
 
        // Watch preferences changes
        this._hOverridePrefChanged = this._settings.connect(`changed::${SYSTEM_BT_SLIDER_KEY}`, () => {
            this._syncSystemBrightnessSlider();
        });
        this._hShowPrefChanged = this._settings.connect(`changed::${SHOW_QUICK_SETTINGS_KEY}`, (settings, key) => {
            this.showInQuickSettings(settings.get_boolean(key));
        });

        // Load preferences initially. The slider is only taken over once a sensor is detected.
        this.showInQuickSettings(this._settings.get_boolean(SHOW_QUICK_SETTINGS_KEY));
        this._watchSensor();

        if (this._hInitAbTimer) {
            GLib.source_remove(this._hInitAbTimer);
            this._hInitAbTimer = null;
        }
        // Perform initial auto brightness
        let isAbOn = this._autoBrightnessSettings.get_boolean(KEY); 
        if (!isAbOn) {
            let isInitAbOn = this._settings.get_boolean(AUTO_INIT_BT_KEY);
            if (isInitAbOn) {
                this._autoBrightnessSettings.set_boolean(KEY, true);
                this._hInitAbTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, INIT_AB_TIMEOUT, () => {
                    this._autoBrightnessSettings.set_boolean(KEY, false);
                    this._hInitAbTimer = null;
                    return false;
                });
            }
        }

        extLog("Extension activated.");
    }

    overrideSystemBrightnessSlider(enable) {
        if (enable) {
            // Set system brightness slider to be clickable and register click event
            this._systemBtSlider.icon_reactive = true;

            // Always keep only one event listener
            // Handler is undefined on first enable; disconnecting it would trigger a GLib CRITICAL
            if (this._hBtSliderBtnClicked) {
                this._systemBtSlider.disconnect(this._hBtSliderBtnClicked);
            }
            this._hBtSliderBtnClicked = this._systemBtSlider.connect("icon-clicked", () => {
                let abEnabled = this._autoBrightnessSettings.get_boolean(KEY);
                this._autoBrightnessSettings.set_boolean(KEY, !abEnabled);
            })

            // Listen to auto brightness change and update icon
            if (this._hAbtSettingsChanged) {
                this._autoBrightnessSettings.disconnect(this._hAbtSettingsChanged);
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
                if (this._hBtSliderBtnClicked) {
                    this._systemBtSlider.disconnect(this._hBtSliderBtnClicked);
                }
                this._systemBtSlider._icon.gicon = this._backupGicon;
            }
            this._hBtSliderBtnClicked = null;
            if (this._hAbtSettingsChanged) {
                this._autoBrightnessSettings?.disconnect(this._hAbtSettingsChanged);
            }
            this._hAbtSettingsChanged = null;
        }
    }

    showInQuickSettings(enable) {
        if (enable) {
            if (!this._indicator) {
                this._indicator = new AutoBrightnessIndicator(this._autoGicon);
            }
            // No hint until the first check, so it does not flash up on systems with a sensor
            this._indicator.setSensorDetected(this._sensorDetected !== false);
        } else {
            this._indicator?.destroy();
            this._indicator = null;
        }
    }

    _disconnectPrefs() {
        if (this._hOverridePrefChanged) {
            this._settings.disconnect(this._hOverridePrefChanged);
            this._hOverridePrefChanged = null;
        }
        if (this._hShowPrefChanged) {
            this._settings.disconnect(this._hShowPrefChanged);
            this._hShowPrefChanged = null;
        }
    }

    disable() {
        this._disconnectPrefs();
        // If init ab timer ticking, stop & clear time and revert auto brightness settings
        if (this._hInitAbTimer) {
            GLib.source_remove(this._hInitAbTimer);
            this._autoBrightnessSettings.set_boolean(KEY, false);
            this._hInitAbTimer = null;
        }
        if (this._hBtSliderTimer) {
            GLib.source_remove(this._hBtSliderTimer);
            this._hBtSliderTimer = null;
        }
        this._unwatchSensor();
        this.showInQuickSettings(false);
        this.overrideSystemBrightnessSlider(false);
        this._settings = null;
        this._autoBrightnessSettings = null;
    }
}

