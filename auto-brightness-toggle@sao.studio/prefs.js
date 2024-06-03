import Gio from "gi://Gio";
import Adw from "gi://Adw";
import Gtk from "gi://Gtk?version=4.0";

import {ExtensionPreferences, gettext as _} from "resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js";

Gtk.init();

export default class AutoBrightnessTogglePreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {

        const page = new Adw.PreferencesPage({
            title: _("Preferences"),
        });
        window.add(page);

        const behaviourGroup = new Adw.PreferencesGroup({
            title: _("Behaviour"),
            description: _("Configure where to show the auto brightness toggle."),
        });
        page.add(behaviourGroup);

        // Add toggles
        const overrideSystemSliderRow = new Adw.SwitchRow({
            title: _("Override System Brightness Slider"),
            subtitle: _("Toggle auto brightness by clicking the icon of " +
                "the brightness slider."),
        });
        behaviourGroup.add(overrideSystemSliderRow);

        const showQuickSettingsRow = new Adw.SwitchRow({
            title: _("Show in Quick Settings"),
            subtitle: _("Add a new \"Auto Brightness\" toggle " + 
                "in the quick settings."),
        });
        behaviourGroup.add(showQuickSettingsRow);
        
        const linkGroup = new Adw.PreferencesGroup();
        page.add(linkGroup);

        const linkBox = new Gtk.Box({ 
            orientation: Gtk.Orientation.HORIZONTAL,
            halign: Gtk.Align.CENTER,
            margin_top: 5,
        });
        linkGroup.add(linkBox);

        const githubLink = new Gtk.LinkButton({
            label: "Github",
            uri: "https://github.com/m1nicrusher/auto-brightness-toggle",
        });
        linkBox.append(githubLink);

        const reportLink = new Gtk.LinkButton({
            label: "Report Bugs",
            uri: "https://github.com/m1nicrusher/auto-brightness-toggle/issues",
        });
        linkBox.append(reportLink);

        // Binding gsettings to toggles
        window._settings = this.getSettings();
        window._settings.bind("override-system-brightness-slider", overrideSystemSliderRow, 
            "active", Gio.SettingsBindFlags.DEFAULT);
        window._settings.bind("show-in-quick-settings", showQuickSettingsRow,
            "active", Gio.SettingsBindFlags.DEFAULT);
    }
}

