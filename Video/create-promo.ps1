$ErrorActionPreference = "Stop"

$videoDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$workDir = Join-Path $videoDir "_promo_work"
$output = Join-Path $videoDir "WomenHealthJournalCompanion_Promo.mp4"

New-Item -ItemType Directory -Force -Path $workDir | Out-Null

$ffmpeg = node -p "require('@ffmpeg-installer/ffmpeg').path"
if (-not (Test-Path $ffmpeg)) {
  throw "FFmpeg was not found. Run npm install --no-save @ffmpeg-installer/ffmpeg first."
}

Add-Type -AssemblyName System.Speech

$slides = @(
  @{
    Image = "topofpagewithuserinfo.png"
    Audio = "01_intro.wav"
    Segment = "01_intro.mp4"
    Text = @"
Meet Women's Health Journal Companion AI, a private journaling companion designed to help women notice patterns over time. Start with a daily entry, add simple details like sleep, mood, energy, and stress, then let the app organize the information into clear, supportive wellness observations.
"@
  },
  @{
    Image = "InsightSummary.png"
    Audio = "02_insights.wav"
    Segment = "02_insights.mp4"
    Text = @"
The insights summary turns many journal entries into a simple snapshot. It highlights average sleep, stress, mood, repeated signals, and gentle notes that can help a user reflect on what has been changing. The language stays informational and never claims to diagnose.
"@
  },
  @{
    Image = "MoodStressTrend.png"
    Audio = "03_trends.wav"
    Segment = "03_trends.mp4"
    Text = @"
The trend dashboard shows mood, stress, and sleep across the selected time range. A user can review prior entries in read-only mode, compare changes across days, and bring more organized context to a healthcare conversation.
"@
  },
  @{
    Image = "PossibleAssociations.png"
    Audio = "04_associations.wav"
    Segment = "04_associations.mp4"
    Text = @"
The possible associations panel looks for patterns such as stress with mood, sleep with fatigue, or cycle notes with skin changes. Each card includes confidence, evidence counts, and a clear reminder that association does not mean causation.
"@
  },
  @{
    Image = "topofpagewithuserinfo.png"
    Audio = "05_close.wav"
    Segment = "05_close.mp4"
    Text = @"
Women's Health Journal Companion AI is built to support awareness, privacy, and better preparation for professional care. It helps users notice trends, export useful summaries, and stay in control of their own health journal data.
"@
  }
)

$voice = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
  $voice.SelectVoiceByHints(
    [System.Speech.Synthesis.VoiceGender]::Female,
    [System.Speech.Synthesis.VoiceAge]::Adult
  )
} catch {
  Write-Warning "A female voice could not be selected. Windows will use its default voice."
}

$voice.Rate = -3
$voice.Volume = 95

foreach ($slide in $slides) {
  $audioPath = Join-Path $workDir $slide.Audio
  $voice.SetOutputToWaveFile($audioPath)
  $voice.Speak($slide.Text)
  $voice.SetOutputToNull()
}

$voice.Dispose()

foreach ($slide in $slides) {
  $imagePath = Join-Path $videoDir $slide.Image
  $audioPath = Join-Path $workDir $slide.Audio
  $segmentPath = Join-Path $workDir $slide.Segment

  & $ffmpeg -y `
    -loop 1 `
    -framerate 30 `
    -i $imagePath `
    -i $audioPath `
    -vf "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=F4EFE7,format=yuv420p" `
    -c:v libx264 `
    -preset veryfast `
    -tune stillimage `
    -c:a aac `
    -b:a 160k `
    -shortest `
    -movflags +faststart `
    $segmentPath
}

$concatList = Join-Path $workDir "concat.txt"
$slides |
  ForEach-Object {
    "file '$($_.Segment)'"
  } |
  Set-Content -Path $concatList -Encoding ASCII

Push-Location $workDir
try {
  & $ffmpeg -y `
    -f concat `
    -safe 0 `
    -i "concat.txt" `
    -c copy `
    -movflags +faststart `
    $output
} finally {
  Pop-Location
}

Write-Host "Created promo video: $output"
