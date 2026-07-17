import { readFile, writeFile } from "node:fs/promises";

const [, , inputPath, outputPath, requestedBins = "3422"] = process.argv;

if (!inputPath || !outputPath) {
  throw new Error("Usage: node scripts/generate-waveform-peaks.mjs <input.wav> <output.json> [bins]");
}

const buffer = await readFile(inputPath);
if (buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WAVE") {
  throw new Error(`${inputPath} is not a RIFF/WAVE file`);
}

let format;
let dataOffset;
let dataSize;
let offset = 12;

while (offset + 8 <= buffer.length) {
  const chunkId = buffer.toString("ascii", offset, offset + 4);
  const chunkSize = buffer.readUInt32LE(offset + 4);
  const chunkStart = offset + 8;
  if (chunkId === "fmt ") {
    format = {
      audioFormat: buffer.readUInt16LE(chunkStart),
      channels: buffer.readUInt16LE(chunkStart + 2),
      sampleRate: buffer.readUInt32LE(chunkStart + 4),
      bitsPerSample: buffer.readUInt16LE(chunkStart + 14),
    };
  } else if (chunkId === "data") {
    dataOffset = chunkStart;
    dataSize = chunkSize;
    break;
  }
  offset = chunkStart + chunkSize + (chunkSize % 2);
}

if (!format || dataOffset === undefined || dataSize === undefined) {
  throw new Error(`${inputPath} is missing WAV format or sample data`);
}
if (format.audioFormat !== 1 || format.bitsPerSample !== 16) {
  throw new Error("Peak generation currently supports 16-bit PCM WAV files");
}

const bins = Math.max(1, Number.parseInt(requestedBins, 10));
const bytesPerFrame = format.channels * 2;
const frameCount = Math.floor(dataSize / bytesPerFrame);
const framesPerBin = frameCount / bins;
const peaks = [];
let sumSquares = 0;
let absolutePeak = 0;
let sampleCount = 0;

for (let bin = 0; bin < bins; bin += 1) {
  const startFrame = Math.floor(bin * framesPerBin);
  const endFrame = Math.max(startFrame + 1, Math.floor((bin + 1) * framesPerBin));
  let minimum = 1;
  let maximum = -1;

  for (let frame = startFrame; frame < endFrame && frame < frameCount; frame += 1) {
    for (let channel = 0; channel < format.channels; channel += 1) {
      const sampleOffset = dataOffset + frame * bytesPerFrame + channel * 2;
      const sample = buffer.readInt16LE(sampleOffset) / 32768;
      minimum = Math.min(minimum, sample);
      maximum = Math.max(maximum, sample);
      absolutePeak = Math.max(absolutePeak, Math.abs(sample));
      sumSquares += sample * sample;
      sampleCount += 1;
    }
  }

  peaks.push([Number(minimum.toFixed(4)), Number(maximum.toFixed(4))]);
}

const rms = Math.sqrt(sumSquares / sampleCount);
const toDb = (value) => Number((20 * Math.log10(Math.max(value, 1e-9))).toFixed(1));
const result = {
  version: 1,
  duration: Number((frameCount / format.sampleRate).toFixed(3)),
  sampleRate: format.sampleRate,
  channels: format.channels,
  bins,
  meanDb: toDb(rms),
  maxDb: toDb(absolutePeak),
  nearSilent: absolutePeak < 0.01,
  peaks,
};

await writeFile(outputPath, `${JSON.stringify(result)}\n`);
console.log(`${outputPath}: ${bins} bins, mean ${result.meanDb} dB, max ${result.maxDb} dB`);
