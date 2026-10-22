# Graduate Robot

React + Vite + React Three Fiber viewer for the white graduate robot, with a
voice assistant that listens, thinks with a Groq LLM, speaks back, and moves
its mouth in sync with the reply.

## Quick start

```bash
npm install
copy .env.example .env     # Windows  (macOS/Linux: cp .env.example .env)
# open .env and paste your own Groq API key
npm run dev
```

Open http://127.0.0.1:5174/. `npm run build` creates a production build in `dist`.

`.env` is git-ignored and is **not** part of this repository, so every clone must
create its own from `.env.example`. The 3D viewer works without a key, but the
robot cannot answer questions until one is added.

## Voice assistant setup (Groq LLM)

1. Get a free API key at https://console.groq.com/keys.
2. Copy `.env.example` to `.env` and paste your key:
   ```
   GROQ_API_KEY=your_real_key_here
   VITE_GROQ_MODEL=openai/gpt-oss-120b
   ```
3. Restart the dev server (`npm run dev`).
4. Click the floating 🎤 button and allow microphone access.

Continuous conversation: after you click 🎤 once, the robot listens, thinks,
speaks its answer, and then automatically starts listening again for your next
question. Click the red ⏹ button whenever you want to end the conversation.

Lip sync: the robot's mouth (`GR_HERO_Smile`) is driven by a phoneme track rather
than a volume guess. `src/hooks/visemes.js` turns the reply into a timed sequence
of visemes (open "ah", spread "ee", rounded "oo", closed "m/b/p", ...) and
`useLipSync` eases the mouth mesh through those shapes on three axes — jaw drop,
lip spread and lip purse — pivoting on the upper lip so it opens downward. The
shapes are tuned to stay inside the visor.

This model has no blend shapes and no skeleton, so that single mesh is the only
mouth control available. `useLipSync` still checks for morph targets and jaw
bones first, so a future model that includes them is picked up automatically.

How it works:

- `src/hooks/useGroq.js` sends the question to Groq (`openai/gpt-oss-120b`) and
  returns the answer. It injects the current date/time and can call a
  `get_current_weather` tool (Open-Meteo, no key needed) for live weather.
- `src/hooks/useSpeech.js` handles speech-to-text (microphone to text).
- `src/hooks/useTTS.js` handles text-to-speech. It tries Groq TTS first and
  falls back to the browser's `SpeechSynthesis` voice.
- `src/hooks/visemes.js` converts text into a timed viseme track.
- `src/hooks/useLipSync.js` drives the mouth from the live playback clock.
- `src/components/VoiceInterface.jsx` is the floating mic button and status,
  and runs the hands-free listen/answer loop.

### Optional: Groq TTS voice

By default the browser voice is used. For the higher-quality Groq voice, the
model `canopylabs/orpheus-v1-english` requires a one-time terms acceptance by an
org admin at
https://console.groq.com/playground?model=canopylabs%2Forpheus-v1-english

Until that is accepted the app logs a single console note and uses the browser
voice; lip sync works either way. When Groq audio is available the viseme track
is scaled to the exact audio duration for tighter sync.

Security:

- Your `GROQ_API_KEY` is used by the local Vite proxy (`vite.config.js`) and is
  **never** sent to the browser bundle. `.env` is git-ignored, so sharing the
  source as a zip keeps your key private.
- Only share the project without `.env` (and ideally without a `dist/` built
  while `.env` was present). Recipients add their own key.

- ../Graduate_Robot.blend: editable Blender scene with cap, passport, and pointing pose.
- public/models/graduate-robot.glb: robot with a four-second head idle and eye blink loop.
- src/main.jsx: GLB loading, playback, orbit and reset controls, lighting.
- src/style.css: responsive page styling.

Drag to orbit; scroll to zoom; use Reset view to restore the front three-quarter view.
Animation is embedded in the GLB. The 3D viewer itself needs no external API;
the optional voice assistant uses the Groq API described above.
Materials use PBR colors and emissive cyan accents; browser lighting may differ from Blender.
Earlier teacher-model files and verification images are in ../backup/.
