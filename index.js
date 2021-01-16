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
        this.apiroute = this.apiroute + '/' + this.passKey;
    }

    this.log('API URL IS: "%s"', this.apiroute);

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

    this.isInGetStatus = false;

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
        //this.log.debug('Map state: %s', state);
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


    _setDHWPush: function () {
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

    _getTemperatureBSBId() {
        var bsbsId;

        var tState = this.service.getCharacteristic(Characteristic.TargetHeatingCoolingState).value;
        var cState = this.service.getCharacteristic(Characteristic.CurrentHeatingCoolingState).value;

        //this.log('TargetHeatingCoolingState %s', tState);
        //this.log('CurrentHeatingCoolingState %s', cState);

        // State 2 is Cool
        // State 1 is Heat
        // State 3 is Auto
        bsbsId = this.coolingTempID;
        if (tState == 1 || tState == 3) {
            bsbsId = this.comfortTempID;
        }

        //this.log('--_getTemperatureBSBId-- %s', bsbsId);

        return bsbsId;
    },

    _mapCurrentState(cState) {
        /*
            1#define ENUM8005_01_TEXT "STB angesprochen"
            2#define ENUM8005_02_TEXT "Störung"
            3#define ENUM8005_05_TEXT "Schornsteinfegerfkt, Vollast"
            4#define ENUM8005_06_TEXT "Schornsteinfegerfkt, Teillast"
            5#define ENUM8005_07_TEXT "Schornsteinfegerfkt aktiv"
            6#define ENUM8005_08_TEXT "Gesperrt, Manuell"
            7#define ENUM8005_09_TEXT "Gesperrt, Automatisch"
            11#define ENUM8005_0b_TEXT "Anfahrentlastung"
            12#define ENUM8005_0c_TEXT "Anfahrentlastung, Teillast"
            13#define ENUM8005_0d_TEXT "Rücklaufbegrenzung"
            14#define ENUM8005_0e_TEXT "Rücklaufbegrenzung, Teillast"
            16#define ENUM8005_10_TEXT "Freigegeben, Teillast"
            20#define ENUM8005_14_TEXT "Minimalbegrenzung"
            21#define ENUM8005_15_TEXT "Minimalbegrenzung, Teillast"
            22#define ENUM8005_16_TEXT "Minimalbegrenzung aktiv"
            59#define ENUM8005_3b_TEXT "Ladung Pufferspeicher"
            123#define ENUM8005_7b_TEXT "STB Test aktiv"
            166#define ENUM8005_a6_TEXT "In Betrieb für Heizkreis"
            167#define ENUM8005_a7_TEXT "In Teillastbetrieb für HK"
            168#define ENUM8005_a8_TEXT "In Betrieb für Trinkwasser"
            169#define ENUM8005_a9_TEXT "In Teillastbetrieb für TWW"
            170#define ENUM8005_aa_TEXT "In Betrieb für HK, TWW"
            171#define ENUM8005_ab_TEXT "In Teillastbetrieb für HK, TWW"
            172#define ENUM8005_ac_TEXT "Gesperrt, Feststoffkessel"
            173#define ENUM8005_ad_TEXT "Freigegeben für HK, TWW"
            174#define ENUM8005_ae_TEXT "Freigeben für TWW"
            175#define ENUM8005_af_TEXT "Freigegeben für HK"
            176#define ENUM8005_b0_TEXT "Gesperrt, Außentemperatur"
            198#define ENUM8005_c6_TEXT "Gesperrt, Ökobetrieb"
        * */
        if (this.isDHW) {
            switch (cState) {
                case 168:
                    return 1;
                case 169:
                    return 2;
                case 170:
                    return 1;
                case 171:
                    return 2;
                default:
                    return 0;
            }
        } else {
            switch (cState) {
                case 166:
                    return 1;
                case 167:
                    return 2;
                case 170:
                    return 1;
                case 171:
                    return 2;
                default:
                    return 0;
            }
        }


    },


    _getStatus: function (callback) {
        this.log('------------------getStatus------------------');
        try {
            if (this.isInGetStatus === false) {

                this.isInGetStatus = true; // prevent multiple call at the same time, because the BSB cannot handle multi request
                var url = this.apiroute + '/JQ=8005,' + this.coolingTempID + ',' + this.comfortTempID + ',' + this.currentTemperatureID + ',' + this.targetTemperatureID + ',' + this.heatingStateID + ',' + this.humiditySensorID + ',' + this.comfortTempID + ',' + this.coolingTempID;
                this.log.debug('Getting status: %s', url);
                this._httpRequest(url, '', this.http_method, function (error, response, responseBody) {

                    var homeKitState;

                    if (error) {
                        this.log.warn('Error getting status: %s', error.message);
                        this.service.getCharacteristic(Characteristic.CurrentHeatingCoolingState).updateValue(new Error('Polling failed'));
                        callback(error)
                    } else {
                        try {
                            this.log.debug('Device response: %s', responseBody);

                            var json = JSON.parse(responseBody);

                            homeKitState = this._mapStateFromBSB(json[this.heatingStateID].value);
                            //this.currentState = homeKitState;

                            this.currentState = json['8005'].value;

                            //this.log('Current State %s', this.currentState);


                            this.log('                        ');
                            this.log('----------set Homekit States----------');
                            this.log('Update TargetHeatingCoolingState to: %s', homeKitState);
                            this.service.getCharacteristic(Characteristic.TargetHeatingCoolingState).updateValue(homeKitState);
                            //this.log('Updated TargetHeatingCoolingState to: %s', this.service.getCharacteristic(Characteristic.TargetHeatingCoolingState).value);


                            this.log('Update CurrentHeatingCoolingState to: %s', this._mapCurrentState(parseInt(this.currentState)));
                            this.service.getCharacteristic(Characteristic.CurrentHeatingCoolingState).updateValue(this._mapCurrentState(parseInt(this.currentState)));
                            //this.log('Updated CurrentHeatingCoolingState to: %s', this.service.getCharacteristic(Characteristic.CurrentHeatingCoolingState).value);
                            this.log('----------set Homekit States--- END ----------');
                            this.log('                        ');


                            if (this.isDHW) {
                                this.service.getCharacteristic(Characteristic.TargetTemperature).updateValue(json[this._getTemperatureBSBId()].value);
                                this.log('Updated TargetTemperature to: %s', json[this._getTemperatureBSBId()].value);
                            } else {
                                this.service.getCharacteristic(Characteristic.TargetTemperature).updateValue(json[this.targetTemperatureID].value);
                                this.log('Updated TargetTemperature to: %s', json[this.targetTemperatureID].value);
                            }

                            this.service.getCharacteristic(Characteristic.CurrentTemperature).updateValue(json[this.currentTemperatureID].value);
                            this.log('Updated CurrentTemperature to: %s', json[this.currentTemperatureID].value);


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

                            callback();

                        } catch (e) {
                            this.log.error('Cannot map json Result: %s', responseBody);
                            callback(e.message)
                        }
                    }
                }.bind(this))
            }


        } finally {
            this.isInGetStatus = false;
        }


        /*
        this.log('TargetHeaterCoolerState1');
        this.service.getCharacteristic(Characteristic.TargetHeaterCoolerState).updateValue(1);


        this.log('TargetHeaterCoolerState2');
        this.service.getCharacteristic(Characteristic.TargetHeaterCoolerState).updateValue(2);




        this.log('CurrentHeaterCoolerState0');
        this.service.getCharacteristic(Characteristic.CurrentHeaterCoolerState).updateValue(0);


        this.log('CurrentHeaterCoolerState1');
        this.service.getCharacteristic(Characteristic.CurrentHeaterCoolerState).updateValue(1);


        this.log('CurrentHeaterCoolerState2');
        this.service.getCharacteristic(Characteristic.CurrentHeaterCoolerState).updateValue(2);
    */


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
        var bsbState;
        var homeKitState = value;
        bsbState = this._mapStateFromHomekit(value);
        //this.currentState = homeKitState;


        // if DHW is set to true and the state is set to "heat", the DHWPush is triggered!
        if ((this.isDHW == true) && (homeKitState == 1)) {
            this._setDHWPush();
        }

        var url = this.apiroute + '/S' + this.heatingStateID + '=' + bsbState;
        this.log('Setting targetHeatingCoolingState: %s', url);
        this._httpRequest(url, '', this.http_method, function (error, response, responseBody) {
            if (error) {
                this.log.warn('Error setting targetHeatingCoolingState: %s', error.message);
                callback(error)
            } else {
                this._getStatus(function () {
                });    // poll current values from heater to display correct destination temperature
                this.log('Set targetHeatingCoolingState to: %s', homeKitState);

                //this.service.getCharacteristic(Characteristic.CurrentHeatingCoolingState).updateValue(homeKitState);
                //this.log('Set CurrentHeatingCoolingState to: %s', homeKitState);
                //this.log('CheckValue %s',this.service.getCharacteristic(Characteristic.CurrentHeatingCoolingState).value)
                callback()
            }
        }.bind(this))
    },

    setTargetTemperature: function (value, callback) {
        value = value.toFixed(1)
        var url = this.apiroute + '/S' + this._getTemperatureBSBId() + '=' + value;
        //this.log('Setting targetTemperature: %s', url);
        this._httpRequest(url, '', this.http_method, function (error, response, responseBody) {
            if (error) {
                this.log.warn('Error setting targetTemperature: %s', error.message);
                callback(error)
            } else {
                this.log('Set targetTemperature to: %s / BSBID %s', value, this._getTemperatureBSBId());
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
