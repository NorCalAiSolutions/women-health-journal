$ErrorActionPreference = "Stop"

$videoDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$workDir = Join-Path $videoDir "_all_pages_work"
$output = Join-Path $videoDir "WomenHealthJournalCompanion_AllPages.mp4"

New-Item -ItemType Directory -Force -Path $workDir | Out-Null
Get-ChildItem -Path $workDir -File -ErrorAction SilentlyContinue | Remove-Item -Force

$ffmpeg = node -p "require('@ffmpeg-installer/ffmpeg').path"
if (-not (Test-Path $ffmpeg)) {
  throw "FFmpeg was not found. Run npm install --no-save @ffmpeg-installer/ffmpeg first."
}

$pages = @(
  @{
    Image = "topofpagewithuserinfo.png"
    Audio = "01_top.wav"
    Segment = "01_top.mp4"
    Text = "This is the main journal screen for Women's Health Journal Companion AI. A signed in user can enter a daily journal, add structured details like mood, sleep, energy, and stress, and review AI extraction in a privacy first workspace."
  },
  @{
    Image = "InsightSummary.png"
    Audio = "02_insights.wav"
    Segment = "02_insights.mp4"
    Text = "The insights summary gives a simple overview of saved journal entries. It shows entry count, average sleep, stress, mood, common repeated signals, and a read only view of the latest journal entry."
  },
  @{
    Image = "MoodStressTrend.png"
    Audio = "03_trends.wav"
    Segment = "03_trends.mp4"
    Text = "The trend dashboard shows journal history, mood and stress over time, and sleep trends for the selected journal period. Older entries can be reviewed without editing them."
  },
  @{
    Image = "PossibleAssociations.png"
    Audio = "04_associations.wav"
    Segment = "04_associations.mp4"
    Text = "The possible associations view highlights patterns such as stress and mood, sleep and fatigue, stress and sleep, and cycle and skin changes. These are informational associations only and never claim causation or diagnosis."
  }
)

foreach ($page in $pages) {
  $audioPath = Join-Path $workDir $page.Audio
  $voice = New-Object -ComObject SAPI.SpVoice
  $zira = $voice.GetVoices() |
    Where-Object { $_.GetDescription() -like "*Zira*" } |
    Select-Object -First 1

  if (-not $zira) {
    throw "Microsoft Zira female voice was not found. Install/enable Microsoft Zira Desktop and rerun this script."
  }

  $voice.Voice = $zira
  $voice.Rate = -3
  $voice.Volume = 95

  $stream = New-Object -ComObject SAPI.SpFileStream
  $stream.Open($audioPath, 3, $false)
  $voice.AudioOutputStream = $stream
  [void]$voice.Speak($page.Text)
  $stream.Close()
}

foreach ($page in $pages) {
  $imagePath = Join-Path $videoDir $page.Image
  $audioPath = Join-Path $workDir $page.Audio
  $segmentPath = Join-Path $workDir $page.Segment

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
$pages |
  ForEach-Object { "file '$($_.Segment)'" } |
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

Write-Host "Created all-pages video: $output"
