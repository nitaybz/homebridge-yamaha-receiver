module.exports = {

	getState: async function() {
		this.log.easyDebug(`${this.name} - Getting State`)
		try {
			const basicInfo = await this.avr.getBasicInfo(this.zone)
			const currentInput = this.inputs.find(input => input.key === basicInfo.getCurrentInput())
			const inputIdentifier = currentInput ? currentInput.identifier : 0

			const state = {
				power: basicInfo.isOn() ? 1 : 0,
				volume: formatVolumeToHK(basicInfo.getVolume(), this.minVolume, this.maxVolume),
				mute: basicInfo.isMuted(),
				source: inputIdentifier
			}
			
			this.log.easyDebug(`${this.name} - Got New State: ${JSON.stringify(state)}`)
			this.cachedStates[this.id] = state
			await this.storage.setItem('cachedStates', this.cachedStates)
			return state

		} catch(err) {
			this.log(`Could NOT get state from "${this.name}" : ${err.message}`)
			// this.log.easyDebug(err)

			if (this.id in this.cachedStates) {
				this.log.easyDebug(`${this.name} - found cached state in storage`)
				return this.cachedStates[this.id]
			} else {
				this.log.easyDebug(`${this.name} - Returning default values -> please check your network connection`)
				return {
					power: 0,
					volume: 0,
					mute: false,
					source: 0
				}
			}
		}
	},

	set: {

		Active: function(state, callback) {
			if (state) {
				this.log(`${this.name}  - Turning ON`)
				this.avr.powerOn(this.zone)
			} else {
				this.log(`${this.name} - Turning OFF`)
				this.avr.powerOff(this.zone)
			}

			setTimeout(() => {
				this.updateState()
			}, 2000)
			callback()
		},

		ActiveIdentifier: async function(identifier, callback) {
			const source = this.inputs.find(input => input.identifier === identifier).key
			this.log(`${this.name} - Setting Source to "${source}"`)
			callback()

			if (!this.state.power)
				await this.avr.powerOn(this.zone)

			this.avr.setInputTo(source, this.zone)
			setTimeout(() => {
				this.updateState()
			}, 2000)
			
		},

		RemoteKey: function(key, callback) {
			const RemoteKey = this.api.hap.Characteristic.RemoteKey
			switch (key) {
				case RemoteKey.ARROW_UP:
					this.log(`${this.name} - Sending Remote Key: "UP"`)
					this.avr.remoteCursor('Up')
					break;
				case RemoteKey.ARROW_DOWN:
					this.log(`${this.name} - Sending Remote Key: "DOWN"`)
					this.avr.remoteCursor('Down')
					break;
				case RemoteKey.ARROW_RIGHT:
					this.log(`${this.name} - Sending Remote Key: "RIGHT"`)
					this.avr.remoteCursor('Right')
					break;
				case RemoteKey.ARROW_LEFT:
					this.log(`${this.name} - Sending Remote Key: "LEFT"`)
					this.avr.remoteCursor('Left')
					break;
				case RemoteKey.SELECT:
					this.log(`${this.name} - Sending Remote Key: "SELECT"`)
					this.avr.remoteCursor('Sel')
					break;
				case RemoteKey.BACK:
					this.log(`${this.name} - Sending Remote Key: "BACK"`)
					this.avr.remoteCursor('Return')
					break;
				case RemoteKey.INFORMATION:
					this.log(`${this.name} - Sending Remote Key: "MENU"`)
					this.avr.remoteMenu('On Screen')
					break;
				case RemoteKey.PLAY_PAUSE:
					this.log(`${this.name} - PLAY/PAUSE command is not available`)
					break;
				default:
			}
			callback()
		},

		Volume: function(volume, callback) {
			this.log(`${this.name} - Setting Volume to ${volume}`)
			const mappedVolume = formatVolumeToYamaha(volume, this.minVolume, this.maxVolume)
			this.log.easyDebug(`${this.name} - Formatted Yamaha Volume: ${mappedVolume}`)
			this.avr.setVolumeTo(mappedVolume, this.zone)
			
			setTimeout(() => {
				this.updateState()
			}, 2000)
			callback()
		},

		Mute: function(mute, callback) {
			if (mute) {
				this.log(`${this.name} - Setting Mute ON`)
				this.avr.muteOn(this.zone)
			} else if (this.state.mute){
				this.log(`${this.name} - Setting Mute OFF`)
				this.avr.muteOff(this.zone)
			}
			
			setTimeout(() => {
				this.updateState()
			}, 2000)
			callback()
		},

		VolumeSelector: function(decrement, callback) {
			if (decrement) {
				this.log(`${this.name} - Decrementing Volume by 1`)
				this.avr.volumeDown(10, this.zone)
			} else {
				this.log(`${this.name} - Incrementing Volume by 1`)
				this.avr.volumeUp(10, this.zone)
			}
			
			setTimeout(() => {
				this.updateState()
			}, 2000)
			callback()
		},

		ExternalVolume: function(volume, callback) {
			this.log(`${this.name} (Ext.) - Setting Volume to ${volume}`)
			const mappedVolume = formatVolumeToYamaha(volume, this.minVolume, this.maxVolume)
			this.log.easyDebug(`${this.name} (Ext.) - Formatted Yamaha Volume: ${mappedVolume}`)
			this.avr.setVolumeTo(mappedVolume, this.zone)

			setTimeout(() => {
				this.updateState()
			}, 2000)
			callback()
		},

		ExternalMute: function(unmute, callback) {
			if (!unmute) {
				this.log(`${this.name} (Ext.) - Setting Mute ON`)
				this.avr.muteOn(this.zone)
			} else if (this.state.mute) {
				this.log(`${this.name} (Ext.) - Setting Mute OFF`)
				this.avr.muteOff(this.zone)
			}
			
			setTimeout(() => {
				this.updateState()
			}, 2000)
			callback()
		}
	}
}

const formatVolumeToHK = function(volume, min, max) {
	volume = volume !== 0 ? volume / 10 : 0
	if (volume <= min)
		return 0
	if (volume >= max)
		return 100

	return Math.round(100 * (volume - min) / (max - min))
}


const formatVolumeToYamaha = function(volume, min, max) {
	return Math.round(volume / 100 * (max - min) + min) * 10
}