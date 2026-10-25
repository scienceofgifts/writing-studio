/**
 * Science of Gifts - Article-Anchored Voice & Written Editing Note Modal
 * Supports:
 * - Voice Note recording (Web Speech API + MediaRecorder server-side Gemini fallback)
 * - Automatic transcript cleanup (removing speech fillers & fixing punctuation while preserving intent)
 * - Editable review field before confirming
 * - Direct text entry ("Write Note")
 * - Seamless switching between Voice Note and Write Note without losing draft text or selection anchor
 * - Prevents saving empty or failed transcriptions
 */

import React, { useState, useEffect, useRef } from 'react';
import { ArticleEditingNote, EditingNoteInputMethod } from '../../types/project';
import { SelectionAnchorCapture, cleanSpeechTranscriptLocally } from '../../utils/editingNotes';
import { geminiService } from '../../services/geminiClient';
import {
  Mic,
  Square,
  PenLine,
  Sparkles,
  Check,
  X,
  RotateCcw,
  AlertCircle,
  Loader2,
  Quote,
  Volume2,
} from 'lucide-react';

interface EditingNoteModalProps {
  isOpen: boolean;
  initialMode: EditingNoteInputMethod;
  anchorCapture: SelectionAnchorCapture | null;
  existingNote?: ArticleEditingNote | null;
  onConfirm: (data: {
    instruction: string;
    rawTranscript?: string;
    inputMethod: EditingNoteInputMethod;
  }) => void;
  onCancel: () => void;
}

type RecordingStatus = 'idle' | 'recording' | 'processing' | 'ready' | 'error';

export const EditingNoteModal: React.FC<EditingNoteModalProps> = ({
  isOpen,
  initialMode,
  anchorCapture,
  existingNote,
  onConfirm,
  onCancel,
}) => {
  const [activeTab, setActiveTab] = useState<EditingNoteInputMethod>(initialMode);
  const [instructionText, setInstructionText] = useState<string>('');
  const [rawTranscript, setRawTranscript] = useState<string>('');
  const [interimTranscript, setInterimTranscript] = useState<string>('');
  const [recordingStatus, setRecordingStatus] = useState<RecordingStatus>('idle');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [showRawTranscript, setShowRawTranscript] = useState<boolean>(false);

  const recognitionRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const accumulatedSpeechRef = useRef<string>('');
  const baseInstructionBeforeRecordRef = useRef<string>('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const quotedText = existingNote?.quotedText || anchorCapture?.quotedText || '';
  const paragraphContext = existingNote?.paragraphContext || anchorCapture?.paragraphContext || '';
  const headingContext = existingNote?.headingContext || anchorCapture?.headingContext;

  // Initialize state when modal opens
  useEffect(() => {
    if (!isOpen) {
      stopAllRecordingCleanup();
      return;
    }

    const mode = existingNote ? existingNote.inputMethod : initialMode;
    setActiveTab(mode);
    setInstructionText(existingNote?.instruction || '');
    setRawTranscript(existingNote?.rawTranscript || '');
    setInterimTranscript('');
    setRecordingStatus(existingNote?.instruction ? 'ready' : 'idle');
    setStatusMessage(null);
    setErrorMessage(null);
    setElapsedSeconds(0);
    setShowRawTranscript(false);

    if (mode === 'text') {
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 60);
    }

    return () => {
      stopAllRecordingCleanup();
    };
  }, [isOpen, existingNote, initialMode]);

  const stopAllRecordingCleanup = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.onend = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onresult = null;
        recognitionRef.current.stop();
      } catch {}
      recognitionRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.onstop = null;
        mediaRecorderRef.current.stop();
      } catch {}
    }
    mediaRecorderRef.current = null;
    if (mediaStreamRef.current) {
      try {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      } catch {}
      mediaStreamRef.current = null;
    }
  };

  if (!isOpen || (!anchorCapture && !existingNote)) {
    return null;
  }

  const getSpeechRecognitionConstructor = (): any => {
    if (typeof window === 'undefined') return null;
    return (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition || null;
  };

  const canUseMediaRecorder = (): boolean => {
    return (
      typeof window !== 'undefined' &&
      typeof navigator !== 'undefined' &&
      Boolean(navigator.mediaDevices?.getUserMedia) &&
      typeof MediaRecorder !== 'undefined'
    );
  };

  const handleStartRecording = async () => {
    setErrorMessage(null);
    setStatusMessage(null);
    setInterimTranscript('');
    accumulatedSpeechRef.current = '';
    baseInstructionBeforeRecordRef.current = instructionText.trim();
    audioChunksRef.current = [];

    const SpeechRecognitionCtor = getSpeechRecognitionConstructor();
    const hasMediaRecorder = canUseMediaRecorder();

    if (!SpeechRecognitionCtor && !hasMediaRecorder) {
      setRecordingStatus('error');
      setErrorMessage(
        'Voice recording is not supported in this browser environment. You can type or edit your note directly in the review field below.'
      );
      return;
    }

    setRecordingStatus('recording');
    setElapsedSeconds(0);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);

    let startedAny = false;

    // 1. Start browser SpeechRecognition if available
    if (SpeechRecognitionCtor) {
      try {
        const recognition = new SpeechRecognitionCtor();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        recognition.onresult = (event: any) => {
          let finalParts = '';
          let interimParts = '';
          for (let i = 0; i < event.results.length; i++) {
            const res = event.results[i];
            if (res.isFinal) {
              finalParts += res[0].transcript + ' ';
            } else {
              interimParts += res[0].transcript;
            }
          }
          if (finalParts.trim()) {
            accumulatedSpeechRef.current = finalParts.trim();
          }
          setInterimTranscript(
            [accumulatedSpeechRef.current, interimParts.trim()].filter(Boolean).join(' ')
          );
        };

        recognition.onerror = (event: any) => {
          const code = event?.error || '';
          if (code === 'not-allowed' || code === 'service-not-allowed') {
            stopAllRecordingCleanup();
            setRecordingStatus('error');
            setErrorMessage(
              'Microphone permission was denied or blocked. Please allow microphone access or type your note below.'
            );
          } else if (code === 'no-speech' && !hasMediaRecorder) {
            // Let user stop manually or retry
          }
        };

        recognition.start();
        recognitionRef.current = recognition;
        startedAny = true;
      } catch (err) {
        console.warn('SpeechRecognition start fallback:', err);
      }
    }

    // 2. Also start MediaRecorder if available so we have audio fallback if SpeechRecognition is unavailable or yields empty
    if (hasMediaRecorder) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaStreamRef.current = stream;
        const recorder = new MediaRecorder(stream);
        recorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) {
            audioChunksRef.current.push(e.data);
          }
        };
        recorder.start();
        mediaRecorderRef.current = recorder;
        startedAny = true;
      } catch (err: any) {
        if (!startedAny) {
          stopAllRecordingCleanup();
          setRecordingStatus('error');
          setErrorMessage(
            err?.name === 'NotAllowedError'
              ? 'Microphone access was denied. You can type your editing note directly below.'
              : 'Could not access microphone. You can type your editing note directly below.'
          );
          return;
        }
      }
    }
  };

  const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const res = String(reader.result || '');
        const base64 = res.includes(',') ? res.split(',')[1] : res;
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  const handleStopRecording = async () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    // Stop SpeechRecognition
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
      recognitionRef.current = null;
    }

    // Stop MediaRecorder and collect audio blob if any
    let recordedBlob: Blob | null = null;
    let recordedMimeType = 'audio/webm';

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      recordedMimeType = mediaRecorderRef.current.mimeType || 'audio/webm';
      recordedBlob = await new Promise<Blob | null>((resolve) => {
        const recorder = mediaRecorderRef.current!;
        recorder.onstop = () => {
          if (audioChunksRef.current.length > 0) {
            resolve(new Blob(audioChunksRef.current, { type: recordedMimeType }));
          } else {
            resolve(null);
          }
        };
        try {
          recorder.stop();
        } catch {
          resolve(null);
        }
      });
    }
    mediaRecorderRef.current = null;

    if (mediaStreamRef.current) {
      try {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      } catch {}
      mediaStreamRef.current = null;
    }

    const spokenText = (accumulatedSpeechRef.current || interimTranscript).trim();
    setInterimTranscript('');

    // Case A: Browser SpeechRecognition captured transcript
    if (spokenText) {
      setRecordingStatus('processing');
      setStatusMessage('Cleaning up speech fillers and punctuation...');
      const combinedRaw = baseInstructionBeforeRecordRef.current
        ? `${baseInstructionBeforeRecordRef.current} ${spokenText}`
        : spokenText;
      setRawTranscript(combinedRaw);

      // Apply immediate deterministic cleanup first so user sees fast response, then AI cleanup
      const deterministicClean = cleanSpeechTranscriptLocally(combinedRaw);
      setInstructionText(deterministicClean);

      try {
        const res = await geminiService.cleanVoiceTranscript({
          rawTranscript: combinedRaw,
          quotedText,
          paragraphContext,
        });
        if (res.ok && res.cleanedTranscript) {
          setInstructionText(res.cleanedTranscript);
          setStatusMessage(
            res.usedAi
              ? 'Transcription cleaned (fillers removed, intent preserved). Review or edit below.'
              : 'Transcription cleaned locally. Review or edit below.'
          );
        } else {
          setStatusMessage('Transcription ready. Review or edit below.');
        }
      } catch {
        setStatusMessage('Transcription ready. Review or edit below.');
      }
      setRecordingStatus('ready');
      return;
    }

    // Case B: No browser speech recognition text, try server-side Gemini audio transcription if blob exists
    if (recordedBlob && recordedBlob.size > 200) {
      setRecordingStatus('processing');
      setStatusMessage('Transcribing and cleaning voice note...');
      try {
        const base64Audio = await blobToBase64(recordedBlob);
        const res = await geminiService.transcribeVoiceNoteAudio({
          audioBase64: base64Audio,
          mimeType: recordedMimeType,
          quotedText,
          paragraphContext,
        });

        if (res.ok && res.cleanedTranscript) {
          const combinedRaw = baseInstructionBeforeRecordRef.current
            ? `${baseInstructionBeforeRecordRef.current} ${res.rawTranscript || res.cleanedTranscript}`
            : res.rawTranscript || res.cleanedTranscript;
          const combinedClean = baseInstructionBeforeRecordRef.current
            ? `${baseInstructionBeforeRecordRef.current} ${res.cleanedTranscript}`
            : res.cleanedTranscript;

          setRawTranscript(combinedRaw);
          setInstructionText(combinedClean);
          setRecordingStatus('ready');
          setStatusMessage(
            'Voice note transcribed & cleaned. Review or edit before saving.'
          );
          return;
        } else {
          setRecordingStatus('error');
          setErrorMessage(
            res.error ||
              'No clear speech was detected in the recording. Please try recording again or type your note below.'
          );
          return;
        }
      } catch (err: any) {
        setRecordingStatus('error');
        setErrorMessage(
          err?.message ||
            'Voice transcription failed. You can retry recording or type your instruction directly below.'
        );
        return;
      }
    }

    // Case C: Empty / silent recording
    setRecordingStatus('error');
    setErrorMessage(
      'No speech was detected during recording. Please try speaking again or type your editing instruction below.'
    );
  };

  const handleManualCleanTranscript = async () => {
    const current = instructionText.trim();
    if (!current) return;
    setRecordingStatus('processing');
    setErrorMessage(null);
    setStatusMessage('Cleaning fillers and punctuation...');
    if (!rawTranscript) {
      setRawTranscript(current);
    }
    const localCleaned = cleanSpeechTranscriptLocally(current);
    setInstructionText(localCleaned);
    try {
      const res = await geminiService.cleanVoiceTranscript({
        rawTranscript: current,
        quotedText,
        paragraphContext,
      });
      if (res.ok && res.cleanedTranscript) {
        setInstructionText(res.cleanedTranscript);
      }
      setStatusMessage('Cleaned speech fillers and punctuation while preserving your intent.');
    } catch {
      setStatusMessage('Cleaned speech fillers and punctuation.');
    } finally {
      setRecordingStatus('ready');
    }
  };

  const handleConfirmSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (recordingStatus === 'recording' || recordingStatus === 'processing') {
      return;
    }
    const trimmed = instructionText.trim();
    if (!trimmed) {
      setErrorMessage('Please record or enter an editing instruction before saving this note.');
      return;
    }

    onConfirm({
      instruction: trimmed,
      rawTranscript: rawTranscript.trim() || undefined,
      inputMethod: activeTab,
    });
  };

  const formatTimer = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const rem = secs % 60;
    return `${mins}:${rem < 10 ? '0' : ''}${rem}`;
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[1px] p-3 sm:p-4 animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-labelledby="editing-note-modal-title"
    >
      <div className="bg-[#faf9f6] border border-[#dcd6ca] rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-4 sm:px-5 py-3.5 bg-[#f5f2ea] border-b border-[#e5dfd3] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-lg bg-amber-100 border border-amber-300 text-amber-900 flex items-center justify-center">
              {activeTab === 'voice' ? (
                <Mic className="w-4 h-4 text-amber-800" />
              ) : (
                <PenLine className="w-4 h-4 text-amber-800" />
              )}
            </span>
            <div>
              <h3
                id="editing-note-modal-title"
                className="font-editorial font-bold text-base text-[#1e232a] leading-tight"
              >
                {existingNote ? 'Edit Anchored Note' : 'Attach Article Editing Note'}
              </h3>
              <p className="text-[11px] text-[#736c61]">
                {headingContext
                  ? `Section: ${headingContext}`
                  : 'Anchored to selected passage for consolidated AI revision brief'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              stopAllRecordingCleanup();
              onCancel();
            }}
            className="p-1.5 text-[#736c61] hover:text-[#1e232a] rounded-lg hover:bg-[#e8e2d5] transition-colors"
            title="Cancel and close (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Mode Switcher: Voice Note vs Write Note (Preserves draft instruction & passage anchor) */}
        <div className="px-4 sm:px-5 pt-3 bg-[#faf9f6] flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('voice')}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-semibold border transition-all inline-flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'voice'
                ? 'bg-[#1e232a] text-white border-[#1e232a] shadow-2xs'
                : 'bg-white text-[#5c5447] border-[#dcd6ca] hover:bg-[#f5f2ea]'
            }`}
          >
            <Mic className="w-3.5 h-3.5" />
            <span>Voice Note</span>
          </button>

          <button
            type="button"
            onClick={() => {
              if (recordingStatus === 'recording') {
                handleStopRecording();
              }
              setActiveTab('text');
              setTimeout(() => textareaRef.current?.focus(), 40);
            }}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-semibold border transition-all inline-flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'text'
                ? 'bg-[#1e232a] text-white border-[#1e232a] shadow-2xs'
                : 'bg-white text-[#5c5447] border-[#dcd6ca] hover:bg-[#f5f2ea]'
            }`}
          >
            <PenLine className="w-3.5 h-3.5" />
            <span>Write Note</span>
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleConfirmSubmit} className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1">
          {/* Anchored Passage Preview */}
          <div className="p-3 rounded-xl bg-[#f6f3eb] border border-[#e5dfd3] space-y-1.5">
            <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-[#736c61]">
              <span className="inline-flex items-center gap-1">
                <Quote className="w-3 h-3 text-amber-800" />
                <span>Anchored Passage</span>
              </span>
              <span>{quotedText.split(/\s+/).filter(Boolean).length} words</span>
            </div>
            <blockquote className="font-editorial text-xs sm:text-sm text-[#1e232a] italic border-l-2 border-amber-600 pl-2.5 py-0.5 max-h-24 overflow-y-auto">
              &ldquo;{quotedText}&rdquo;
            </blockquote>
            {paragraphContext && paragraphContext.trim() !== quotedText.trim() && (
              <details className="text-[11px] text-[#736c61] pt-0.5">
                <summary className="cursor-pointer hover:text-[#1e232a] font-medium select-none">
                  View containing paragraph context
                </summary>
                <p className="mt-1 p-2 rounded-lg bg-white/80 border border-[#e5dfd3] text-[#4a443b] font-editorial leading-relaxed">
                  {paragraphContext}
                </p>
              </details>
            )}
          </div>

          {/* Voice Recording Controls (When in Voice Note tab) */}
          {activeTab === 'voice' && (
            <div className="p-3.5 rounded-xl bg-white border border-[#dcd6ca] space-y-3 shadow-2xs">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {recordingStatus === 'recording' ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-100 text-rose-900 border border-rose-300 text-xs font-bold animate-pulse">
                      <span className="w-2 h-2 rounded-full bg-rose-600" />
                      <span>Recording ({formatTimer(elapsedSeconds)})</span>
                    </span>
                  ) : recordingStatus === 'processing' ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-100 text-amber-900 border border-amber-300 text-xs font-semibold">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-800" />
                      <span>Processing & Cleaning...</span>
                    </span>
                  ) : (
                    <span className="text-xs font-semibold text-[#2d333b] inline-flex items-center gap-1.5">
                      <Volume2 className="w-3.5 h-3.5 text-amber-800" />
                      <span>Speak your editing instruction for ChatGPT / Claude</span>
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1.5">
                  {recordingStatus !== 'recording' ? (
                    <button
                      type="button"
                      disabled={recordingStatus === 'processing'}
                      onClick={handleStartRecording}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-800 hover:bg-amber-900 text-white transition-colors inline-flex items-center gap-1.5 shadow-2xs cursor-pointer disabled:opacity-50"
                    >
                      <Mic className="w-3.5 h-3.5" />
                      <span>{instructionText.trim() ? 'Record More / Re-record' : 'Start Recording'}</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleStopRecording}
                      className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-rose-700 hover:bg-rose-800 text-white transition-colors inline-flex items-center gap-1.5 shadow-2xs cursor-pointer"
                    >
                      <Square className="w-3.5 h-3.5 fill-current" />
                      <span>Stop & Transcribe</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Live Interim Speech Preview */}
              {recordingStatus === 'recording' && (
                <div className="p-2.5 rounded-lg bg-amber-50/70 border border-amber-200 text-xs text-[#4a443b] min-h-[44px]">
                  {interimTranscript ? (
                    <p className="italic">&ldquo;{interimTranscript}&rdquo;</p>
                  ) : (
                    <p className="text-[#8a8275]">
                      Listening... Describe what you want changed in this passage (e.g., &ldquo;Make this sentence more concise and cut the cliché&rdquo;).
                    </p>
                  )}
                </div>
              )}

              {/* Status Banner */}
              {statusMessage && recordingStatus !== 'recording' && (
                <div className="px-2.5 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-[11px] text-emerald-900 flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                    <span>{statusMessage}</span>
                  </span>
                  {rawTranscript && rawTranscript.trim() !== instructionText.trim() && (
                    <button
                      type="button"
                      onClick={() => setShowRawTranscript(!showRawTranscript)}
                      className="text-[10px] font-semibold underline text-emerald-800 hover:text-emerald-950 shrink-0 cursor-pointer"
                    >
                      {showRawTranscript ? 'Hide Raw' : 'View Raw'}
                    </button>
                  )}
                </div>
              )}

              {showRawTranscript && rawTranscript && (
                <div className="p-2 rounded-lg bg-[#f6f3eb] border border-[#e5dfd3] text-[11px] text-[#5c5447] flex items-start justify-between gap-2">
                  <div>
                    <span className="font-bold uppercase text-[9px] tracking-wider text-[#8a8275] block">
                      Original Uncleaned Transcript:
                    </span>
                    <span className="italic">&ldquo;{rawTranscript}&rdquo;</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setInstructionText(rawTranscript)}
                    className="px-2 py-0.5 rounded bg-white border border-[#dcd6ca] text-[10px] font-semibold text-[#1e232a] hover:bg-[#ede8dc] shrink-0 inline-flex items-center gap-1"
                    title="Restore raw transcript"
                  >
                    <RotateCcw className="w-2.5 h-2.5" />
                    <span>Use Raw</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Error Notice */}
          {errorMessage && (
            <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-900 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="flex-1">{errorMessage}</div>
            </div>
          )}

          {/* Editable Review & Manual Instruction Field */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label
                htmlFor="editing-note-instruction-input"
                className="text-[11px] font-bold uppercase tracking-wider text-[#4a443b]"
              >
                {activeTab === 'voice'
                  ? 'Review & Edit Cleaned Instruction *'
                  : 'Editing Instruction *'}
              </label>

              {instructionText.trim().length > 3 && recordingStatus !== 'recording' && (
                <button
                  type="button"
                  disabled={recordingStatus === 'processing'}
                  onClick={handleManualCleanTranscript}
                  className="text-[11px] font-semibold text-amber-800 hover:text-amber-950 inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                  title="Remove filler words and clean up punctuation while keeping your exact intent"
                >
                  <Sparkles className="w-3 h-3" />
                  <span>Clean Fillers & Punctuation</span>
                </button>
              )}
            </div>

            <textarea
              id="editing-note-instruction-input"
              ref={textareaRef}
              rows={4}
              value={instructionText}
              onChange={(e) => {
                setInstructionText(e.target.value);
                if (errorMessage) setErrorMessage(null);
              }}
              placeholder={
                activeTab === 'voice'
                  ? 'Your cleaned voice transcription will appear here for review, or you can type/edit directly...'
                  : 'Describe the change you want ChatGPT or Claude to make to this passage (e.g., "Tighten this paragraph, keep the historical detail about the brass case, and make the transition smoother.")...'
              }
              className="w-full p-3 rounded-xl border border-[#dcd6ca] bg-white text-xs sm:text-sm text-[#1e232a] focus:outline-hidden focus:border-amber-600 focus:ring-1 focus:ring-amber-500 leading-relaxed"
            />
            <p className="text-[11px] text-[#736c61]">
              Saving this note attaches a marker to the passage without modifying the article text.
            </p>
          </div>

          {/* Footer Buttons */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#e5dfd3]">
            <button
              type="button"
              onClick={() => {
                stopAllRecordingCleanup();
                onCancel();
              }}
              className="px-3.5 py-2 rounded-xl text-xs font-semibold text-[#5c5447] hover:text-[#1e232a] hover:bg-[#ede8dc] transition-colors cursor-pointer"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={
                !instructionText.trim() ||
                recordingStatus === 'recording' ||
                recordingStatus === 'processing'
              }
              className="px-4 py-2 rounded-xl text-xs font-bold bg-[#1e232a] hover:bg-[#2d3440] text-white transition-colors inline-flex items-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Check className="w-3.5 h-3.5" />
              <span>{existingNote ? 'Update Note' : 'Confirm & Save Note'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
