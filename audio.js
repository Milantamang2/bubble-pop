export class GardenAudio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.ambient = null;
    this.effects = null;
    this.enabled = false;
    this.ambientLevel = 0.35;
    this.effectsLevel = 0.45;
    this.nodes = [];
  }

  async init() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") await this.ctx.resume();
      return;
    }
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const master = ctx.createGain();
    const ambient = ctx.createGain();
    const effects = ctx.createGain();

    ambient.gain.value = this.ambientLevel;
    effects.gain.value = this.effectsLevel;
    master.gain.value = 0.0001;

    ambient.connect(master);
    effects.connect(master);
    master.connect(ctx.destination);

    // A very soft filtered noise bed — no external audio asset required.
    const len = Math.floor(ctx.sampleRate * 3);
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      last = last * 0.987 + (Math.random() * 2 - 1) * 0.045;
      data[i] = last;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;
    const low = ctx.createBiquadFilter();
    low.type = "lowpass";
    low.frequency.value = 780;
    low.Q.value = 0.35;
    const wind = ctx.createGain();
    wind.gain.value = 0.16;

    noise.connect(low).connect(wind).connect(ambient);
    noise.start();
    this.nodes.push(noise);

    // Slow, high airy layer for atmosphere.
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.type = "sine";
    lfo.frequency.value = 0.09;
    lfoGain.gain.value = 0.06;
    lfo.connect(lfoGain).connect(wind.gain);
    lfo.start();
    this.nodes.push(lfo);

    this.ctx = ctx;
    this.master = master;
    this.ambient = ambient;
    this.effects = effects;

    await ctx.resume();
  }

  async setEnabled(on) {
    this.enabled = on;
    await this.init();
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setTargetAtTime(on ? 0.8 : 0.0001, now, 1.2);
  }

  setVolumes(ambient, effects) {
    this.ambientLevel = ambient;
    this.effectsLevel = effects;
    if (!this.ctx) return;
    this.ambient.gain.value = ambient;
    this.effects.gain.value = effects;
  }

  async effect(type) {
    if (!this.enabled) return;
    await this.init();
    const ctx = this.ctx;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const now = ctx.currentTime;

    const map = {
      water: [330, 392],
      flower: [440, 554],
      stone: [196, 247],
      firefly: [660, 784],
      leaf: [520, 620],
      plant: [360, 480]
    };
    const [a,b] = map[type] || map.leaf;

    osc.type = "sine";
    osc.frequency.setValueAtTime(a, now);
    osc.frequency.exponentialRampToValueAtTime(b, now + 0.18);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.075, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);

    osc.connect(gain).connect(this.effects);
    osc.start(now);
    osc.stop(now + 0.55);
  }
}
