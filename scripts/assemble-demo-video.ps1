param(
  [switch]$Draft
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$videoRoot = Join-Path $repoRoot "videos"
$speechRoot = Join-Path $repoRoot "output\speech"
$sceneRoot = Join-Path $repoRoot "tmp\video-final\scenes"
$outputName = if ($Draft) { "voice-remix-build-week-draft.mp4" } else { "voice-remix-build-week-final.mp4" }
$outputPath = Join-Path $videoRoot $outputName
$preset = if ($Draft) { "veryfast" } else { "medium" }
$crf = if ($Draft) { "24" } else { "18" }

New-Item -ItemType Directory -Path $sceneRoot -Force | Out-Null

function Invoke-FFmpeg {
  param([string[]]$Arguments)
  & ffmpeg -hide_banner -loglevel warning -y @Arguments
  if ($LASTEXITCODE -ne 0) { throw "ffmpeg failed with exit code $LASTEXITCODE" }
}

function VideoArgs {
  @("-c:v", "libx264", "-preset", $preset, "-crf", $crf, "-pix_fmt", "yuv420p", "-r", "30", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2", "-movflags", "+faststart")
}

$duck = "sidechaincompress=threshold=0.02:ratio=10:attack=15:release=300"
$voice = "aresample=48000,loudnorm=I=-16:LRA=7:TP=-1.5"

# 01 — problem and real multitrack playback.
$scene = Join-Path $sceneRoot "01.mp4"
$filter = "[0:v]fps=30,format=yuv420p,setpts=PTS-STARTPTS[v];[0:a]aresample=48000,volume=0.7[bg];[1:a]adelay=500|500,$voice,apad,atrim=0:17[narr0];[narr0]asplit=2[narrsc][narrmix];[bg][narrsc]$duck[ducked];[ducked][narrmix]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.95,apad,atrim=0:17[a]"
Invoke-FFmpeg (@("-ss", "1", "-t", "17", "-i", (Join-Path $videoRoot "01-problem-and-playback.mkv"), "-i", (Join-Path $speechRoot "01-problem.wav"), "-filter_complex", $filter, "-map", "[v]", "-map", "[a]") + (VideoArgs) + @($scene))

# 02 — import choices and the nine-stem project.
$scene = Join-Path $sceneRoot "02.mp4"
$filter = "[0:v]fps=30,format=yuv420p,setpts=PTS-STARTPTS[v];[0:a]aresample=48000,volume=0.7[bg];[1:a]adelay=400|400,$voice,apad,atrim=0:19[narr0];[narr0]asplit=2[narrsc][narrmix];[bg][narrsc]$duck[ducked];[ducked][narrmix]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.95,apad,atrim=0:19[a]"
Invoke-FFmpeg (@("-ss", "0.5", "-t", "19", "-i", (Join-Path $videoRoot "02-real-audio-import.mkv"), "-i", (Join-Path $speechRoot "02-real-audio.wav"), "-filter_complex", $filter, "-map", "[v]", "-map", "[a]") + (VideoArgs) + @($scene))

# 03 — narration, genuine live request, then the genuine assistant reply.
$scene = Join-Path $sceneRoot "03.mp4"
$filter = "[0:v]fps=30,format=yuv420p,setpts=PTS-STARTPTS[v];[0:a]aresample=48000,volume=0.9[bg];[1:a]adelay=500|500,$voice,apad,atrim=0:33[n1];[2:a]adelay=16000|16000,$voice,apad,atrim=0:33[n2];[n1][n2]amix=inputs=2:duration=longest:normalize=0[narr0];[narr0]asplit=2[narrsc][narrmix];[bg][narrsc]$duck[ducked];[ducked][narrmix]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.95,apad,atrim=0:33[a]"
Invoke-FFmpeg (@("-ss", "0.5", "-t", "33", "-i", (Join-Path $videoRoot "03-live-voice-request.mkv"), "-i", (Join-Path $speechRoot "03-voice-intro.wav"), "-i", (Join-Path $speechRoot "04-after-live-request.wav"), "-filter_complex", $filter, "-map", "[v]", "-map", "[a]") + (VideoArgs) + @($scene))

# 04 — inspect the Music Diff and hear Current versus Proposed.
$scene = Join-Path $sceneRoot "04.mp4"
$filter = "[0:v]fps=30,format=yuv420p,setpts=PTS-STARTPTS[v];[0:a]aresample=48000,volume=0.75[bg];[1:a]adelay=400|400,$voice,apad,atrim=0:27[narr0];[narr0]asplit=2[narrsc][narrmix];[bg][narrsc]$duck[ducked];[ducked][narrmix]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.95,apad,atrim=0:27[a]"
Invoke-FFmpeg (@("-ss", "0.2", "-t", "27", "-i", (Join-Path $videoRoot "04-compare-and-apply-edit.mkv"), "-i", (Join-Path $speechRoot "05-music-diff.wav"), "-filter_complex", $filter, "-map", "[v]", "-map", "[a]") + (VideoArgs) + @($scene))

# 05 — selective apply, Undo, and Redo.
$scene = Join-Path $sceneRoot "05.mp4"
$filter = "[0:v]fps=30,format=yuv420p,setpts=PTS-STARTPTS[v];[0:a]aresample=48000,volume=0.75[bg];[1:a]adelay=500|500,$voice,apad,atrim=0:20.8[narr0];[narr0]asplit=2[narrsc][narrmix];[bg][narrsc]$duck[ducked];[ducked][narrmix]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.95,apad,atrim=0:20.8[a]"
Invoke-FFmpeg (@("-ss", "0.5", "-t", "20.8", "-i", (Join-Path $videoRoot "05-undo-and-export.mkv"), "-i", (Join-Path $speechRoot "06-preview-apply.wav"), "-filter_complex", $filter, "-map", "[v]", "-map", "[a]") + (VideoArgs) + @($scene))

# 06 — export and successful download; hold the final frame for the sentence ending.
$scene = Join-Path $sceneRoot "06.mp4"
$filter = "[0:v]fps=30,tpad=stop_mode=clone:stop_duration=1.6,trim=0:14.5,format=yuv420p,setpts=PTS-STARTPTS[v];[0:a]aresample=48000,volume=0.45,apad,atrim=0:14.5[bg];[1:a]adelay=200|200,$voice,apad,atrim=0:14.5[narr0];[narr0]asplit=2[narrsc][narrmix];[bg][narrsc]$duck[ducked];[ducked][narrmix]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.95,apad,atrim=0:14.5[a]"
Invoke-FFmpeg (@("-i", (Join-Path $videoRoot "06-export-download.mkv"), "-i", (Join-Path $speechRoot "07-follow-up-export.wav"), "-filter_complex", $filter, "-map", "[v]", "-map", "[a]") + (VideoArgs) + @($scene))

# 07 — technical boundary over product evidence; no code-screen requirement.
$scene = Join-Path $sceneRoot "07.mp4"
$filter = "[0:v]fps=30,trim=0:6,setpts=PTS-STARTPTS[v0];[1:v]fps=30,trim=0:11.5,setpts=PTS-STARTPTS[v1];[v0][v1]concat=n=2:v=1:a=0,format=yuv420p[v];[0:a]aresample=48000,atrim=0:6,asetpts=PTS-STARTPTS[a0];[1:a]aresample=48000,atrim=0:11.5,asetpts=PTS-STARTPTS[a1];[a0][a1]concat=n=2:v=0:a=1,volume=0.25[bg];[2:a]$voice,apad,atrim=0:17.5[narr0];[narr0]asplit=2[narrsc][narrmix];[bg][narrsc]$duck[ducked];[ducked][narrmix]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.95,apad,atrim=0:17.5[a]"
Invoke-FFmpeg (@("-ss", "4", "-t", "6", "-i", (Join-Path $videoRoot "01-problem-and-playback.mkv"), "-ss", "0.2", "-t", "11.5", "-i", (Join-Path $videoRoot "04-compare-and-apply-edit.mkv"), "-i", (Join-Path $speechRoot "08-technical-boundary.wav"), "-filter_complex", $filter, "-map", "[v]", "-map", "[a]") + (VideoArgs) + @($scene))

# 08 — OG closing card with a subtle push-in and Codex build story.
$scene = Join-Path $sceneRoot "08.mp4"
$filter = "[0:v]scale=1920:1080,zoompan=z='min(zoom+0.00025,1.04)':d=1:s=1920x1080:fps=30,trim=0:19.85,fade=t=out:st=18.85:d=1,format=yuv420p[v];[1:a]aresample=48000,atrim=0:19.85,asetpts=PTS-STARTPTS,volume=0.2[bg];[2:a]$voice,apad,atrim=0:19.85[narr0];[narr0]asplit=2[narrsc][narrmix];[bg][narrsc]$duck[ducked];[ducked][narrmix]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.95,afade=t=out:st=18.85:d=1,apad,atrim=0:19.85[a]"
Invoke-FFmpeg (@("-loop", "1", "-framerate", "30", "-t", "19.85", "-i", (Join-Path $repoRoot "public\og.png"), "-ss", "2", "-t", "19.85", "-i", (Join-Path $videoRoot "01-problem-and-playback.mkv"), "-i", (Join-Path $speechRoot "09-codex-close.wav"), "-filter_complex", $filter, "-map", "[v]", "-map", "[a]") + (VideoArgs) + @($scene))

$concatPath = Join-Path $sceneRoot "concat.txt"
$sceneLines = 1..8 | ForEach-Object { "file '$((Join-Path $sceneRoot ("{0:D2}.mp4" -f $_)).Replace("'", "''"))'" }
[IO.File]::WriteAllLines($concatPath, $sceneLines)

$joinedPath = Join-Path $sceneRoot "joined.mp4"
Invoke-FFmpeg @("-f", "concat", "-safe", "0", "-i", $concatPath, "-c", "copy", $joinedPath)
Invoke-FFmpeg @("-i", $joinedPath, "-map", "0:v:0", "-map", "0:a:0", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2", "-af", "loudnorm=I=-14:LRA=9:TP=-1.5", "-movflags", "+faststart", $outputPath)

Write-Output $outputPath
