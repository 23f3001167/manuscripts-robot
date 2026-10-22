import { useCallback, useEffect, useRef, useState } from 'react';
import { useSpeech } from '../hooks/useSpeech';
import { useGroq } from '../hooks/useGroq';
import { useTTS } from '../hooks/useTTS';
import { useLipSync } from '../hooks/useLipSync';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function VoiceInterface({ robotScene }) {
  const { ask, isThinking } = useGroq();
  const { listenOnce, stopAll, isListening, supported } = useSpeech();

  // Shared playback clock: written by useTTS, read by useLipSync every frame.
  const speechRef = useRef({
    speaking: false,
    mode: 'idle',
    startedAt: 0,
    durationMs: 0,
    timeline: [],
    audioEl: null,
  });
  const { speak, stopSpeaking, isSpeaking } = useTTS({ speechRef });

  useLipSync({ scene: robotScene, speechRef });

  const [active, setActive] = useState(false);
  const [hint, setHint] = useState('');
  const [audioEl, setAudioEl] = useState(null);
  const runRef = useRef(0);
  const activeRef = useRef(false);

  const setAudioRef = useCallback((el) => {
    if (el) setAudioEl(el);
  }, []);

  const startConversation = useCallback(async () => {
    if (activeRef.current) return;
    activeRef.current = true;
    setActive(true);
    setHint('');

    const runId = ++runRef.current;

    while (runRef.current === runId) {
      const result = await listenOnce();
      if (runRef.current !== runId) break;

      if (result.fatal) {
        setHint('Microphone blocked. Please allow mic access and try again.');
        break;
      }

      if (!result.text) {
        await sleep(400);
        continue;
      }

      const answer = await ask(result.text);
      if (runRef.current !== runId) break;

      if (answer) {
        await speak(answer, audioEl);
        if (runRef.current !== runId) break;
      }

      await sleep(250);
    }

    if (runRef.current === runId) {
      activeRef.current = false;
      setActive(false);
    }
  }, [listenOnce, ask, speak, audioEl]);

  const stopConversation = useCallback(() => {
    runRef.current += 1;
    activeRef.current = false;
    setActive(false);
    setHint('');
    stopAll();
    stopSpeaking();
  }, [stopAll, stopSpeaking]);

  useEffect(
    () => () => {
      runRef.current += 1;
      stopAll();
      stopSpeaking();
    },
    [stopAll, stopSpeaking]
  );

  if (!supported) {
    return (
      <div style={styles.notice}>
        Voice input is not supported in this browser. Please use Chrome or Edge.
      </div>
    );
  }

  const handleMic = () => {
    if (active) stopConversation();
    else startConversation();
  };

  const status = !active
    ? hint || 'Tap the mic and ask anything'
    : isListening
    ? 'Listening… (tap to stop)'
    : isThinking
    ? 'Thinking…'
    : isSpeaking
    ? 'Robot is speaking…'
    : 'Listening…';

  return (
    <>
      <button
        style={{
          ...styles.micButton,
          background: active ? '#9c3b2e' : '#294d40',
        }}
        onClick={handleMic}
        aria-label={active ? 'Stop conversation' : 'Start voice conversation'}
        title={active ? 'Tap to stop the conversation' : 'Tap to start talking'}
      >
        {active ? '⏹' : '🎤'}
      </button>
      <div style={styles.status}>{status}</div>
      <audio ref={setAudioRef} preload="auto" style={{ display: 'none' }} />
    </>
  );
}

const styles = {
  micButton: {
    position: 'fixed',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: '50%',
    border: 'none',
    color: '#fff',
    fontSize: 22,
    cursor: 'pointer',
    boxShadow: '0 4px 14px rgba(0,0,0,0.25)',
    display: 'grid',
    placeItems: 'center',
    zIndex: 1000,
  },
  status: {
    position: 'fixed',
    bottom: 96,
    right: 24,
    fontSize: 12,
    color: '#203e3a',
    background: 'rgba(255,255,255,0.85)',
    padding: '6px 12px',
    borderRadius: 20,
    pointerEvents: 'none',
    zIndex: 1000,
    maxWidth: 260,
    textAlign: 'right',
  },
  notice: {
    position: 'fixed',
    bottom: 24,
    right: 24,
    fontSize: 12,
    color: '#738279',
    background: 'rgba(255,255,255,0.85)',
    padding: '8px 12px',
    borderRadius: 20,
    zIndex: 1000,
  },
};
