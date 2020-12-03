let Characteristic, Service
const stateManager = require('../lib/stateManager')

class AUDIO_RECEIVER {
	constructor(avr, platform, config) {

		Service = platform.api.hap.Service
		Characteristic = platform.api.hap.Characteristic
		
		this.storage = platform.storage
		this.avr = avr
		this.log = platform.log
		this.api = platform.api
		this.avrId = config.id
		this.id = `${config.id}_zone${config.zone}`
		this.zone = config.zone
		this.name = config.name
		this.serial = this.id
		this.model = config.model || 'unknown'
		this.manufacturer = 'Yamaha'
		this.displayName = this.name
		this.inputs = config.inputs
		this.minVolume = config.minVolume
		this.maxVolume = config.maxVolume
		this.volume = config.volume
		if (!this.volume.name)
			this.volume.name = `${this.name} Volume`


		this.cachedStates = platform.cachedStates
		this.cachedDevices = platform.cachedDevices
		this.cachedDevice = this.cachedDevices.find(cachedDevice => cachedDevice.id === this.avrId)
		
		this.processing = false

		this.UUID = this.api.hap.uuid.generate(this.id)
		this.log.easyDebug(`Creating New AUDIO RECEIVER Accessory: "${this.name}"`)
		this.accessory = new this.api.platformAccessory(this.name, this.UUID, this.api.hap.Accessory.Categories.AUDIO_RECEIVER)


		let informationService = this.accessory.getService(Service.AccessoryInformation)

		if (!informationService)
			informationService = this.accessory.addService(Service.AccessoryInformation)

		informationService
			.setCharacteristic(Characteristic.Manufacturer, this.manufacturer)
			.setCharacteristic(Characteristic.Model, this.model)
			.setCharacteristic(Characteristic.SerialNumber, this.serial)

		
		this.setServices()
			.then(() => {
				this.api.publishExternalAccessories(platform.PLUGIN_NAME, [this.accessory])
				setInterval(this.updateState.bind(this), platform.statePollingInterval * 1000)
			})
			.catch(err => {
				this.log('ERROR setting services')
				this.log(err)
			}) 

    
	}

	async setServices() {
		this.state = await stateManager.getState.bind(this)()

		this.tvService = this.accessory.addService(Service.Television, this.name)

		this.tvService.getCharacteristic(Characteristic.ConfiguredName)
			.on('set', (name, callback) => {
				this.log.easyDebug(`Setting new ConfiguredName: from ${this.name} to ${name}`)
				this.cachedDevice[`zone${this.zone}`].name = name
				this.storage.setItem('cachedDevices', this.cachedDevices)
				callback()
			}).updateValue(this.name)

		this.tvService.getCharacteristic(Characteristic.Active)
			.on('set', stateManager.set.Active.bind(this))
			.updateValue(this.state.power)
			

		this.tvService.getCharacteristic(Characteristic.ActiveIdentifier)
			.on('set', stateManager.set.ActiveIdentifier.bind(this))
			.updateValue(this.state.source)


		this.tvService.getCharacteristic(Characteristic.RemoteKey)
			.on('set', stateManager.set.RemoteKey.bind(this))

		this.tvService.setCharacteristic(Characteristic.SleepDiscoveryMode, 1)

		// Set inputs
		this.inputs.forEach(input => {
			this.log.easyDebug(`${this.name} - Adding INPUT: ${input.name}`)
			const inputUUID = this.api.hap.uuid.generate(this.id + input.key)
			const inputService = this.accessory.addService(Service.InputSource, input.name, inputUUID)
				.setCharacteristic(Characteristic.Identifier, input.identifier)
				.setCharacteristic(Characteristic.IsConfigured, 1)
				.setCharacteristic(Characteristic.InputSourceType, 0)
				.setCharacteristic(Characteristic.InputDeviceType, 0)
				.setCharacteristic(Characteristic.CurrentVisibilityState, input.hidden)

			inputService.getCharacteristic(Characteristic.TargetVisibilityState)
				.on('set', (hidden, callback) => {
					this.log.easyDebug(`${this.name} - Setting new input Visibility State to ${hidden ? 'HIDDEN' : 'VISIBLE'}`)
					inputService.getCharacteristic(Characteristic.CurrentVisibilityState).updateValue(hidden)
					input.hidden = hidden
					this.storage.setItem('cachedDevices', this.cachedDevices)
					callback()
				})
				.updateValue(input.hidden)

			inputService.getCharacteristic(Characteristic.ConfiguredName)
				.on('set', (name, callback) => {
					this.log.easyDebug(`${this.name} - Setting new input ConfiguredName: from ${input.name} to ${name}`)
					input.name = name
					this.storage.setItem('cachedDevices', this.cachedDevices)
					callback()
				})
				.updateValue(input.name)

			this.tvService.addLinkedService(inputService)
		})

		// Set volume service
		this.speakerService = this.accessory.addService(Service.TelevisionSpeaker)
			.setCharacteristic(Characteristic.Active, 1)
			.setCharacteristic(Characteristic.VolumeControlType, Characteristic.VolumeControlType.RELATIVE_WITH_CURRENT)

		this.speakerService.getCharacteristic(Characteristic.Volume)
			.on('set',stateManager.set.Volume.bind(this))
			.updateValue(this.state.volume)

		this.speakerService.getCharacteristic(Characteristic.Mute)
			.on('set',stateManager.set.Mute.bind(this))
			.updateValue(this.state.mute)

		this.speakerService.getCharacteristic(Characteristic.VolumeSelector)
			.on('set', stateManager.set.VolumeSelector.bind(this))

		switch(this.volume.type) {
			case 'bulb':
				this.addBulbService()
				break;
			case 'fan':
				this.addFanService()
				break;
			// case 'speaker':
			// 	this.addSmartSpeakerService()
			// 	break;
		}

	}

	addBulbService() {
		this.log.easyDebug(`Adding Volume Bulb Service for ${this.name}`)
		this.bulbService = this.accessory.addService(Service.Lightbulb, this.volume.name)

		this.bulbService.getCharacteristic(Characteristic.On)
			.on('set',stateManager.set.ExternalMute.bind(this))
			.updateValue(!this.state.mute)

		this.bulbService.getCharacteristic(Characteristic.Brightness)
			.on('set',stateManager.set.ExternalVolume.bind(this))
			.updateValue(this.state.volume)

		this.bulbService.getCharacteristic(Characteristic.ConfiguredName)
			.on('set', (name, callback) => {
				this.log.easyDebug(`${this.name} - Setting new Volume Accessory ConfiguredName: from ${this.volume.name} to ${name}`)
				this.volume.name = name
				this.storage.setItem('cachedDevices', this.cachedDevices)
				callback()
			})
			.updateValue(this.volume.name)
	}

	addFanService() {
		this.log.easyDebug(`Adding Volume Fan Service for ${this.name}`)
		this.fanService = this.accessory.addService(Service.Fan, this.volume.name)

		this.fanService.getCharacteristic(Characteristic.On)
			.on('set',stateManager.set.ExternalMute.bind(this))
			.updateValue(!this.state.mute)

		this.fanService.getCharacteristic(Characteristic.RotationSpeed)
			.on('set',stateManager.set.ExternalVolume.bind(this))
			.updateValue(this.state.volume)

		this.fanService.getCharacteristic(Characteristic.ConfiguredName)
			.on('set', (name, callback) => {
				this.log.easyDebug(`${this.name} - Setting new Volume Accessory ConfiguredName: from ${this.volume.name} to ${name}`)
				this.volume.name = name
				this.storage.setItem('cachedDevices', this.cachedDevices)
				callback()
			})
			.updateValue(this.volume.name)
	}

	addSmartSpeakerService() {

		this.log.easyDebug(`Adding Volume Smart Speaker Service for ${this.name}`)
		this.smartSpeakerService = this.accessory.addService(Service.SmartSpeaker, this.volume.name)

		this.smartSpeakerService
			.setCharacteristic(Characteristic.CurrentMediaState, 2)
			.setCharacteristic(Characteristic.TargetMediaState, 2)
			
		this.smartSpeakerService.getCharacteristic(Characteristic.Mute)
			.on('set',stateManager.set.ExternalMute.bind(this))
			.updateValue(this.state.mute)
		
		this.smartSpeakerService.getCharacteristic(Characteristic.Volume)
			.on('set',stateManager.set.ExternalVolume.bind(this))
			.updateValue(this.state.volume)
			
		this.smartSpeakerService.getCharacteristic(Characteristic.ConfiguredName)
			.on('set', (name, callback) => {
				this.log.easyDebug(`${this.name} - Setting new Volume Accessory ConfiguredName: from ${this.volume.name} to ${name}`)
				this.volume.name = name
				this.storage.setItem('cachedDevices', this.cachedDevices)
				callback()
			})
			.updateValue(this.volume.name)

	}

	async updateState() {

		if (!this.processing) {
			this.processing = true
			this.state = await stateManager.getState.bind(this)()

			this.tvService.getCharacteristic(Characteristic.Active).updateValue(this.state.power)
			this.tvService.getCharacteristic(Characteristic.ActiveIdentifier).updateValue(this.state.source)
			this.speakerService.getCharacteristic(Characteristic.Volume).updateValue(this.state.volume)
			this.speakerService.getCharacteristic(Characteristic.Mute).updateValue(this.state.mute)

			switch(this.volume.type) {
				case 'bulb':
					this.bulbService.getCharacteristic(Characteristic.On).updateValue(!this.state.mute)
					this.bulbService.getCharacteristic(Characteristic.Brightness).updateValue(this.state.volume)
					break;
				case 'fan':
					this.fanService.getCharacteristic(Characteristic.On).updateValue(!this.state.mute)
					this.fanService.getCharacteristic(Characteristic.RotationSpeed).updateValue(this.state.volume)
					break;
				// case 'speaker':
				// 	this.smartSpeakerService.getCharacteristic(Characteristic.Mute).updateValue(this.state.mute)
				// 	this.smartSpeakerService.getCharacteristic(Characteristic.Volume).updateValue(this.state.volume)
				// 	break;
			}
			setTimeout(() => {
				this.processing = false
			}, 1000)
		}
	}
}


module.exports = AUDIO_RECEIVER