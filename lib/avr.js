const Yamaha = require('yamaha-nodejs');
const Receiver = require('../accessories/Receiver')

module.exports = {
	init: async function() {

		await this.storage.init({
			dir: this.persistPath,
			forgiveParseErrors: true
		})

		this.cachedDevices = await this.storage.getItem('cachedDevices') || []
		this.cachedStates = await this.storage.getItem('cachedStates') || {}

		// remove cachedDevices that were removed from config
		this.cachedDevices = this.cachedDevices.filter(cachedDevice => 
			this.receivers.find(receiver => receiver.ip === cachedDevice.ip))

		for (const config of this.receivers) {

			if (!config.ip)
				continue
				
			// validate ipv4
			const IPV4 = new RegExp(/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/)
			if (!IPV4.test(config.ip)) {
				this.log(`"${config.ip}" is not a valid IPv4 address!!`)
				this.log(`skipping "${config.ip}" device...`)
				continue 
			}

			const avr = new Yamaha(config.ip)

			try {
				const systemConfig = await avr.getSystemConfig().YAMAHA_AV.System[0].Config[0]
				this.log.easyDebug('Got System Config:')
				this.log.easyDebug(JSON.stringify(systemConfig))
				config.id = systemConfig.System_ID[0]
				config.features = systemConfig.Feature_Existence[0]
				config.inputs = systemConfig.Name[0].Input[0]
				this.log(`Found AVR "Yamaha ${systemConfig.Model_Name[0]}" at ${config.ip}`)
				
			} catch(err) {
				this.log(`Could not detect receiver at ${config.ip}!`)
				this.log(`Control may not work, check your receiver network connection`)
				this.log.easyDebug(err.message)

			}

			// get device from cache if exists
			let deviceConfig = this.cachedDevices.find(device => device.id === config.id || device.ip === config.ip)

			if (deviceConfig) {
				// Update dynamic config params
				deviceConfig.main.volume.type = config.volumeAccessory
				deviceConfig.main.minVolume = typeof config.minVolume === 'number' ? config.minVolume : -80
				deviceConfig.main.maxVolume = typeof config.maxVolume === 'number' ? config.maxVolume : -10
				for (const i in [2,3,4]) {
					if (deviceConfig[`zone${i}`]) {
						deviceConfig[`zone${i}`].active = config[`enableZone${i}`]
						deviceConfig[`zone${i}`].minVolume = typeof config[`zone${i}MinVolume`] === 'number' ? config[`zone${i}MinVolume`] : -80
						deviceConfig[`zone${i}`].maxVolume = typeof config[`zone${i}MaxVolume`] === 'number' ? config[`zone${i}MaxVolume`] : -10
						deviceConfig.zone4.volume.type = config.volumeAccessory

					}
				}
			} else {
				if (!config.id) {
					this.log(`Can't create new accessory for undetected device (${config.ip}) !`)
					this.log(`skipping "${config.ip}" device...`)
					continue
				}

				// Create config for new device
				try {
					const availableInputs = getInputs(config)
					deviceConfig = await createNewConfig(config, avr, availableInputs, this.log)
					this.cachedDevices.push(deviceConfig)
					this.log.easyDebug(`Full Device Config: ${JSON.stringify(deviceConfig)}`)
					// init avr accessories
					newAVR(avr, deviceConfig, this)
				} catch(err) {
					this.log.easyDebug(err)
					continue
				}
			}
		}

		// update cachedDevices storage
		await this.storage.setItem('cachedDevices', this.cachedDevices)

	}
}

const createNewConfig = async (config, avr, availableInputs, log) => {

	try {
		const newConfig = {
			ip: config.ip,
			id: config.id,
			main: {
				name: await getZoneName(avr, 'Main_Zone'),
				inputs: mapInputs(availableInputs),
				minVolume: typeof config.minVolume === 'number' ? config.minVolume : -80,
				maxVolume: typeof config.maxVolume === 'number' ? config.maxVolume : -10,
				volume: {
					name: '',
					type: config.volumeAccessory
				},
			}
		}
		for (const i in [2,3,4]) {
			if (config.features[`Zone_${i}`][0] === '1') {
				log.easyDebug(`Zone ${i} Available!`)
				newConfig[`zone${i}`] = {
					active: config[`enableZone${i}`],
					name: await getZoneName(avr, `Zone_${i}`),
					inputs: mapInputs(availableInputs),
					minVolume: typeof config[`zone${i}MaVolume`] === 'number' ? config[`zone${i}MaxVolume`] : -80,
					maxVolume: typeof config[`zone${i}MaxVolume`] === 'number' ? config[`zone${i}MaxVolume`] : -10,
					volume: {
						name: '',
						type: config.volumeAccessory
					}
				}
			}
		}

		return newConfig

	} catch(err) {
		log('ERROR Creating config', err.message)
		throw err
	}
}

const getZoneConfig = (config, zone) => {
	return {
		ip: config.ip,
		id: config.id,
		avrName: config.main.name,
		name: config[zone].name,
		zone: zone,
		model: config.info.modelName,
		inputs: config[zone].inputs,
		volume: config[zone].volume,
		minVolume: config[zone].minVolume,
		maxVolume: config[zone].maxVolume
	}
}

const newAVR = function(avr, deviceConfig, platform) {
	// add main zone
	new Receiver(avr, platform, getZoneConfig(deviceConfig, 'main'))


	for (const i in [2,3,4]) {
		// add zones
		if (deviceConfig[`zone${i}`] && deviceConfig[`zone${i}`] .active) {
			platform.log.easyDebug(`Adding Zone ${i} for ${deviceConfig.main.name}`)
			new Receiver(avr, platform, getZoneConfig(deviceConfig, i))
		}
	}
}

const getZoneName = async function(avr, zone) {
	return avr.getZoneConfig(zone)
		.then(config => {
			this.log.easyDebug(`Got ${zone} config:`)
			this.log.easyDebug(JSON.stringify(config))
			return config.YAMAHA_AV[zone][0].Config[0].Name[0].Zone[0]
		})
}

const getInputs = function(config) {
	const availableInputs = []

	// iterate through all inputs
	for (const key in config.inputs) {       
		availableInputs.push({
			key: syncKey(key),
			name: config.inputs[key]
		})
	}

	// iterate through all features
	for (const key in config.features) {
		const syncedKey = syncKey(key)
		const inputExists = availableInputs.find(input => input.key === syncedKey)
		// Only return inputs that the receiver supports, skip existing, skip Zone entries and USB since it's already in the input list
		if (!inputExists && !(key.includes('one')) && !(key.includes('USB')) && config.features[key][0] === '1') {   
			availableInputs.push({
				key: syncedKey,
				name: syncedKey
			})
		}
	}

	this.log.easyDebug('Available Inputs:')
	this.log.easyDebug(availableInputs)
	return availableInputs
}


const syncKey = function(key) {
	if (key === 'NET_RADIO') 
		return 'NET RADIO'
	
	if (key === 'V_AUX')
		return 'V-AUX';

	if (key === 'Tuner') 
		return 'TUNER';
		
	return key.replace('_', '')
  
}

const mapInputs = function(inputs) {
	return inputs.map((input, i) => { 
		return {identifier: i, name: input.name, key: input.key, hidden: 0 }
	})
}