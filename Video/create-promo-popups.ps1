$ErrorActionPreference = "Stop"

$videoDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$workDir = Join-Path $videoDir "_popup_promo_work"
$output = Join-Path $videoDir "WomenHealthJournalCompanion_Promo_NoVoice.mp4"
$music = Join-Path $videoDir "bensound-angelsbymyside.mp3"

New-Item -ItemType Directory -Force -Path $workDir | Out-Null
Get-ChildItem -Path $workDir -File -ErrorAction SilentlyContinue | Remove-Item -Force

$ffmpeg = node -p "require('@ffmpeg-installer/ffmpeg').path"
if (-not (Test-Path $ffmpeg)) {
  throw "FFmpeg was not found. Run npm install --no-save @ffmpeg-installer/ffmpeg first."
}
if (-not (Test-Path $music)) {
  throw "Background music was not found: $music"
}

$slides = @(
  @{
    Image = "topofpagewithuserinfo.png"
    Segment = "01_journal.mp4"
    Caption = "Login, enter a journal, review the sample entry, and see AI extraction plus the submitted entry context."
  },
  @{
    Image = "InsightSummary.png"
    Segment = "02_insights.mp4"
    Caption = "Insights Summary gives a clear summary of all entered journal entries and shows the full latest journal entry."
  },
  @{
    Image = "MoodStressTrend.png"
    Segment = "03_trends.mp4"
    Caption = "Journal history is shown on the left. Selecting an entry opens it on the right, with mood, stress, and sleep trends below."
  },
  @{
    Image = "PossibleAssociations.png"
    Segment = "04_associations.mp4"
    Caption = "Possible Associations show stress and mood, sleep and fatigue, stress and sleep, and cycle and skin change patterns."
  },
  @{
    Image = "topofpagewithuserinfo.png"
    Segment = "05_close.mp4"
    Caption = "No diagnosis. The app supports private journaling, long-term pattern awareness, and better healthcare conversations."
  }
)

$slideSeconds = 8
$width = 1280
$height = 720
$bgColor = "F4EFE7"

foreach ($slide in $slides) {
  $imagePath = Join-Path $videoDir $slide.Image
  $segmentPath = Join-Path $workDir $slide.Segment

  if (-not (Test-Path $imagePath)) {
    throw "Screenshot was not found: $imagePath"
  }

  & $ffmpeg -y `
    -loop 1 `
    -framerate 30 `
    -t $slideSeconds `
    -i $imagePath `
    -vf "scale=$($width):$($height):force_original_aspect_ratio=decrease,pad=$($width):$($height):(ow-iw)/2:(oh-ih)/2:color=$bgColor,format=yuv420p" `
    -c:v libx264 `
    -preset veryfast `
    -tune stillimage `
    -an `
    -movflags +faststart `
    $segmentPath
}

$concatList = Join-Path $workDir "concat.txt"
$slides | ForEach-Object { "file '$($_.Segment)'" } | Set-Content -Path $concatList -Encoding ASCII

Push-Location $workDir
try {
  & $ffmpeg -y `
    -f concat `
    -safe 0 `
    -i "concat.txt" `
    -c copy `
    "base.mp4"
} finally {
  Pop-Location
}

function Format-AssTime([double]$seconds) {
  $ts = [TimeSpan]::FromSeconds($seconds)
  return "{0}:{1:00}:{2:00}.{3:00}" -f [int]$ts.TotalHours, $ts.Minutes, $ts.Seconds, [int]($ts.Milliseconds / 10)
}

function Escape-AssText([string]$text) {
  return $text.Replace("{", "\{").Replace("}", "\}").Replace("`r`n", "\N").Replace("`n", "\N")
}

function Wrap-Caption([string]$text, [int]$maxLineLength = 34) {
  $words = $text -split "\s+"
  $lines = New-Object System.Collections.Generic.List[string]
  $current = ""

  foreach ($word in $words) {
    if (-not $current) {
      $current = $word
      continue
    }

    if (($current.Length + 1 + $word.Length) -le $maxLineLength) {
      $current = "$current $word"
    } else {
      $lines.Add($current)
      $current = $word
    }
  }

  if ($current) {
    $lines.Add($current)
  }

  return $lines -join "\N"
}

$assPath = Join-Path $workDir "popups.ass"
$assLines = @(
  "[Script Info]",
  "ScriptType: v4.00+",
  "PlayResX: $width",
  "PlayResY: $height",
  "WrapStyle: 2",
  "",
  "[V4+ Styles]",
  "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
  "Style: Popup,Georgia,27,&H00191614,&H000000FF,&H00F4EFE7,&H00000000,0,0,0,0,100,100,0,0,1,0.6,0,7,760,48,54,1",
  "",
  "[Events]",
  "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text"
)

for ($i = 0; $i -lt $slides.Count; $i += 1) {
  $start = ($i * $slideSeconds) + 0.45
  $end = (($i + 1) * $slideSeconds) - 0.45
  $text = Escape-AssText (Wrap-Caption $slides[$i].Caption)
  $assLines += "Dialogue: 0,$(Format-AssTime $start),$(Format-AssTime $end),Popup,,0,0,0,,{\fad(250,250)}$text"
}
$assLines | Set-Content -Path $assPath -Encoding UTF8

$duration = $slides.Count * $slideSeconds
$popupInputs = @()
$popupFilters = @()
$popupLabels = @()
for ($i = 0; $i -lt $slides.Count; $i += 1) {
  $popupInputs += @("-f", "lavfi", "-t", "0.16", "-i", "sine=frequency=880:sample_rate=44100")
  $delay = (($i * $slideSeconds) + 0.35) * 1000
  $delayMs = [int][Math]::Round($delay)
  $popupFilters += "[$($i + 2):a]volume=0.30,adelay=$delayMs|$delayMs[p$i]"
  $popupLabels += "[p$i]"
}

$audioFilter = "[1:a]atrim=0:$duration,asetpts=PTS-STARTPTS,volume=0.48[music];" +
  ($popupFilters -join ";") +
  ";[music]" + ($popupLabels -join "") + "amix=inputs=$($slides.Count + 1):duration=first:dropout_transition=0[a]"

Push-Location $workDir
try {
  & $ffmpeg -y `
    -i "base.mp4" `
    -stream_loop -1 `
    -i $music `
    @popupInputs `
    -vf "drawbox=x=720:y=42:w=512:h=172:color=FAF7EE@1:t=fill,drawbox=x=720:y=42:w=512:h=172:color=C8BBA7@1:t=3,subtitles=popups.ass" `
    -filter_complex $audioFilter `
    -map 0:v `
    -map "[a]" `
    -t $duration `
    -c:v libx264 `
    -preset veryfast `
    -c:a aac `
    -b:a 160k `
    -pix_fmt yuv420p `
    -movflags +faststart `
    $output
} finally {
  Pop-Location
}

Write-Host "Created no-voice promo video: $output"
