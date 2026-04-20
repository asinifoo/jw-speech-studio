"""STT 서비스 — Whisper 로드/변환/언로드, duration 측정 (Phase 4)"""
import os
import subprocess
import tempfile
from pathlib import Path

import torch


MODEL_ID = "o0dimplz0o/Whisper-Large-v3-turbo-STT-Zeroth-KO-v2"

VIDEO_EXTS = {".mp4", ".mkv", ".avi", ".mov", ".webm", ".flv", ".wmv"}
AUDIO_EXTS = {".mp3", ".wav", ".m4a", ".flac", ".ogg", ".aac"}
ALL_EXTS = VIDEO_EXTS | AUDIO_EXTS


def get_audio_duration(path: str) -> float:
    """ffprobe로 duration(초) 측정. 실패 시 예외 발생."""
    result = subprocess.run(
        [
            "ffprobe", "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            path,
        ],
        capture_output=True, text=True, check=True,
    )
    return float(result.stdout.strip())


def load_whisper_model():
    """Whisper 모델 로드 (GPU, float16)."""
    from transformers import pipeline
    return pipeline(
        "automatic-speech-recognition",
        model=MODEL_ID,
        torch_dtype=torch.float16,
        device="cuda",
    )


def unload_whisper_model(pipe):
    """모델 객체 삭제 + VRAM 해제."""
    try:
        del pipe
    except Exception:
        pass
    try:
        torch.cuda.empty_cache()
    except Exception:
        pass


def extract_audio(file_path: str, tmp_dir: str) -> str:
    """비디오에서 16kHz mono WAV 추출."""
    wav_path = os.path.join(tmp_dir, "audio.wav")
    cmd = [
        "ffmpeg", "-y",
        "-i", str(file_path),
        "-vn",
        "-acodec", "pcm_s16le",
        "-ar", "16000",
        "-ac", "1",
        wav_path,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"ffmpeg 오류: {result.stderr[-500:]}")
    return wav_path


def _run_pipe(pipe, path: str) -> dict:
    return pipe(
        path,
        generate_kwargs={"language": "ko"},
        return_timestamps=True,
        chunk_length_s=30,
        batch_size=16,
    )


def transcribe_file(pipe, file_path: str) -> dict:
    """변환 실행. {raw_text, raw_chunks} 반환.
    비디오 + 비-WAV 오디오는 ffmpeg로 16kHz mono WAV 추출 후 처리 (soundfile 호환)."""
    ext = Path(file_path).suffix.lower()
    if ext == ".wav":
        result = _run_pipe(pipe, file_path)
    else:
        with tempfile.TemporaryDirectory() as tmp:
            wav = extract_audio(file_path, tmp)
            result = _run_pipe(pipe, wav)

    chunks = []
    for c in result.get("chunks", []) or []:
        text = (c.get("text") or "").strip()
        if not text:
            continue
        ts = c.get("timestamp") or (None, None)
        start = ts[0] if len(ts) >= 1 else None
        end = ts[1] if len(ts) >= 2 else None
        chunks.append({"start": start, "end": end, "text": text})

    return {
        "raw_text": (result.get("text") or "").strip(),
        "raw_chunks": chunks,
    }
