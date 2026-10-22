# Graduate Robot

React + Vite + React Three Fiber viewer for the white graduate robot, with a
voice assistant that listens, thinks with a Groq LLM, speaks back, and moves
its mouth in sync with the reply.

Run `npm install` once, then `npm run dev` and open http://127.0.0.1:5174/.
`npm run build` creates a production build in dist.

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

Lip sync: the robot's mouth (`GR_HERO_Smile`) opens and closes in time with the
spoken reply. This model has no blend shapes or skeleton, so the mouth mesh is
scaled about its top edge like a jaw. `useLipSync` also supports morph targets
and jaw bones automatically if a future model includes them.

How it works:

- `src/hooks/useGroq.js` sends the question to Groq (`openai/gpt-oss-120b`) and
  returns the answer. It injects the current date/time and can call a
  `get_current_weather` tool (Open-Meteo, no key needed) for live weather.
- `src/hooks/useSpeech.js` handles speech-to-text (microphone) and
  text-to-speech (spoken reply), and streams viseme data while speaking.
- `src/hooks/useLipSync.js` drives the robot's mouth morph target or jaw bone
  in real time from that viseme data.
- `src/components/VoiceInterface.jsx` is the floating mic button and status.

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
