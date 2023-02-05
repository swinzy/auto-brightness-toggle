# Auto Brightness Toggle
A GNOME extension that allows you to toggle auto brightness from quick settings.<br>
Currently supports: GNOME 43.

[<img alt="Get it on GNOME Extensions" height="90" src="https://raw.githubusercontent.com/andyholmes/gnome-shell-extensions-badge/master/get-it-on-ego.svg?sanitize=true">](https://extensions.gnome.org/extension/5736/auto-brightness-toggle/)

## Usage:
Install -> Works OOB (No extra config needed)

## Fun Fact:
Once upon a time, I needed something to quickly turn on/off auto brightness just like on a smartphone. Then after a quick search I discovered this extension: https://github.com/diegonz/toggle-auto-brightness. It looks exactly what I needed! Until... it won't install on my Fedora 37!

Ah-ha! It has stopped updating since 2019 and hence doesn't support GNOME 43! Having forked the repo and a quick look at the code, hmmmm, Gtk4 has changed a lot! I eventually decided to create a new extension from scratch since there was not much code I can borrow.
