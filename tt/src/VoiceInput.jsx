// src/components/VoiceInput.jsx
import React, {
  useRef,
  useState,
  useEffect,
  forwardRef,
  useImperativeHandle,
} from "react";
import { FaMicrophone, FaStop } from "react-icons/fa";
import { parseVoice } from "./api";
import styles from "./VoiceInput.module.css";

function speakText(text, lang = "hi-IN", cb) {
  if (!window?.speechSynthesis) {
    cb?.();
    return;
  }
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang;
  u.onend = () => cb?.();
  u.onerror = () => cb?.();
  window.speechSynthesis.speak(u);
}

const VoiceInput = forwardRef(({ onCommand, lang = "hi-IN", useHinglish = true }, ref) => {
  const recognitionRef = useRef(null);
  const finalTranscriptRef = useRef("");
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [finalText, setFinalText] = useState("");
  const [error, setError] = useState("");
  const [micPermission, setMicPermission] = useState(null);
  const [processing, setProcessing] = useState(false);

  useImperativeHandle(ref, () => ({
    speak: (text, langOverride) => speakText(text, langOverride || lang),
  }));

  useEffect(() => {
    if (!navigator.permissions) return;
    let mounted = true;
    navigator.permissions
      .query({ name: "microphone" })
      .then((result) => {
        if (!mounted) return;
        setMicPermission(result.state === "granted");
        result.onchange = () => setMicPermission(result.state === "granted");
      })
      .catch(() => mounted && setMicPermission(false));
    return () => { mounted = false; };
  }, []);

  const requestMicPermission = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      setMicPermission(true);
      return true;
    } catch (err) {
      setMicPermission(false);
      setError("Microphone access denied.");
      speakText("Please allow microphone access.", lang);
      return false;
    }
  };

  const startListening = async () => {
    setError("");
    setInterim("");
    setFinalText("");
    finalTranscriptRef.current = "";

    if (micPermission === false) {
      const ok = await requestMicPermission();
      if (!ok) return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError("Speech recognition not supported in this browser. Use Chrome.");
      speakText("Your browser does not support speech recognition. Please use Chrome.", lang);
      return;
    }

    try {
      try { recognitionRef.current?.stop(); } catch (e) {}
      const recognition = new SpeechRecognition();
      recognitionRef.current = recognition;
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = useHinglish ? "en-IN" : lang;

      recognition.onstart = () => {
        setListening(true);
        speakText("Listening...", lang);
      };

      recognition.onresult = (event) => {
        let interimText = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscriptRef.current += transcript + " ";
          } else {
            interimText += transcript;
          }
        }
        setInterim(interimText);
        setFinalText(finalTranscriptRef.current.trim());
      };

      recognition.onerror = (evt) => {
        console.warn("Speech recognition error:", evt.error);
        if (evt.error === "not-allowed" || evt.error === "permission-denied") {
          setMicPermission(false);
          setError("Microphone permission denied.");
          speakText("Microphone permission denied.", lang);
          setListening(false);
        } else if (evt.error === "network") {
          setError("Network error during recognition.");
          speakText("Network error. Please check your connection.", lang);
          setListening(false);
        } else if (evt.error === "no-speech") {
          setError("No speech detected. Speak clearly.");
        } else {
          setError(`Recognition error: ${evt.error}`);
        }
      };

      recognition.onend = () => {
        setListening(false);
      };

      recognition.start();
    } catch (err) {
      console.error("Failed to start recognition:", err);
      setError("Failed to start voice recognition.");
      speakText("Failed to start voice recognition.", lang);
    }
  };

  const stopListening = async () => {
    try {
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch (e) { /* ignore */ }
      }
    } catch (stopErr) {
      console.warn("Error stopping recognition:", stopErr);
    }

    setListening(false);
    const final = (finalTranscriptRef.current + (interim ? " " + interim : "")).trim();
    setFinalText(final);
    setInterim("");
    setError("");

    if (!final) {
      setError("No speech detected. Please try again.");
      speakText("I didn't hear anything. Please try again.", lang);
      return;
    }

    setProcessing(true);
    try {
      const parsed = await parseVoice(final); // returns { action, product, quantity, price, source }
      if (!parsed || typeof parsed !== 'object' || !parsed.action) {
        throw new Error('Invalid parse result');
      }
      speakText("Command received.", lang);
      if (onCommand) onCommand(parsed);
    } catch (err) {
      console.error("parseVoice error:", err);
      const msg = err.response?.data?.details || err.serverMessage || err?.message || "Server error while parsing";
      setError(msg);
      speakText(msg, lang);
    } finally {
      setProcessing(false);
      finalTranscriptRef.current = "";
      setFinalText("");
    }
  };

  useEffect(() => {
    return () => {
      try { recognitionRef.current?.stop(); } catch { /* ignore */ }
    };
  }, []);

  const canStop = !processing && (listening || interim || finalText);

  return (
    <div className={styles.container}>
      <div className={styles.controls}>
        <button
          onClick={startListening}
          disabled={listening || processing}
          className={`${styles.button} ${listening ? styles.listening : ""}`}
          aria-pressed={listening}
          title={listening ? "Recording..." : "Start voice input"}
        >
          <FaMicrophone /> {listening ? "Listening..." : "Start Voice"}
        </button>

        <button
          onClick={stopListening}
          disabled={!canStop}
          className={`${styles.button} ${styles.stop}`}
          title="Stop and process captured speech"
        >
          <FaStop /> {processing ? "Processing..." : "Stop & Process"}
        </button>

        {micPermission === false && (
          <span className={styles.micBlocked}>⚠️ Mic blocked — enable in browser</span>
        )}
      </div>

      <div className={styles.transcriptBox}>
        {interim && <p className={styles.interim}>… {interim}</p>}
        {finalText && <p className={styles.final}>You said: "{finalText}"</p>}
        {error && <p className={styles.error}>⚠️ {error}</p>}
      </div>
    </div>
  );
});

export default VoiceInput;
