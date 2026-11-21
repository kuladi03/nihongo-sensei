/**
 * Nihongo Sensei — Live Audio Utilities (audioLive.js)
 * Provides 16 kHz downsampling, 16-bit PCM little-endian conversion,
 * base64 audio decoding, and Web Audio constraint configurations.
 */

/**
 * Standard WebRTC microphone constraints for clear voice capture with noise reduction.
 */
export const getAudioConstraints = () => ({
  audio: {
    sampleRate: 16000,
    channelCount: 1,
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  },
});

/**
 * Convert Float32 audio samples (-1.0 to 1.0) into 16-bit signed PCM little-endian Uint8Array.
 */
export const floatTo16BitPCM = (float32Array) => {
  const buffer = new ArrayBuffer(float32Array.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Uint8Array(buffer);
};

/**
 * Downsample Float32 audio buffer from inputSampleRate to 16,000 Hz.
 */
export const downsampleTo16k = (buffer, inputSampleRate) => {
  if (inputSampleRate === 16000) return buffer;
  const ratio = inputSampleRate / 16000;
  const newLength = Math.round(buffer.length / ratio);
  const result = new Float32Array(newLength);
  let offsetResult = 0;
  let offsetBuffer = 0;
  while (offsetResult < result.length) {
    const nextOffsetBuffer = Math.round((offsetResult + 1) * ratio);
    let accum = 0;
    let count = 0;
    for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
      accum += buffer[i];
      count++;
    }
    result[offsetResult] = count > 0 ? accum / count : 0;
    offsetResult++;
    offsetBuffer = nextOffsetBuffer;
  }
  return result;
};

/**
 * Convert Uint8Array to binary base64 string efficiently.
 */
export const uint8ArrayToBase64 = (uint8Array) => {
  let binary = '';
  const len = uint8Array.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(uint8Array[i]);
  }
  return btoa(binary);
};

/**
 * Decode 16-bit little-endian PCM base64 string to Float32Array.
 */
export const decodePCMChunkToFloat32 = (base64Data) => {
  const binaryStr = atob(base64Data);
  const len = binaryStr.length;
  const numSamples = Math.floor(len / 2);
  if (numSamples === 0) return new Float32Array(0);

  const float32Data = new Float32Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const byte0 = binaryStr.charCodeAt(i * 2);
    const byte1 = binaryStr.charCodeAt(i * 2 + 1);
    let int16 = (byte1 << 8) | byte0;
    if (int16 >= 0x8000) int16 -= 0x10000;
    float32Data[i] = int16 / 32768.0;
  }
  return float32Data;
};
