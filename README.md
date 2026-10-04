# Auto Brightness Toggle
A GNOME extension that allows you to toggle auto brightness from quick settings.<br>
| Current Support | Historical Support[^1] |
|-----------------|------------------------|
| 45 – 51         | 43                     |

*Note: Your system needs to support auto brightness. Check the troubleshoot section below to determine.*

[<img alt="Get it on GNOME Extensions" height="90" src="https://raw.githubusercontent.com/andyholmes/gnome-shell-extensions-badge/master/get-it-on-ego.svg?sanitize=true">](https://extensions.gnome.org/extension/5736/auto-brightness-toggle/)

## Usage:
If your device supports auto brightness, you may click on the system brightness slider to toggle auto brightness.

Additional preferences can be made to include a toggle in the quick settings panel as well.

## Troubleshoot:
If the extension is not working, check if your system supports auto brightness.

Usually if the extension detects that your device is not supported, it will throw an error that should be visible in most extension managers.

Alternatively, you may manually check by going to `Gnome Settings` -> `Power` and look for `Automatic Screen Brightness`. If this option is not found, it most likely means your system does not support auto brightness (e.g. does not have an ambient sensor / bad GPU driver), hence the extension will not work.

If you believe your device supports automatic brightness, please submit an issue and I will investigate.

## Features:
- Overrides system brightness slider in quick settings so you can toggle by clicking the brightness icon (default behaviour)
- Shows a separate toggle in quick settings (optional)
- Automatically determines an initial brightness whenever your device is being logged on / waken from sleep (optional)

## Supported GNOME versions
At a minimum, this extension supports the GNOME versions shipped by:
- The **two** latest Ubuntu LTS releases
- The latest Debian release
- The latest RHEL release
- The latest SLES / openSUSE Leap release
- The latest Fedora Beta (the upcoming Fedora release, not Rawhide).

The supported range is from the oldest GNOME version to the latest GNOME version used among the above list, and is reviewed whenever one of these distributions has a new release. GNOME versions that are no longer supported can still install the last release of this extension that supported them from GNOME Extensions.

[^1]: Will not receive updates.
