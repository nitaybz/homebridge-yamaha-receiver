let Characteristic, Service;

class PARTY_SWITCH {
  constructor(avr, platform, config) {
    Service = platform.api.hap.Service;
    Characteristic = platform.api.hap.Characteristic;

    this.storage = platform.storage;
    this.avr = avr;
    this.log = platform.log;
    this.api = platform.api;
    this.avrId = config.id;
    this.id = `${config.id}_party_switch`;
    this.name = config.name + " Party Mode";
    this.serial = this.id;
    this.model = config.model || "unknown";
    this.manufacturer = "Yamaha";
    this.displayName = this.name;

    this.UUID = this.api.hap.uuid.generate(this.id);
    this.log.easyDebug(`Creating New PARTY SWITCH Accessory: "${this.name}"`);
    this.accessory = new this.api.platformAccessory(this.name, this.UUID);

    this.setServices()
      .then(() => {
        this.api.publishExternalAccessories(platform.PLUGIN_NAME, [
          this.accessory,
        ]);
      })
      .catch((err) => {
        this.log("ERROR setting services");
        this.log(err);
      });
  }

  async setServices() {
    let informationService = this.accessory.getService(
      Service.AccessoryInformation
    );

    if (!informationService)
      informationService = this.accessory.addService(
        Service.AccessoryInformation
      );

    informationService
      .setCharacteristic(Characteristic.Manufacturer, this.manufacturer)
      .setCharacteristic(Characteristic.Model, this.model)
      .setCharacteristic(Characteristic.SerialNumber, this.serial);

    this.partyService = this.accessory.addService(Service.Switch, this.name);

    this.partyService
      .getCharacteristic(Characteristic.On)
      .on("get", this.getPartyModeState.bind(this))
      .on("set", this.setPartyModeState.bind(this));
  }

  getPartyModeState(callback) {
    this.avr
      .isPartyModeEnabled()
      .then((result) => callback(null, result))
      .catch((error) => callback(error));
  }

  setPartyModeState(on, callback) {
    if (on) {
      this.avr
        .powerOn()
        .then(() => this.avr.partyModeOn())
        .then(() => {
          this.log(`${this.name} - Party Mode turned ON`);
          callback(null, true);
        })
        .catch((error) => callback(error));
    } else {
      this.avr
        .partyModeOff()
        .then(() => {
          this.log(`${this.name} - Party Mode turned OFF`);
          callback(null, false);
        })
        .catch((error) => callback(error));
    }
  }
}

module.exports = PARTY_SWITCH;
