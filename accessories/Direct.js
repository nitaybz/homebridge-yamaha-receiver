let Characteristic, Service;

class DIRECT_SWITCH {
	constructor(avr, platform, config) {
		Service = platform.api.hap.Service;
		Characteristic = platform.api.hap.Characteristic;

		this.storage = platform.storage;
		this.avr = avr;
		this.log = platform.log;
		this.api = platform.api;
		this.avrId = config.id;
		this.id = `${config.id}_direct_switch`;
		this.name = config.name + " Direct";
		this.serial = this.id;
		this.model = config.model || "unknown";
		this.manufacturer = "Yamaha";
		this.displayName = this.name;

		this.UUID = this.api.hap.uuid.generate(this.id);
		this.log.easyDebug(`Creating New DIRECT SWITCH Accessory: "${this.name}"`);
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

		this.directService = this.accessory.addService(Service.Switch, this.name);

		this.directService
			.getCharacteristic(Characteristic.On)
			.on("get", this.getDirectState.bind(this))
			.on("set", this.setDirectState.bind(this));
	}

	getDirectState(callback) {
		this.avr
			.isPureDirectEnabled()
			.then((result) => callback(null, !!result))
			.catch((error) => callback(error));
	}

	setDirectState(on, callback) {
		this.avr
			.setPureDirect(!!on)
			.then(() => {
				this.log(`${this.name} - Pure Direct turned ${on ? "ON" : "OFF"}`);
				callback(null, !!on);
			})
			.catch((error) => callback(error));
	}
}

module.exports = DIRECT_SWITCH;
