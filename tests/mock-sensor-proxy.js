// SPDX-License-Identifier: GPL-2.0-or-later
// Minimal stand-in for iio-sensor-proxy, used by tests/run.sh only. Owns
// net.hadess.SensorProxy on the bus in DBUS_SYSTEM_BUS_ADDRESS (a private test bus)
// and adds a test-only interface to change HasAmbientLight while running.
//
// Usage: gjs -m mock-sensor-proxy.js <true|false>
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {programArgs} from 'system';

const NAME = 'net.hadess.SensorProxy';
const PATH = '/net/hadess/SensorProxy';
const IFACE_XML = `
<node>
  <interface name="net.hadess.SensorProxy">
    <property name="HasAmbientLight" type="b" access="read"/>
    <property name="LightLevelUnit" type="s" access="read"/>
    <property name="LightLevel" type="d" access="read"/>
    <method name="ClaimLight"/>
    <method name="ReleaseLight"/>
  </interface>
</node>`;
const TEST_IFACE_XML = `
<node>
  <interface name="net.hadess.SensorProxy.Test">
    <method name="SetHasAmbientLight">
      <arg name="value" type="b" direction="in"/>
    </method>
  </interface>
</node>`;

class MockSensorProxy {
    constructor(hasAmbientLight) {
        this.HasAmbientLight = hasAmbientLight;
        this.LightLevelUnit = 'lux';
        this.LightLevel = 100;
    }

    ClaimLight() {}

    ReleaseLight() {}

    SetHasAmbientLight(value) {
        this.HasAmbientLight = value;
        this._impl.emit_property_changed('HasAmbientLight', new GLib.Variant('b', value));
    }
}

const loop = new GLib.MainLoop(null, false);
const mock = new MockSensorProxy(programArgs[0] === 'true');
mock._impl = Gio.DBusExportedObject.wrapJSObject(IFACE_XML, mock);
mock._impl.export(Gio.DBus.system, PATH);
// wrapJSObject() only exports the first interface of its XML, so the test one is separate
const testImpl = Gio.DBusExportedObject.wrapJSObject(TEST_IFACE_XML, mock);
testImpl.export(Gio.DBus.system, PATH);
Gio.bus_own_name_on_connection(Gio.DBus.system, NAME, Gio.BusNameOwnerFlags.NONE,
    null, () => loop.quit());
loop.run();
