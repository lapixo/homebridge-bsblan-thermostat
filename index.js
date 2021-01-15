var Service, Characteristic;
const packageJson = require('./package.json');
const request = require('request');
const ip = require('ip');
const http = require('http');

module.exports = function (homebridge) {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    homebridge.registerAccessory('bsblan/homebridge-bsblan-thermostat', 'Thermostat', Thermostat);
};


function Thermostat(log, config) {
    this.log = log;

    this.name = config.name || 'BSB-LAN';
    this.apiroute = config.apiroute || 'http://bsb-lan';
    this.apiroute = this.apiroute.replace(/^(.+?)\/*?$/, "$1");

    this.passKey = config.passKey;
    if (this.passKey != undefined || this.passKey != null) {
      this.passKey = this.passKey.replace(/^\/|\/$/g, '');
      this.apiroute = this.apiroute +'/'+this.passKey;
    }

    this.log('API URL IS: "%s"',this.apiroute);

    this.pollInterval = config.pollInterval || 300;

    this.isDHW = config.isDHW || false;

    this.currentTemperatureID = config.currentTemperatureID || 8740;
    this.targetTemperatureID = config.targetTemperatureID || 8741;
    this.heatingStateID = config.heatingStateID || 700;
    this.comfortTempID = config.comfortTempID || 710;
    this.coolingTempID = config.coolingTempID || 712;
    this.humiditySensorID = config.humiditySensorID || 20102;


    this.listener = config.listener || false;
    this.port = config.port || 2000;
    this.requestArray = ['targetHeatingCoolingState', 'targetTemperature', 'coolingThresholdTemperature', 'heatingThresholdTemperature', 'getCurrentTemperatur', 'getTargetTemperature'];

    this.manufacturer = config.manufacturer || packageJson.author.name;
    this.serial = config.serial || this.apiroute;
    this.model = config.model || packageJson.name;
    this.firmware = config.firmware || packageJson.version;

    this.username = config.username || null;
    this.password = config.password || null;
    this.timeout = config.timeout || 3000;
    this.http_method = config.http_method || 'GET';

    this.temperatureThresholds = config.temperatureThresholds || false;
    this.heatOnly = config.heatOnly || false;

    this.currentRelativeHumidity = config.currentRelativeHumidity || false;
    this.temperatureDisplayUnits = config.temperatureDisplayUnits || 0;
    this.maxTemp = config.maxTemp || 30;
    this.minTemp = config.minTemp || 15;
    this.minStep = config.minStep || 0.5;


    if (this.isDHW) {
        this.currentTemperatureID = config.currentTemperatureID || 8830;
        this.targetTemperatureID = config.targetTemperatureID || 8831;
        this.heatingStateID = config.heatingStateID || 1600;
        this.comfortTempID = config.comfortTempID || 1610;
        this.coolingTempID = config.coolingTempID || 1612;
        this.maxTemp = config.maxTemp || 60;
        this.minTemp = config.minTemp || 45;
    }


    this.currentState = 0;

    if (this.username != null && this.password != null) {
        this.auth = {
            user: this.username,
            pass: this.password
        }
    }

    if (this.listener) {
        this.log.debug('Listener is enabled');

        this.server = http.createServer(function (request, response) {
            var baseURL = 'http://' + request.headers.host + '/';

            this.log.debug('BASE URL %s', baseURL);

            var url = new URL(request.url, baseURL);
            if (this.requestArray.includes(url.pathname.substr(1))) {
                this.log.debug('Handling request');
                response.end('Handling request');
                this._httpHandler(url.pathname.substr(1), url.searchParams.get('value'))
            } else {
                this.log.warn('Invalid request: %s', request.url);
                response.end('Invalid request')
            }
        }.bind(this));

        this.server.listen(this.port, function () {
            this.log('Listen server: http://%s:%s', ip.address(), this.port)
        }.bind(this))
    }

    this.service = new Service.Thermostat(this.name)
}

Thermostat.prototype = {

    identify: function (callback) {
        this.log('Identify requested!');
        callback()
    },

    _httpRequest: function (url, body, method, callback) {
        request({
                url: url,
                body: body,
                method: this.http_method,
                timeout: this.timeout,
                rejectUnauthorized: false,
                auth: this.auth
            },
            function (error, response, body) {
                callback(error, response, body)
            })
    },


    _mapStateFromBSB(state) {
        this.log.debug('Map state: %s', state);
        if (this.isDHW) {
            switch (state) {
                case '0': // Aus
                    return 0; // Off
                case '1': // Ein
                    return 3; // Auto
                case '2': // Eco
                    return 2; // cool
            }
        } else {
            switch (state) {
                case '0': // Schutz
                    return 0; // Off
                case '1': // Komfort
                    return 3; // heat
                case '2': // Reduziert
                    return 2; // cool
                case '3': // Auto
                    return 1; // auto
            }
        }


    },

    _mapStateFromHomekit(state) {
        this.log.debug('Map state: %s', state);
        if (this.isDHW) {
            switch (state) {
                case 0: // off
                    return 0; // Aus
                case 3: // auto
                    return 1; // Ein
                case 2: // cool
                    return 2; // Eco
                case 1: // heat
                    return 1; // Ein
            }
        } else {
            switch (state) {
                case 0: // off
                    return 0; // Schutz
                case 1: // heat
                    return 3; // Komfort
                case 2: // cool
                    return 2; // Reduzier
                case 3: // auto
                    return 1; // Auto
            }
        }


    },

    _getStatus: function (callback) {


        var url = this.apiroute + '/JQ=' + this.currentTemperatureID + ',' + this.targetTemperatureID + ',' + this.heatingStateID + ',' + this.humiditySensorID + ',' + this.comfortTempID + ',' + this.coolingTempID;
        this.log.debug('Getting status: %s', url);


        this._httpRequest(url, '', this.http_method, function (error, response, responseBody) {
            if (error) {
                this.log.warn('Error getting status: %s', error.message);
                this.service.getCharacteristic(Characteristic.CurrentHeatingCoolingState).updateValue(new Error('Polling failed'));
                callback(error)
            } else {

                this.log.debug('Device response: %s', responseBody);


                try {
                    var json = JSON.parse(responseBody);
                    var htstate;
                    this.service.getCharacteristic(Characteristic.TargetTemperature).updateValue(json[this.targetTemperatureID].value);
                    this.log('Updated TargetTemperature to: %s', json[this.targetTemperatureID].value);
                    this.service.getCharacteristic(Characteristic.CurrentTemperature).updateValue(json[this.currentTemperatureID].value);
                    this.log('Updated CurrentTemperature to: %s', json[this.currentTemperatureID].value);
                    htstate = this._mapStateFromBSB(json[this.heatingStateID].value);
                    this.currentState = htstate;
                } catch (e) {
                    this.log.error('Cannot map json Result: %s', responseBody);
                }


                this.log('Mapped state: %s', htstate);
                this.service.getCharacteristic(Characteristic.TargetHeatingCoolingState).updateValue(htstate);
                this.log('Updated TargetHeatingCoolingState to: %s', htstate);

                this.service.getCharacteristic(Characteristic.CurrentHeatingCoolingState).updateValue(htstate);
                this.log('Updated CurrentHeatingCoolingState to: %s', htstate);

                if (this.temperatureThresholds) {
                    this.service.getCharacteristic(Characteristic.CoolingThresholdTemperature).updateValue(json.coolingThresholdTemperature);
                    this.log.debug('Updated CoolingThresholdTemperature to: %s', json.coolingThresholdTemperature);
                    this.service.getCharacteristic(Characteristic.HeatingThresholdTemperature).updateValue(json.heatingThresholdTemperature);
                    this.log.debug('Updated HeatingThresholdTemperature to: %s', json.heatingThresholdTemperature)
                }
                if (this.currentRelativeHumidity) {
                    this.service.getCharacteristic(Characteristic.CurrentRelativeHumidity).updateValue(json[this.humiditySensorID].value);
                    this.log('Updated CurrentRelativeHumidity to: %s', json[this.humiditySensorID].value)
                }
                callback()
            }
        }.bind(this))
    },

    _httpHandler: function (characteristic, value) {
        switch (characteristic) {
            case 'targetHeatingCoolingState':
                this.service.getCharacteristic(Characteristic.TargetHeatingCoolingState).updateValue(value);
                this.log('Updated %s to: %s', characteristic, value);
                break
            case 'targetTemperature':
                this.service.getCharacteristic(Characteristic.TargetTemperature).updateValue(value);
                this.log('Updated %s to: %s', characteristic, value);
                break
            case 'coolingThresholdTemperature':
                this.service.getCharacteristic(Characteristic.CoolingThresholdTemperature).updateValue(value);
                this.log('Updated %s to: %s', characteristic, value);
                break
            case 'heatingThresholdTemperature':
                this.service.getCharacteristic(Characteristic.HeatingThresholdTemperature).updateValue(value);
                this.log('Updated %s to: %s', characteristic, value);
                break
            case 'getCurrentTemperatur':
                this.service.getCharacteristic(Characteristic.CurrentTemperature);
                this.log('getCurrentTemperatur %s ', characteristic);
                break
            case 'getTargetTemperature':
                this.service.getCharacteristic(Characteristic.TargetTemperature);
                this.log('getTargetTemperature %s ', characteristic);
                break
            default:
                this.log.warn('Unknown characteristic "%s" with value "%s"', characteristic, value)
        }
    },

    setTargetHeatingCoolingState: function (value, callback) {
        var htstate;
        htstate = this._mapStateFromHomekit(value);


        // if DHW is set to true and the state is set to "heat", the DHWPush is triggered!
        if ((this.isDHW == true) && (value == 1)) {
            this.setDHWPush();
        }

        var url = this.apiroute + '/S' + this.heatingStateID + '=' + htstate;
        this.log.debug('Setting targetHeatingCoolingState: %s', url);
        this._httpRequest(url, '', this.http_method, function (error, response, responseBody) {
            if (error) {
                this.log.warn('Error setting targetHeatingCoolingState: %s', error.message);
                callback(error)
            } else {
                this.log('Set targetHeatingCoolingState to: %s', htstate);
                this.service.getCharacteristic(Characteristic.CurrentHeatingCoolingState).updateValue(value);
                callback()
            }
        }.bind(this))
    },

    setDHWPush: function () {
        var url = this.apiroute + '/S1603=1';
        this.log.debug('setDHWPush: %s', url);
        this._httpRequest(url, '', this.http_method, function (error, response, responseBody) {
            if (error) {
                this.log.warn('Error setting setDHWPush: %s', error.message);
            } else {
                this.log('setDHWPush erfolgreich');
            }
        }.bind(this))
    },

    setTargetTemperature: function (value, callback) {
        value = value.toFixed(1)

        var cState;
        var tState;
        cState = this.service.getCharacteristic(Characteristic.CurrentHeatingCoolingState);
        tState = this.service.getCharacteristic(Characteristic.TargetHeatingCoolingState);

        var url = this.apiroute + '/S' + this.comfortTempID + '=' + value;
        if ((this.currentState == 2) || (cState == 2) || (tState == 2))
            url = this.apiroute + '/S' + this.coolingTempID + '=' + value;

        this.log('Setting targetTemperature: %s', url);

        this._httpRequest(url, '', this.http_method, function (error, response, responseBody) {
            if (error) {
                this.log.warn('Error setting targetTemperature: %s', error.message);
                callback(error)
            } else {
                this.log('Set targetTemperature to: %s', value);
                callback()
            }
        }.bind(this))
    },

    setCoolingThresholdTemperature: function (value, callback) {
        value = value.toFixed(1);
        var url = this.apiroute + '/coolingThresholdTemperature?value=' + value;
        this.log.debug('Setting coolingThresholdTemperature: %s', url);

        this._httpRequest(url, '', this.http_method, function (error, response, responseBody) {
            if (error) {
                this.log.warn('Error setting coolingThresholdTemperature: %s', error.message);
                callback(error)
            } else {
                this.log('Set coolingThresholdTemperature to: %s', value);
                callback()
            }
        }.bind(this))
    },

    setHeatingThresholdTemperature: function (value, callback) {
        value = value.toFixed(1)
        var url = this.apiroute + '/heatingThresholdTemperature?value=' + value;
        this.log.debug('Setting heatingThresholdTemperature: %s', url);

        this._httpRequest(url, '', this.http_method, function (error, response, responseBody) {
            if (error) {
                this.log.warn('Error setting heatingThresholdTemperature: %s', error.message);
                callback(error)
            } else {
                this.log('Set heatingThresholdTemperature to: %s', value);
                callback()
            }
        }.bind(this))
    },

    getServices: function () {
        this.informationService = new Service.AccessoryInformation();
        this.informationService
            .setCharacteristic(Characteristic.Manufacturer, this.manufacturer)
            .setCharacteristic(Characteristic.Model, this.model)
            .setCharacteristic(Characteristic.SerialNumber, this.serial)
            .setCharacteristic(Characteristic.FirmwareRevision, this.firmware);

        this.service.getCharacteristic(Characteristic.TemperatureDisplayUnits).updateValue(this.temperatureDisplayUnits);

        this.service
            .getCharacteristic(Characteristic.TargetHeatingCoolingState)
            .on('set', this.setTargetHeatingCoolingState.bind(this));

        if (this.heatOnly) {
            this.service.getCharacteristic(Characteristic.TargetHeatingCoolingState)
                .setProps({
                    maxValue: Characteristic.TargetHeatingCoolingState.HEAT
                })
        }

        this.service
            .getCharacteristic(Characteristic.TargetTemperature)
            .on('set', this.setTargetTemperature.bind(this))
            .setProps({
                minValue: this.minTemp,
                maxValue: this.maxTemp,
                minStep: this.minStep
            });

        if (this.temperatureThresholds) {
            this.service
                .getCharacteristic(Characteristic.CoolingThresholdTemperature)
                .on('set', this.setCoolingThresholdTemperature.bind(this))
                .setProps({
                    minValue: this.minTemp,
                    maxValue: this.maxTemp,
                    minStep: this.minStep
                });

            this.service
                .getCharacteristic(Characteristic.HeatingThresholdTemperature)
                .on('set', this.setHeatingThresholdTemperature.bind(this))
                .setProps({
                    minValue: this.minTemp,
                    maxValue: this.maxTemp,
                    minStep: this.minStep
                })
        }

        this._getStatus(function () {
        });

        setInterval(function () {
            this._getStatus(function () {
            })
        }.bind(this), this.pollInterval * 1000);

        return [this.informationService, this.service]
    }
};
