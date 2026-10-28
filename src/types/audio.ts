export type AudioStatus = 'idle' | 'requesting' | 'live' | 'demo'

export type AudioErrorKind = 'denied' | 'insecure' | 'unsupported' | 'nodevice' | 'busy' | 'disconnected' | 'unknown'

export interface AudioError {
  kind: AudioErrorKind
  message: string
}

export interface InputDevice {
  deviceId: string
  label: string
}

export interface AudioState {
  status: AudioStatus
  error: AudioError | null
  devices: InputDevice[]
  activeDeviceLabel: string
  sampleRate: number
}

export const AUDIO_ERROR_COPY: Record<AudioErrorKind, { title: string; body: string }> = {
  denied: {
    title: 'Microphone access is blocked',
    body: 'Allow microphone access for this site in your browser’s address bar or site settings, then try again. You can also play the demo track.',
  },
  insecure: {
    title: 'The microphone needs a secure connection',
    body: 'Browsers only allow microphone access over HTTPS or on localhost. Open Aurora from a secure address, or play the demo track.',
  },
  unsupported: {
    title: 'This browser can’t capture audio',
    body: 'Microphone capture isn’t available here. Try a current version of Chrome, Edge, Firefox or Safari, or play the demo track.',
  },
  nodevice: {
    title: 'No microphone found',
    body: 'Connect a microphone or choose another input device, then try again.',
  },
  busy: {
    title: 'The microphone is in use',
    body: 'Another application is holding the microphone. Close it and try again.',
  },
  disconnected: {
    title: 'The microphone was disconnected',
    body: 'Capture stopped because the input device went away. Reconnect it and start again.',
  },
  unknown: {
    title: 'The microphone couldn’t start',
    body: 'Something went wrong while opening the audio input. Try again or play the demo track.',
  },
}
