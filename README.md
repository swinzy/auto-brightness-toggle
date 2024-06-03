# Auto Brightness Toggle
A GNOME extension that allows you to toggle auto brightness from quick settings.<br>
| Current Support | Historical Support[^1] |
|-----------------|------------------------|
| 45, 46          | 43                     |

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

## To-Do:
- [X] Add detection of the availability of auto brightness (check if hardware/OS supports)
- [X] Add custom "auto brightness" icon
- [ ] Translation

## Fun Fact:
Once upon a time, I needed something to quickly turn on/off auto brightness just like on a smartphone. Then after a quick search I discovered this extension: https://github.com/diegonz/toggle-auto-brightness. It looks exactly what I needed! Until... it won't install on my Fedora 37!

Ah-ha! It has stopped updating since 2019 and hence doesn't support GNOME 43! Having forked the repo and a quick look at the code, hmmmm, GNOME 43 has changed a lot! I eventually decided to create a new extension from scratch since there was not much code I can borrow.

[^1]: Will not receive updates.
