import { useState, useRef, useCallback, useEffect } from 'react';
import { GoogleGenAI, LiveSession, LiveServerMessage, Modality, Blob } from '@google/genai';
import { TranscriptEntry, ConversationRole, ConnectionState } from '../types';
import { encode, decode, decodeAudioData } from '../utils/audio';

const INPUT_SAMPLE_RATE = 16000;
const OUTPUT_SAMPLE_RATE = 24000;
const BUFFER_SIZE = 4096;

export const useGeminiLive = () => {
  const [connectionState, setConnectionState] = useState<ConnectionState>(ConnectionState.IDLE);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [analyserNode, setAnalyserNode] = useState<AnalyserNode | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  
  const aiRef = useRef<GoogleGenAI | null>(null);
  const sessionPromiseRef = useRef<Promise<LiveSession> | null>(null);
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const mediaStreamSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

  const currentInputTranscriptionRef = useRef('');
  const currentOutputTranscriptionRef = useRef('');

  useEffect(() => {
    return () => {
      // Cleanup on unmount
      closeSession();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleMessage = async (message: LiveServerMessage) => {
    if (message.serverContent?.outputTranscription) {
      currentOutputTranscriptionRef.current += message.serverContent.outputTranscription.text;
    }
    if (message.serverContent?.inputTranscription) {
      currentInputTranscriptionRef.current += message.serverContent.inputTranscription.text;
    }

    if (message.serverContent?.turnComplete) {
      const fullInput = currentInputTranscriptionRef.current.trim();
      const fullOutput = currentOutputTranscriptionRef.current.trim();
      
      setTranscript(prev => {
        const newTranscript = [...prev];
        if (fullInput) newTranscript.push({ id: `user-${Date.now()}`, role: ConversationRole.USER, text: fullInput });
        if (fullOutput) newTranscript.push({ id: `model-${Date.now()}`, role: ConversationRole.MODEL, text: fullOutput });
        return newTranscript;
      });

      currentInputTranscriptionRef.current = '';
      currentOutputTranscriptionRef.current = '';
    }

    const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
    if (base64Audio && outputAudioContextRef.current) {
      nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outputAudioContextRef.current.currentTime);
      const audioBuffer = await decodeAudioData(decode(base64Audio), outputAudioContextRef.current, OUTPUT_SAMPLE_RATE, 1);
      const source = outputAudioContextRef.current.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(outputAudioContextRef.current.destination);
      source.addEventListener('ended', () => {
        sourcesRef.current.delete(source);
      });
      source.start(nextStartTimeRef.current);
      nextStartTimeRef.current += audioBuffer.duration;
      sourcesRef.current.add(source);
    }
    
    if (message.serverContent?.interrupted) {
        for (const source of sourcesRef.current.values()) {
            source.stop();
        }
        sourcesRef.current.clear();
        nextStartTimeRef.current = 0;
    }
  };

  const handleError = (error: ErrorEvent) => {
    console.error('Gemini Live API Error:', error);
    setConnectionState(ConnectionState.ERROR);
    setErrorMessage('A connection error occurred.');
    closeSession();
  };
  
  const handleClose = () => {
    setConnectionState(ConnectionState.CLOSED);
  };

  const startSession = useCallback(async () => {
    if (connectionState !== ConnectionState.IDLE && connectionState !== ConnectionState.CLOSED && connectionState !== ConnectionState.ERROR) return;

    setConnectionState(ConnectionState.CONNECTING);
    setTranscript([]);
    setErrorMessage(null);
    currentInputTranscriptionRef.current = '';
    currentOutputTranscriptionRef.current = '';

    try {
      if (!process.env.API_KEY) {
          throw new Error("API_KEY environment variable not set.");
      }
      aiRef.current = new GoogleGenAI({ apiKey: process.env.API_KEY });

      const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: INPUT_SAMPLE_RATE });
      const outputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: OUTPUT_SAMPLE_RATE });
      inputAudioContextRef.current = inputCtx;
      outputAudioContextRef.current = outputCtx;
      
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamSourceRef.current = inputCtx.createMediaStreamSource(stream);

      const analyser = inputCtx.createAnalyser();
      analyser.fftSize = 2048;
      mediaStreamSourceRef.current.connect(analyser);
      setAnalyserNode(analyser);
      
      scriptProcessorRef.current = inputCtx.createScriptProcessor(BUFFER_SIZE, 1, 1);

      sessionPromiseRef.current = aiRef.current.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        callbacks: {
          onopen: () => {
            setConnectionState(ConnectionState.CONNECTED);
            scriptProcessorRef.current!.onaudioprocess = (audioProcessingEvent) => {
              const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
              const l = inputData.length;
              const int16 = new Int16Array(l);
              for (let i = 0; i < l; i++) {
                int16[i] = inputData[i] * 32768;
              }
              const pcmBlob: Blob = {
                data: encode(new Uint8Array(int16.buffer)),
                mimeType: `audio/pcm;rate=${INPUT_SAMPLE_RATE}`,
              };
              sessionPromiseRef.current?.then((session) => {
                session.sendRealtimeInput({ media: pcmBlob });
              });
            };
            mediaStreamSourceRef.current?.connect(scriptProcessorRef.current!);
            scriptProcessorRef.current?.connect(inputCtx.destination);
          },
          onmessage: handleMessage,
          onerror: handleError,
          onclose: handleClose,
        },
        config: {
          responseModalities: [Modality.AUDIO],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } },
          },
          systemInstruction: 'You are a friendly and helpful conversational AI. Keep your responses concise and natural.',
        },
      });

    } catch (error) {
      console.error('Failed to start session:', error);
      if (error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError')) {
        setErrorMessage('Microphone permission was denied. Please allow microphone access in your browser settings and try again.');
      } else if (error instanceof Error) {
        setErrorMessage(`Failed to start session: ${error.message}`);
      } else {
        setErrorMessage('An unknown error occurred while starting the session.');
      }
      setConnectionState(ConnectionState.ERROR);
    }
  }, [connectionState]);

  const closeSession = useCallback(() => {
    if (connectionState === ConnectionState.IDLE || connectionState === ConnectionState.CLOSED) return;

    setConnectionState(ConnectionState.CLOSING);

    sessionPromiseRef.current?.then(session => session.close()).catch(console.error);
    sessionPromiseRef.current = null;

    scriptProcessorRef.current?.disconnect();
    scriptProcessorRef.current = null;
    
    mediaStreamSourceRef.current?.mediaStream.getTracks().forEach(track => track.stop());
    mediaStreamSourceRef.current?.disconnect();
    mediaStreamSourceRef.current = null;
    
    setAnalyserNode(null);

    inputAudioContextRef.current?.close().catch(console.error);
    outputAudioContextRef.current?.close().catch(console.error);
    inputAudioContextRef.current = null;
    outputAudioContextRef.current = null;
    
    sourcesRef.current.forEach(source => source.stop());
    sourcesRef.current.clear();
    nextStartTimeRef.current = 0;

    setConnectionState(ConnectionState.CLOSED);
  }, [connectionState]);

  return { connectionState, transcript, analyserNode, startSession, closeSession, errorMessage };
};