import { useState, useCallback, useRef, useEffect } from 'react';

export function useSpeech() {
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef(null);
  const listenFinishRef = useRef(null);
  const supportedRef = useRef(
    typeof window !== 'undefined' &&
      Boolean(window.SpeechRecognition || window.webkitSpeechRecognition)
  );

  // Listens for a single utterance and resolves with { text, fatal }.
  const listenOnce = useCallback(() => {
    const SpeechRecognition =
      typeof window !== 'undefined' &&
      (window.SpeechRecognition || window.webkitSpeechRecognition);

    if (!SpeechRecognition) return Promise.resolve({ text: null, fatal: true });

    return new Promise((resolve) => {
      let settled = false;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        listenFinishRef.current = null;
        setIsListening(false);
        resolve(value);
      };

      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch (e) {}
      }

      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'en-US';
      recognition.maxAlternatives = 1;

      recognition.onstart = () => setIsListening(true);
      recognition.onresult = (event) => {
        const text = (event.results && event.results[0] && event.results[0][0]
          ? event.results[0][0].transcript
          : ''
        ).trim();
        finish({ text: text || null, fatal: false });
      };
      recognition.onend = () => finish({ text: null, fatal: false });
      recognition.onerror = (event) => {
        const fatal =
          event.error === 'not-allowed' || event.error === 'service-not-allowed';
        if (!fatal && event.error !== 'no-speech' && event.error !== 'aborted') {
          console.warn('Speech recognition error:', event.error);
        }
        finish({ text: null, fatal });
      };

      recognitionRef.current = recognition;
      listenFinishRef.current = finish;
      try {
        recognition.start();
      } catch (e) {
        finish({ text: null, fatal: false });
      }
    });
  }, []);

  // Stops any active listening immediately.
  const stopAll = useCallback(() => {
    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch (e) {}
    }
    if (listenFinishRef.current) listenFinishRef.current({ text: null, fatal: false });
    setIsListening(false);
  }, []);

  useEffect(
    () => () => {
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch (e) {}
      }
    },
    []
  );

  return {
    listenOnce,
    stopAll,
    isListening,
    supported: supportedRef.current,
  };
}
