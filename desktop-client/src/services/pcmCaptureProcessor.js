class PseudoVoicePcmCaptureProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.suppressed = false;
    this.port.onmessage = event => {
      if (event.data?.type === "capture-suppressed") {
        this.suppressed = Boolean(event.data.suppressed);
        this.offset = 0;
        this.speechDetected = false;
        this.silenceFrames = 0;
        this.preRoll.length = 0;
        return;
      }
      if (event.data?.type !== "flush") return;
      // Do not turn buffered silence into a second, empty transcription.
      if (this.offset > 0 && (this.speechDetected || this.serverVad) && !this.suppressed) {
        const tail = this.chunk.slice(0, this.offset);
        this.postAudio(this.toPcm(tail));
      }
      this.offset = 0;
      this.port.postMessage({ type: "flush-complete" });
    };
    const settings = options.processorOptions || {};
    this.chunkSize = settings.chunkSize || 2048;
    this.silenceFrameLimit = settings.silenceFrameLimit || 16;
    this.autoEnd = settings.autoEnd !== false;
    this.serverVad = settings.serverVad === true;
    this.speechThreshold = settings.speechThreshold || 0.014;
    this.chunk = new Float32Array(this.chunkSize);
    this.offset = 0;
    this.speechDetected = false;
    this.silenceFrames = 0;
    this.preRoll = [];
    this.preRollLimit = 2;
  }

  process(inputs, outputs) {
    const inputChannels = inputs[0];
    const input = inputChannels && inputChannels[0];
    const outputChannels = outputs[0];
    if (outputChannels) {
      for (const channel of outputChannels) channel.fill(0);
    }
    if (!input || this.suppressed) return true;

    let inputOffset = 0;
    while (inputOffset < input.length) {
      const count = Math.min(this.chunkSize - this.offset, input.length - inputOffset);
      // Pick the strongest channel for this quantum. Averaging stereo channels
      // can cancel speech when a virtual device provides opposite-phase audio.
      let strongestChannel = input;
      let strongestEnergy = -1;
      for (const channel of inputChannels) {
        let channelEnergy = 0;
        for (let sample = 0; sample < count; sample += 1) {
          const value = channel[inputOffset + sample] || 0;
          channelEnergy += value * value;
        }
        if (channelEnergy > strongestEnergy) {
          strongestEnergy = channelEnergy;
          strongestChannel = channel;
        }
      }
      this.chunk.set(strongestChannel.subarray(inputOffset, inputOffset + count), this.offset);
      this.offset += count;
      inputOffset += count;

      if (this.offset === this.chunkSize) {
        this.processChunk();
        this.offset = 0;
      }
    }

    return true;
  }

  processChunk() {
    if (this.serverVad) {
      this.postAudio(this.toPcm(this.chunk));
      return;
    }
    let energy = 0;
    for (let index = 0; index < this.chunk.length; index += 1) {
      energy += this.chunk[index] * this.chunk[index];
    }

    const rms = Math.sqrt(energy / this.chunk.length);
    const pcm = this.toPcm(this.chunk);
    if (rms >= this.speechThreshold) {
      if (!this.speechDetected) {
        // Include a short lead-in so initial consonants aren't clipped.
        for (const previous of this.preRoll) this.postAudio(previous);
        this.preRoll.length = 0;
      }
      this.speechDetected = true;
      this.silenceFrames = 0;
      this.postAudio(pcm);
    } else if (this.speechDetected) {
      this.silenceFrames += 1;
      this.postAudio(pcm);
      if (this.autoEnd && this.silenceFrames >= this.silenceFrameLimit) {
        this.port.postMessage({ type: "speech-end" });
        this.speechDetected = false;
        this.silenceFrames = 0;
      }
    } else {
      this.preRoll.push(pcm);
      if (this.preRoll.length > this.preRollLimit) this.preRoll.shift();
    }
  }

  toPcm(samples) {
    const pcm = new Int16Array(samples.length);
    for (let index = 0; index < samples.length; index += 1) {
      const sample = Math.max(-1, Math.min(1, samples[index]));
      pcm[index] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
    }
    return pcm;
  }

  postAudio(pcm) {
    const buffer = pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + pcm.byteLength);
    this.port.postMessage({ type: "audio", pcm: buffer }, [buffer]);
  }
}

registerProcessor("pseudovoice-pcm-capture", PseudoVoicePcmCaptureProcessor);
