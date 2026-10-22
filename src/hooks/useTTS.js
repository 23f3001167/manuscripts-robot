import { useState, useCallback, useRef, useEffect } from 'react';
import { buildVisemeTimeline, estimateDurationMs } from './visemes';

const TTS_ENDPOINT = '/api/groq/openai/v1/audio/speech';
const TTS_MODEL = 'canopylabs/orpheus-v1-english';
const TTS_VOICE = 'troy';
const MAX_INPUT_CHARS = 600;

const REST_TRACK = {
  speaking: false,
  mode: 'idle',
  startedAt: 0,
  durationMs: 0,
  timeline: [],
  audioEl: null,
};

function splitIntoChunks(text, maxLen = 170) {
  const parts = text.match(/[^.!?]+[.!?]*/g) || [text];
  const chunks = [];
  let current = '';
  for (const part of parts) {
    if ((current + part).length > maxLen && current.trim()) {
      chunks.push(current.trim());
      current = part;
    } else {
      current += part;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

/**
 * Speech output that always drives the lip-sync track.
 *
 * 1. Tries Groq TTS (real audio) — the viseme track is scaled to the exact
 *    audio duration, so mouth motion stays glued to the voice.
 * 2. Falls back to the browser's SpeechSynthesis — the track is estimated from
 *    the text and gently re-synced on each word boundary.
 *
 * `speechRef` is shared with `useLipSync`; it carries the live playback clock.
 */
export function useTTS({ speechRef }) {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
  const runIdRef = useRef(0);
  const playEndRef = useRef(null);
  const synthEndRef = useRef(null);
  const warnedRef = useRef(false);

  useEffect(() => {
    if (!synth) return;
    const load = () => synth.getVoices();
    load();
    try {
      synth.addEventListener('voiceschanged', load);
      return () => synth.removeEventListener('voiceschanged', load);
    } catch (e) {
      synth.onvoiceschanged = load;
      return () => { synth.onvoiceschanged = null; };
    }
  }, [synth]);

  const pickVoice = useCallback(() => {
    if (!synth) return null;
    const voices = synth.getVoices();
    if (!voices.length) return null;
    return (
      voices.find((v) => /Google US English|Microsoft (Aria|Jenny|Guy|Davis)/i.test(v.name)) ||
      voices.find((v) => /Samantha|Daniel|Karen/i.test(v.name)) ||
      voices.find((v) => v.lang && v.lang.toLowerCase().startsWith('en')) ||
      voices[0]
    );
  }, [synth]);

  const groqTTS = useCallback(async (text) => {
    try {
      const res = await fetch(TTS_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: TTS_MODEL,
          voice: TTS_VOICE,
          input: text.slice(0, MAX_INPUT_CHARS),
          response_format: 'wav',
        }),
      });
      if (!res.ok) {
        if (!warnedRef.current) {
          warnedRef.current = true;
          let msg = `status ${res.status}`;
          try {
            const body = await res.json();
            if (body && body.error && body.error.message) msg = body.error.message;
          } catch (e) { /* ignore */ }
          console.info(
            '[graduate robot] Groq TTS is unavailable, so the browser voice is being used for speech and lip sync. Reason: ' + msg
          );
        }
        return null;
      }
      const blob = await res.blob();
      if (!blob || blob.size < 512) return null;
      return URL.createObjectURL(blob);
    } catch (e) {
      return null;
    }
  }, []);

  const speak = useCallback(
    async (text, audioEl) => {
      if (!text) return;
      const runId = ++runIdRef.current;
      setIsSpeaking(true);
      speechRef.current = { ...REST_TRACK, speaking: true };

      const finish = () => {
        if (runIdRef.current === runId) {
          speechRef.current = { ...REST_TRACK };
          setIsSpeaking(false);
        }
      };

      // ---- 1. Real audio via Groq TTS -------------------------------------
      const url = await groqTTS(text);
      if (runIdRef.current !== runId) {
        if (url) URL.revokeObjectURL(url);
        return;
      }

      if (url && audioEl) {
        try {
          await new Promise((resolve) => {
            let settled = false;
            let started = false;
            let startWatchdog = 0;
            let endWatchdog = 0;
            const end = () => {
              if (settled) return;
              settled = true;
              clearTimeout(startWatchdog);
              clearTimeout(endWatchdog);
              playEndRef.current = null;
              audioEl.onended = null;
              audioEl.onerror = null;
              audioEl.removeEventListener('loadedmetadata', begin);
              audioEl.removeEventListener('canplay', begin);
              resolve();
            };
            const begin = () => {
              if (settled || started) return;
              started = true;
              clearTimeout(startWatchdog);
              if (runIdRef.current !== runId) { end(); return; }
              const durSec =
                isFinite(audioEl.duration) && audioEl.duration > 0.2
                  ? audioEl.duration
                  : estimateDurationMs(text) / 1000;
              const durationMs = durSec * 1000;
              speechRef.current = {
                speaking: true,
                mode: 'audio',
                audioEl,
                startedAt: performance.now(),
                durationMs,
                timeline: buildVisemeTimeline(text, durationMs),
              };
              // Safety net: if `ended` never fires, release after the audio length.
              endWatchdog = setTimeout(end, durationMs + 5000);
              audioEl.play().catch(end);
            };

            playEndRef.current = end;
            audioEl.onended = end;
            audioEl.onerror = end;
            audioEl.addEventListener('loadedmetadata', begin);
            audioEl.addEventListener('canplay', begin);
            audioEl.src = url;
            // If metadata never arrives (rare), start with an estimated length.
            startWatchdog = setTimeout(begin, 4000);
          });
        } finally {
          URL.revokeObjectURL(url);
        }
        finish();
        return;
      }

      // ---- 2. SpeechSynthesis fallback ------------------------------------
      if (!synth) { finish(); return; }

      const durationMs = estimateDurationMs(text);
      speechRef.current = {
        speaking: true,
        mode: 'synthesis',
        audioEl: null,
        startedAt: performance.now(),
        durationMs,
        timeline: buildVisemeTimeline(text, durationMs),
      };

      try { synth.cancel(); } catch (e) { /* ignore */ }
      const chunks = splitIntoChunks(text);
      let offset = 0;

      for (const chunk of chunks) {
        if (runIdRef.current !== runId) break;
        const chunkOffset = offset;
        offset += chunk.length;

        await new Promise((resolve) => {
          let settled = false;
          let guard = 0;
          const done = () => {
            if (settled) return;
            settled = true;
            clearTimeout(guard);
            synthEndRef.current = null;
            resolve();
          };
          synthEndRef.current = done;
          // Some browsers never fire `end` on a backgrounded tab.
          guard = setTimeout(done, estimateDurationMs(chunk) + 5000);

          const u = new SpeechSynthesisUtterance(chunk);
          u.lang = 'en-US';
          u.rate = 1;
          u.pitch = 1.02;
          u.volume = 1;
          const voice = pickVoice();
          if (voice) u.voice = voice;
          u.onboundary = (e) => {
            if (runIdRef.current !== runId) return;
            const globalIdx = chunkOffset + (e.charIndex || 0);
            const progress = Math.min(globalIdx / Math.max(text.length, 1), 1);
            speechRef.current.startedAt = performance.now() - progress * durationMs;
          };
          u.onend = done;
          u.onerror = done;
          try { synth.resume(); } catch (e) { /* ignore */ }
          synth.speak(u);
        });
      }

      finish();
    },
    [groqTTS, synth, pickVoice, speechRef]
  );

  const stopSpeaking = useCallback(() => {
    runIdRef.current += 1;

    const el = speechRef.current && speechRef.current.audioEl;
    if (el) {
      try { el.pause(); el.currentTime = 0; } catch (e) { /* ignore */ }
    }
    if (playEndRef.current) playEndRef.current();
    if (synthEndRef.current) synthEndRef.current();
    if (synth) { try { synth.cancel(); } catch (e) { /* ignore */ } }

    speechRef.current = { ...REST_TRACK };
    setIsSpeaking(false);
  }, [synth, speechRef]);

  useEffect(
    () => () => {
      runIdRef.current += 1;
      if (synth) { try { synth.cancel(); } catch (e) { /* ignore */ } }
    },
    [synth]
  );

  return { speak, stopSpeaking, isSpeaking };
}
