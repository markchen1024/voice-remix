import Meyda from "meyda";

export type MeydaFrameSet = {
  frameSize: number;
  frames: Float32Array;
  framesPerBar: number;
  sampleRate: number;
  totalBars: number;
};

export type MeydaBarFeature = {
  brightness: number;
  chroma: number[];
  density: number;
  energy: number;
  timbre: number[];
};

export type MeydaStructureResult = {
  bars: MeydaBarFeature[];
  confidence: number;
  method: "meyda-bar-features";
};

function amplitudeToDb(amplitude: number) {
  return 20 * Math.log10(Math.max(1e-8, amplitude));
}

function normalized(values: number[]) {
  if (!values.length) return [];
  const ordered = [...values].sort((left, right) => left - right);
  const low = ordered[Math.floor((ordered.length - 1) * 0.1)];
  const high = ordered[Math.floor((ordered.length - 1) * 0.9)];
  const range = Math.max(1e-8, high - low);
  return values.map((value) => Math.max(0, Math.min(1, (value - low) / range)));
}

function normalizedColumns(rows: number[][]) {
  const width = Math.max(0, ...rows.map((row) => row.length));
  const columns = Array.from({ length: width }, (_, column) => normalized(rows.map((row) => row[column] ?? 0)));
  return rows.map((_, row) => columns.map((column) => column[row] ?? 0));
}

function normalizedChroma(values: number[]) {
  const peak = Math.max(1e-8, ...values.map((value) => Math.abs(value)));
  return values.map((value) => Math.max(0, value / peak));
}

function spread(values: number[]) {
  return values.length ? Math.max(...values) - Math.min(...values) : 0;
}

export function analyzeMeydaFrameSet(input: MeydaFrameSet): MeydaStructureResult {
  const { frameSize, frames, framesPerBar, sampleRate, totalBars } = input;
  if (frameSize < 512 || frameSize & (frameSize - 1)) throw new Error("Meyda frames must use a power-of-two size of at least 512 samples.");
  if (frames.length !== totalBars * framesPerBar * frameSize) throw new Error("Meyda frame payload length does not match its bar grid.");

  Meyda.bufferSize = frameSize;
  Meyda.sampleRate = sampleRate;
  Meyda.melBands = 26;
  Meyda.chromaBands = 12;
  Meyda.numberOfMFCCCoefficients = 13;
  Meyda.windowingFunction = "hanning";

  const rawBars: { brightness: number; chroma: number[]; density: number; energy: number; timbre: number[] }[] = [];
  let previousSpectrum: Float32Array | undefined;

  for (let bar = 0; bar < totalBars; bar += 1) {
    let rms = 0;
    let centroid = 0;
    let flux = 0;
    let flatness = 0;
    const chroma = Array.from({ length: 12 }, () => 0);
    const timbre = Array.from({ length: 6 }, () => 0);

    for (let frameIndex = 0; frameIndex < framesPerBar; frameIndex += 1) {
      const offset = (bar * framesPerBar + frameIndex) * frameSize;
      const frame = frames.subarray(offset, offset + frameSize);
      const features = Meyda.extract(
        ["rms", "spectralCentroid", "spectralFlatness", "amplitudeSpectrum", "chroma", "mfcc"],
        frame,
      );
      if (!features) continue;
      rms += features.rms ?? 0;
      centroid += features.spectralCentroid ?? 0;
      flatness += features.spectralFlatness ?? 0;
      if (features.amplitudeSpectrum && previousSpectrum) {
        let positiveDifference = 0;
        for (let bin = 0; bin < features.amplitudeSpectrum.length; bin += 1) {
          positiveDifference += Math.max(0, features.amplitudeSpectrum[bin] - (previousSpectrum[bin] ?? 0));
        }
        flux += positiveDifference / Math.max(1, features.amplitudeSpectrum.length);
      }
      previousSpectrum = features.amplitudeSpectrum;
      features.chroma?.forEach((value, index) => { if (index < chroma.length) chroma[index] += value; });
      features.mfcc?.slice(1, 7).forEach((value, index) => { timbre[index] += value; });
    }

    const divisor = Math.max(1, framesPerBar);
    rawBars.push({
      energy: amplitudeToDb(rms / divisor),
      density: flux / divisor + flatness / divisor * 0.15,
      brightness: centroid / divisor,
      chroma: normalizedChroma(chroma.map((value) => value / divisor)),
      timbre: timbre.map((value) => value / divisor),
    });
  }

  const energy = normalized(rawBars.map((bar) => bar.energy));
  const density = normalized(rawBars.map((bar) => bar.density));
  const brightness = normalized(rawBars.map((bar) => bar.brightness));
  const timbre = normalizedColumns(rawBars.map((bar) => bar.timbre));
  const chromaVariation = rawBars.length > 1
    ? rawBars.slice(1).reduce((sum, bar, index) => sum + bar.chroma.reduce((distance, value, pitch) => distance + Math.abs(value - rawBars[index].chroma[pitch]), 0) / 12, 0) / (rawBars.length - 1)
    : 0;
  const confidence = Math.max(0.45, Math.min(0.96,
    0.48 + spread(energy) * 0.2 + spread(density) * 0.12 + spread(brightness) * 0.06 + Math.min(0.1, chromaVariation * 0.22),
  ));

  return {
    bars: rawBars.map((bar, index) => ({
      energy: energy[index] ?? 0,
      density: density[index] ?? 0,
      brightness: brightness[index] ?? 0,
      chroma: bar.chroma,
      timbre: timbre[index] ?? [],
    })),
    confidence,
    method: "meyda-bar-features",
  };
}
