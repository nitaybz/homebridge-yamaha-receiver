const AVR = require('./lib/avr')
const PLUGIN_NAME = 'homebridge-yamaha-receiver'
const PLATFORM_NAME = 'YamahaReceiver'
const storage = require('node-persist')
const path = require('path')

module.exports = (api) => {
	api.registerPlatform(PLUGIN_NAME, PLATFORM_NAME, YamahaReceiver)
}

class YamahaReceiver {

	constructor(log, config, api) {
		this.api = api
		this.log = log
		this.storage = storage

		// this.accessories = []
		this.avrDevices = []
		this.PLUGIN_NAME = PLUGIN_NAME
		this.PLATFORM_NAME = PLATFORM_NAME
		this.name = config.name || PLATFORM_NAME
		// this.discovery = config.discovery
		this.receivers = config.receivers || []
		this.statePollingInterval = config.statePollingInterval
		if (this.statePollingInterval < 3)
			this.statePollingInterval = 3
		this.debug = config.debug || false
		this.persistPath = path.join(this.api.user.persistPath(), '/../yamaha-receiver-persist')

		
		// define debug method to output debug logs when enabled in the config
		this.log.easyDebug = (...content) => {
			if (this.debug) {
				this.log(content.reduce((previous, current) => {
					return previous + ' ' + current
				}))
			} else
				this.log.debug(content.reduce((previous, current) => {
					return previous + ' ' + current
				}))
		}

		this.api.on('didFinishLaunching', AVR.init.bind(this))

	}

	configureAccessory(accessory) {
		this.log.easyDebug(`Found Cached Accessory: ${accessory.displayName} (${accessory.context.deviceId}) `)
		// this.accessories.push(accessory)
	}
}