Add-Type -AssemblyName System.Speech
$voice = New-Object System.Speech.Synthesis.SpeechSynthesizer
$voice.Rate = -3
$voice.SetOutputToWaveFile((Join-Path $PSScriptRoot 'public/voice.wav'))
$script = 'Instructional records move through many hands. When submissions, deadlines, and follow-ups are scattered, it becomes harder to see what is complete and what needs attention. CEDIMS gives Calapan East District one shared place to submit documents, track compliance, and review progress. Teachers can work from their assigned loads and academic periods. School leaders and district supervisors can monitor records, find submissions, and act on the information in front of them. From one classroom record to the district view, the work stays clear and accountable. CEDIMS. Clear records. Shared responsibility.'
$voice.Speak($script)
$voice.Dispose()
