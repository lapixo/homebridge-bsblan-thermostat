<p align="center">
  <a href="https://github.com/homebridge/homebridge"><img src="https://raw.githubusercontent.com/homebridge/branding/master/logos/homebridge-color-round-stylized.png" height="140"></a>
</p>

<span align="center">

# homebridge-bsblan-thermostat

[![npm](https://img.shields.io/npm/v/@bsblan/homebridge-bsblan-thermostat.svg)](https://www.npmjs.com/package/@bsblan/homebridge-bsblan-thermostat) [![npm](https://img.shields.io/npm/dt/@bsblan/homebridge-bsblan-thermostat.svg)](https://www.npmjs.com/package/@bsblan/homebridge-bsblan-thermostat)

</span>

## Description

This [homebridge](https://github.com/nfarina/homebridge) plugin exposes a [BSB_lan](https://github.com/fredlcore/bsb_lan) thermostat to Apple's [HomeKit](http://www.apple.com/ios/home/). 
Using simple HTTP requests, the plugin allows you to set the thermostat mode and control the target temperature.

This Plugin is based on [homebridge-web-thermostat](https://github.com/Tommrodrigues/homebridge-web-thermostat#readme)

## Installation

1. Install [homebridge](https://github.com/nfarina/homebridge#installation-details)
2. Install this plugin: `npm install -g homebridge-bsblan-thermostat`
3. Update your `config.json` file

## Configuration

```json
"accessories": [
    {
        "accessory": "BSBThermostat",
        "name": "Thermostat-HK1",
        "apiroute": "http://bsb-lan_ip",
        "pollInterval": 35
    }
]
```

### Core
| Key | Description | Default |
| --- | --- | --- |
| `accessory` | Must be `BSBThermostat` | N/A |
| `name` | Name to appear in the Home app | N/A |
| `apiroute` | Root HTTP URL of your device without trailing slash  | http://bsb-lan |

### Optional fields
| Key | Description | Default | if isDHW (true) |
| --- | --- | --- | --- |
| `passKey` | Passkey of the BSB lan address |  |
| `isDHW` | Use as DHW Thermostat  | `false` |  |
| --- | --- | --- | --- |
| `currentHeatingCircuitStateID` | BSB States-Field to detect current heating states  | `8000` | `8003` |
| `statesForHeat` | BSB States to detect current heating | `[4, 102, 111, 112, 113, 114]` | `[85,86,88,92,93,95,96]` |
| `statesForCool` | BSB States to detect current cooling  | `[103, 104, 105, 106, 116]` | `[97]` |
| `heatingStateID` | The BSB ID for the target heating state | `700` | `1600` |
| `currentHeatOperationModeID` | The BSB ID for the current operation heating mode | `10102` |  |
| --- | --- | --- | --- |
| `comfortTempID` | The BSB ID for in comfort mode | `710` | `1610` |
| `coolingTempID` | The BSB ID for in cooling mode | `712` | `1612` |
| `frostTempID` | The BSB ID for in frost protection mode | `714` | `1612` |
| `currentTemperatureID` | The BSB ID | `8740` | `8830` |
| --- | --- | --- | --- |
| `maxTemp` | Upper bound for the temperature selector in the Home app | `30` | `60` |
| `minTemp` | Lower bound for the temperature selector in the Home app | `15` | `45` |
| `minStep` | Minimum increment value for the temperature selector in the Home app | `0.5` | `0.5` |
| --- | --- | --- | --- |
| `humiditySensorID` | The BSB ID | `20102` |  `20102` |
| `currentRelativeHumidity` | Whether to include `currentRelativeHumidity` as a field in `/status` | `false` | `false` |
| `temperatureDisplayUnits` | Whether you want °C (`0`) or °F (`1`) as your units | `0` | `0` |
| `heatOnly` | Whether to only expose the heating characteristic, and not cooling/auto | `false` | `false` |
| `temperatureThresholds` | Whether you want the thermostat accessory to have heating and cooling temperature thresholds | `false` | `false` |

### Additional options
| Key | Description | Default |
| --- | --- | --- |
| `listener` | Whether to start a listener to get real-time changes from the device. Call example: local_homebridge_ip:2000/targetTemperature?value=FLOAT_VALUE | `false` |
| `setterDelay` | Time (in milliseconds) after a change is take over  | `1000` |
| `pollInterval` | Time (in seconds) between device polls | `35` |
| `timeout` | Time (in milliseconds) until the accessory will be marked as _Not Responding_ if it is unreachable | `3000` |
| `port` | Port for your HTTP listener (if enabled) | `2000` |
| `http_method` | HTTP method used to communicate with the device | `GET` |
| `username` | Username if HTTP authentication is enabled | N/A |
| `password` | Password if HTTP authentication is enabled | N/A |
| `model` | Appears under the _Model_ field for the accessory | plugin |
| `serial` | Appears under the _Serial_ field for the accessory | apiroute |
| `manufacturer` | Appears under the _Manufacturer_ field for the accessory | author |
| `firmware` | Appears under the _Firmware_ field for the accessory | version |


### Use as DHW Thermostat
```
Important: If "isDHW" is set to true, the Thermostat
Properties changed to the DHW BSB-IDs. 
The Thermostat trigger a DHW-Push, if it
is set to "heat". After the Push the Thermostat
is changed back to the last state (auto, off, or cool).
"automatic" is mapped fixed to the BSB DHW-State "on".
"cool" is mapped fixed to the BSB DHW-State "eco"
"off" is mapped fixed to the BSB DHW-State "off"
"Heat" is only used to trigger the push.  

Example Config with to Thermostate:
```
```json
    "accessories": [
        {
            "accessory": "BSBThermostat",
            "name": "Thermostat-HK1",
            "apiroute": "http://BSB_LAN_IP",
            "pollInterval": 35
        },
        {
            "accessory": "BSBThermostat",
            "name": "Thermostat-TW",
            "apiroute": "http://BSB_LAN_IP",
            "pollInterval": 50,
            "isDHW": true
        }
    ],
```


### Optional (if listener is enabled)

1. Update `targetHeatingCoolingState` following a manual override by messaging the listen server:
```
/targetHeatingCoolingState?value=INT_VALUE
```

2. Update `targetTemperature` following a manual override by messaging the listen server:
```
/targetTemperature?value=FLOAT_VALUE
```

3. _(if enabled)_ Update `coolingThresholdTemperature` following a manual override by messaging the listen server:
```
/coolingThresholdTemperature?value=FLOAT_VALUE
```

4. _(if enabled)_ Update `heatingThresholdTemperature` following a manual override by messaging the listen server:
```
/heatingThresholdTemperature?value=FLOAT_VALUE
```

5. _(if enabled)_ Update `getCurrentTemperatur` following a manual override by messaging the listen server:
```
/getCurrentTemperatur
```

6. _(if enabled)_ Update `getTargetTemperature` following a manual override by messaging the listen server:
```
/getCurrentTemperatur
```

## HeatingCoolingState Key

| Number | Name |
| --- | --- |
| `0` | Off |
| `1` | Heat |
| `2` | Cool |
| `3` | Auto |
