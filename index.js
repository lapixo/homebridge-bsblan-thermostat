var Service, Characteristic;
const packageJson = require('./package.json');
const request = require('request');
const ip = require('ip');
const http = require('http');


const homeKitCurrentStates = {
    off: 0,
    heat: 1,
    cool: 2,
    auto: 3,
};

const bsbStates = {
    off: 0,
    auto: 1,
    cool: 2,
    heat: 3,
};
var bsbToHomeKitState = [];
bsbToHomeKitState[bsbStates.off] = homeKitCurrentStates.off;
bsbToHomeKitState[bsbStates.auto] = homeKitCurrentStates.auto;
bsbToHomeKitState[bsbStates.cool] = homeKitCurrentStates.cool;
bsbToHomeKitState[bsbStates.heat] = homeKitCurrentStates.heat;

var homeKitToBSBState = [];
homeKitToBSBState[homeKitCurrentStates.off] = bsbStates.off;
homeKitToBSBState[homeKitCurrentStates.auto] = bsbStates.auto;
homeKitToBSBState[homeKitCurrentStates.cool] = bsbStates.cool;
homeKitToBSBState[homeKitCurrentStates.heat] = bsbStates.heat;


var homeKitToBSBStateStr = [];
homeKitToBSBStateStr[homeKitCurrentStates.off] = 'off';
homeKitToBSBStateStr[homeKitCurrentStates.auto] = 'auto';
homeKitToBSBStateStr[homeKitCurrentStates.cool] = 'cool';
homeKitToBSBStateStr[homeKitCurrentStates.heat] = 'heat';


module.exports = function (homebridge) {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    homebridge.registerAccessory('bsblan/homebridge-bsblan-thermostat', 'BSBThermostat', Thermostat);
};


function Thermostat(log, config) {
    this.log = log;

    this.name = config.name || 'BSB-LAN';
    this.apiroute = config.apiroute || 'http://bsb-lan';
    this.apiroute = this.apiroute.replace(/^(.+?)\/*?$/, "$1");

    this.passKey = config.passKey;
    if (this.passKey != undefined || this.passKey != null) {
        this.passKey = this.passKey.replace(/^\/|\/$/g, '');
        this.apiroute = this.apiroute + '/' + this.passKey;
    }

    this.log('API URL IS: "%s"', this.apiroute);

    this.pollInterval = config.pollInterval || 35;

    this.isDHW = config.isDHW || false;


    this.currentHeatingCircuitStateID = config.currentHeatingCircuitStateID || 8000;
    this.statesForHeat = config.statesForHeat || [4, 102, 111, 112, 113, 114];
    this.statesForCool = config.statesForCool || [103, 104, 105, 106, 116];
    //this.statesForOff = config.statesForOff || [17, 22, 23, 24, 99, 115, 117, 118];

    //his.statesAutoHeat = config.statesAutoHeat || [114];
    //this.statesAutoCool = config.statesAutoCool || [116];
    this.heatingStateID = config.heatingStateID || 700;
    this.currentHeatOperationModeID = config.currentHeatOperationModeID || 10102;

    this.currentTemperatureID = config.currentTemperatureID || 8740;
    //this.targetTemperatureID = config.targetTemperatureID || 8741;

    this.comfortTempID = config.comfortTempID || 710;
    this.coolingTempID = config.coolingTempID || 712;
    this.frostTempID = config.frostTempID || 714;


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
    this.timeout = config.timeout || 1000;
    this.http_method = config.http_method || 'GET';
    this.setterDelay = config.setterDelay || 1000;

    this.temperatureThresholds = config.temperatureThresholds || false;
    this.heatOnly = config.heatOnly || false;

    this.currentRelativeHumidity = config.currentRelativeHumidity || false;
    this.temperatureDisplayUnits = config.temperatureDisplayUnits || 0;
    this.maxTemp = config.maxTemp || 30;
    this.minTemp = config.minTemp || 15;
    this.minStep = config.minStep || 0.5;

    this.isInGetStatus = false;

    if (this.isDHW) {
        this.currentHeatingCircuitStateID = config.currentHeatingCircuitStateID || 8003;
        this.statesForHeat = config.statesForHeat || [95, 96];
        this.statesForCool = config.statesForCool || [97];
        //this.statesForOff = config.statesForOff || [25];

        this.currentTemperatureID = config.currentTemperatureID || 8830;
        //this.targetTemperatureID = config.targetTemperatureID || 8831;

        this.heatingStateID = config.heatingStateID || 1600;

        this.comfortTempID = config.comfortTempID || 1610;
        this.coolingTempID = config.coolingTempID || 1612;
        this.frostTempID = config.frostTempID || 1612;


        this.maxTemp = config.maxTemp || 60;
        this.minTemp = config.minTemp || 45;
    }


    this.currentOPState = 0;
    this.currentState = 0;
    this.targetState = 0;

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

    _DHWPush: function () {
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


    _mapCurrentState: function (cState) {
        if (this.statesForHeat.includes(cState))
            return homeKitCurrentStates.heat;
        else if (this.statesForCool.includes(cState))
            return homeKitCurrentStates.cool;
        else //  (this.statesForOff.includes(state))
            return homeKitCurrentStates.off;
    },

    _mapCurrentOPState: function (cState) {
        var id = cState.substring(2, 4);
        if (id == '01' || id == '03') {
            return homeKitCurrentStates.cool;
        } else if (id == '02' || id == '04') {
            return homeKitCurrentStates.heat;
        } else {
            return homeKitCurrentStates.heat;
        }
    },


    _getTemperatureBSBId(cState) {
        //var tState = this.service.getCharacteristic(Characteristic.TargetHeatingCoolingState).value;
        //var cState = this.service.getCharacteristic(Characteristic.CurrentHeatingCoolingState).value;
        //this.log('TargetHeatingCoolingState %s', tState);
        //this.log('CurrentHeatingCoolingState %s', cState);
        switch (cState) {
            case homeKitCurrentStates.off: // 0
                return this.frostTempID;
            case homeKitCurrentStates.heat: // 1
                return this.comfortTempID;
            case homeKitCurrentStates.cool: // 2
                return this.coolingTempID;
            default:
                return this.comfortTempID; // 3
        }
    },

    _getTargetTempID: function () {

        if (this.isDHW || (this.targetState != homeKitCurrentStates.auto)) {
            return this._getTemperatureBSBId(this.targetState);
        } else {
            return this._getTemperatureBSBId(this.currentOPState);
            /*
            if (this.statesAutoHeat.includes(this.currentState))
                return this._getTemperatureBSBId(homeKitCurrentStates.heat);
            else if (this.statesAutoCool.includes(this.currentState))
                return this._getTemperatureBSBId(homeKitCurrentStates.cool);
            else
                return this._getTemperatureBSBId(this.targetState);
            */

        }


    },


    _getStatusTargetTemperature: function (callback) {
        this.log('------------------_getStatusTargetTemperature------------------');
        try {
            if (this.isInGetStatus === false) {

                var targedTempID = this._getTargetTempID();
                var url = this.apiroute + '/JQ=' + targedTempID;
                this.log('Getting status: %s', url);
                this.isInGetStatus = true; // prevent multiple call at the same time, because the BSB cannot handle multi request
                this._httpRequest(url, '', this.http_method, function (error, response, responseBody) {
                    this.isInGetStatus = false;
                    if (error) {
                        this.log.warn('Error getting status: %s', error.message);
                        this.service.getCharacteristic(Characteristic.CurrentHeatingCoolingState).updateValue(new Error('Polling failed'));
                        callback(error)
                    } else {
                        try {
                            this.log.debug('Device response: %s', responseBody);
                            var json = JSON.parse(responseBody);
                            this.service.getCharacteristic(Characteristic.TargetTemperature).updateValue(json[targedTempID].value);
                            this.log('Updated TargetTemperature to: %s', json[targedTempID].value);
                            callback();
                        } catch (e) {
                            this.log.error('_getStatus error %s: %s', e.message, responseBody);
                            callback(e.message)
                        }
                    }
                }.bind(this))
            }
        } finally {
            this.isInGetStatus = false;
        }
    },


    _getStatus: function (callback) {
        this.log('------------------getStatus------------------');
        try {
            if (this.isInGetStatus === false) {

                var targedTempID = this._getTargetTempID();
                var url = this.apiroute + '/JQ=' + this.currentHeatOperationModeID + ',' + this.currentHeatingCircuitStateID + ',' + this.heatingStateID + ',' + this.currentTemperatureID + ',' + this.humiditySensorID + ',' + targedTempID;

                this.log('Getting status: %s', url);
                this.isInGetStatus = true; // prevent multiple call at the same time, because the BSB cannot handle multi request
                this._httpRequest(url, '', this.http_method, function (error, response, responseBody) {
                    this.isInGetStatus = false;

                    if (error) {
                        this.log.warn('Error getting status: %s', error.message);
                        this.service.getCharacteristic(Characteristic.CurrentHeatingCoolingState).updateValue(new Error('Polling failed'));
                        callback(error)
                    } else {
                        try {
                            this.log.debug('Device response: %s', responseBody);

                            var json = JSON.parse(responseBody);

                            var currentHeatingState = json[this.currentHeatingCircuitStateID].value;
                            var heatingState = json[this.heatingStateID].value;
                            var currentTemperature = json[this.currentTemperatureID].value;
                            var homeKitState = bsbToHomeKitState[parseInt(heatingState)];


                            if (!this.isDHW){
                                this.currentOPState = this._mapCurrentOPState(json[this.currentHeatOperationModeID].value);
                                this.log('Updated CurrentOPState to: %s', homeKitToBSBStateStr[this.currentOPState]);
                            }



                            this.targetState = homeKitState;
                            this.currentState = this._mapCurrentState(parseInt(currentHeatingState));

                            this.log('Update TargetHeatingCoolingState to: %s', homeKitToBSBStateStr[homeKitState]);
                            this.service.getCharacteristic(Characteristic.TargetHeatingCoolingState).updateValue(homeKitState);


                            this.log('Update CurrentHeatingCoolingState to: %s', homeKitToBSBStateStr[this.currentState]);
                            this.service.getCharacteristic(Characteristic.CurrentHeatingCoolingState).updateValue(this.currentState);

                            this.service.getCharacteristic(Characteristic.TargetTemperature).updateValue(json[targedTempID].value);
                            this.log('Updated TargetTemperature to: %s', json[targedTempID].value);

                            this.service.getCharacteristic(Characteristic.CurrentTemperature).updateValue(currentTemperature);
                            this.log('Updated CurrentTemperature to: %s', currentTemperature);


                            if (this.temperatureThresholds) {
                                this.service.getCharacteristic(Characteristic.CoolingThresholdTemperature).updateValue(json.coolingThresholdTemperature);
                                this.log.debug('Updated CoolingThresholdTemperature to: %s', json.coolingThresholdTemperature);
                                this.service.getCharacteristic(Characteristic.HeatingThresholdTemperature).updateValue(json.heatingThresholdTemperature);
                                this.log.debug('Updated HeatingThresholdTemperature to: %s', json.heatingThresholdTemperature)
                            }
                            if (this.currentRelativeHumidity) {
                                var humiditySensor = json[this.humiditySensorID].value;

                                this.service.getCharacteristic(Characteristic.CurrentRelativeHumidity).updateValue(humiditySensor);
                                this.log('Updated CurrentRelativeHumidity to: %s', humiditySensor)
                            }

                            callback();
                        } catch (e) {
                            this.log.error('_getStatus error %s: %s', e.message, responseBody);
                            this.isInGetStatus = false;
                            callback(e.message)
                        }
                    }
                }.bind(this))
            }
        } finally {
            this.isInGetStatus = false;
        }

    },


    setTargetTemperature: function (value, callback) {
        value = value.toFixed(1)

        this._getStatus(function () {

                var targedTempID = this._getTargetTempID();
                var url = this.apiroute + '/S' + targedTempID + '=' + value;
                this.log('Getting status: %s', url);
                this._httpRequest(url, '', this.http_method, function (error, response, responseBody) {
                    if (error) {
                        this.log.warn('Error setting targetTemperature: %s', error.message);
                        callback(error)
                    } else {
                        this.log('Set targetTemperature to: %s / BSBID %s', value, targedTempID);
                        callback()
                    }
                }.bind(this));

            }.bind(this)
        );
    },

    _setTargetHeatingCoolingState: function (homeKitState, callback) {
        var bsbState = homeKitToBSBState[homeKitState];

        // if DHW is set to true and the state is set to "heat", the DHWPush is triggered!
        if ((this.isDHW == true) && (homeKitState == homeKitCurrentStates.heat)) {
            this._DHWPush();
            // set to old Value, because the Push/heat State is only temporarily
            this.service.getCharacteristic(Characteristic.TargetHeatingCoolingState).updateValue(this.targetState);
        } else {

            var url = this.apiroute + '/S' + this.heatingStateID + '=' + bsbState;
            this.log('Getting status: %s', url);
            this._httpRequest(url, '', this.http_method, function (error, response, responseBody) {


                if (error) {
                    this.log.warn('Error setting targetHeatingCoolingState: %s', error.message);
                } else {
                    this.targetState = homeKitState;
                    //this.service.getCharacteristic(Characteristic.CurrentHeatingCoolingState).updateValue(homeKitState);
                    this.service.getCharacteristic(Characteristic.TargetHeatingCoolingState).updateValue(homeKitState);
                    //this.log('Set CurrentHeatingCoolingState to: %s', homeKitState);
                    this.log('Set TargetHeatingCoolingState to: %s', homeKitToBSBStateStr[homeKitState]);
                    this._getStatusTargetTemperature(function () {});

                }
                if (callback) {
                    if (error) {
                        callback(error)
                    } else {
                        callback();
                        //this.service.getCharacteristic(Characteristic.CurrentHeatingCoolingState).updateValue(homeKitState);
                        //this.log('Set CurrentHeatingCoolingState to: %s', homeKitState);
                        //this.log('CheckValue %s',this.service.getCharacteristic(Characteristic.CurrentHeatingCoolingState).value)
                    }
                }
            }.bind(this))
        }
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


    setDispatch: function (value, callback, characteristic) {
        switch (characteristic) {
            case Characteristic.TargetHeatingCoolingState:
                this._setTargetHeatingCoolingState(value, callback);
        }
    },

    makeHelper: function (characteristic) {

        //this.log('Characteristic.TargetHeatingCoolingState %s',Characteristic.TargetHeatingCoolingState);

        var timeoutID = null;
        return {
            setter: function (value, callback) {
                if (this.setterDelay === 0) {
                    // no setter delay or internal set - do it immediately
                    //this.log.debug("updating " + characteristic.displayName.replace(/\s/g, '') + " with value " + value);
                    this.setDispatch(value, callback, characteristic);
                } else {
                    // making a request and setter delay is set
                    // optimistic callback calling if we have a delay
                    // this also means we won't be getting back any errors in homekit
                    callback();

                    //this.log.debug("updating " + characteristic.displayName.replace(/\s/g, '') + " with value " + value + " in " + this.setterDelay + "ms");
                    if (timeoutID != null) {
                        clearTimeout(timeoutID);
                        this.log.debug("clearing timeout ");
                    }
                    timeoutID = setTimeout(function () {
                        this.setDispatch(value, null, characteristic);
                        timeoutID = null;
                    }.bind(this), this.setterDelay);
                }
            }
        };
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


    getServices: function () {
        this.informationService = new Service.AccessoryInformation();
        this.informationService
            .setCharacteristic(Characteristic.Manufacturer, this.manufacturer)
            .setCharacteristic(Characteristic.Model, this.model)
            .setCharacteristic(Characteristic.SerialNumber, this.serial)
            .setCharacteristic(Characteristic.FirmwareRevision, this.firmware);

        this.service.getCharacteristic(Characteristic.TemperatureDisplayUnits).updateValue(this.temperatureDisplayUnits);


        this.service.getCharacteristic(Characteristic.TargetHeatingCoolingState).on('set', this.makeHelper(Characteristic.TargetHeatingCoolingState).setter.bind(this));

        //this.service.getCharacteristic(Characteristic.TargetHeatingCoolingState).on('set', this.setTargetHeatingCoolingState.bind(this));

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