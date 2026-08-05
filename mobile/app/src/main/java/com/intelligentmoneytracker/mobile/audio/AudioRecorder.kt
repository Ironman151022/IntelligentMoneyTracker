package com.intelligentmoneytracker.mobile.audio

import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.isActive
import kotlinx.coroutines.withContext
import java.io.ByteArrayOutputStream
import kotlin.math.abs

/**
 * Records mono 16-bit PCM at 16 kHz and wraps the result in a WAV container.
 * Auto-stops after [SILENCE_DURATION_MS] of continuous silence (peak amplitude
 * below [SILENCE_THRESHOLD]), or when [requestStop] is called.
 */
class AudioRecorder {

    companion object {
        private const val SAMPLE_RATE = 16_000
        private const val SILENCE_THRESHOLD = 700        // peak amplitude (0–32 767)
        private const val SILENCE_DURATION_MS = 2_000L   // 2 s of silence → auto-submit
        private const val MIN_SPEECH_BYTES = SAMPLE_RATE * 2  // 0.5 s minimum before silence counts
        private const val MAX_RECORDING_MS = 30_000L     // safety cap
    }

    @Volatile private var shouldStop: Boolean = false

    /** Suspends on Dispatchers.IO until silence is detected or [requestStop] is called. */
    suspend fun record(onAmplitude: (Float) -> Unit): ByteArray = withContext(Dispatchers.IO) {
        shouldStop = false
        val minBuf = AudioRecord.getMinBufferSize(
            SAMPLE_RATE,
            AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT,
        )
        val bufferSize = maxOf(minBuf, 3_200)
        val audioRecord = AudioRecord(
            MediaRecorder.AudioSource.MIC,
            SAMPLE_RATE,
            AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT,
            bufferSize,
        )
        val output = ByteArrayOutputStream()
        val chunk = ShortArray(bufferSize / 2)
        var silenceStartMs = -1L
        val startMs = System.currentTimeMillis()

        audioRecord.startRecording()
        try {
            while (isActive && !shouldStop) {
                if (System.currentTimeMillis() - startMs > MAX_RECORDING_MS) break
                val read = audioRecord.read(chunk, 0, chunk.size)
                if (read <= 0) continue
                writeChunkToStream(chunk, read, output)
                val peak = peakAmplitude(chunk, read)
                onAmplitude(peak / 32_767f)
                if (output.size() >= MIN_SPEECH_BYTES) {
                    val now = System.currentTimeMillis()
                    if (peak < SILENCE_THRESHOLD) {
                        if (silenceStartMs < 0) silenceStartMs = now
                        else if (now - silenceStartMs >= SILENCE_DURATION_MS) break
                    } else {
                        silenceStartMs = -1L
                    }
                }
            }
        } finally {
            audioRecord.stop()
            audioRecord.release()
        }
        wrapPcmInWav(output.toByteArray())
    }

    fun requestStop() {
        shouldStop = true
    }

    private fun writeChunkToStream(chunk: ShortArray, count: Int, output: ByteArrayOutputStream) {
        for (i in 0 until count) {
            val s = chunk[i].toInt()
            output.write(s and 0xFF)
            output.write((s ushr 8) and 0xFF)
        }
    }

    private fun peakAmplitude(chunk: ShortArray, count: Int): Int =
        (0 until count).maxOf { abs(chunk[it].toInt()) }

    private fun wrapPcmInWav(pcm: ByteArray): ByteArray {
        val byteRate = SAMPLE_RATE * 2
        val header = ByteArray(44)
        "RIFF".encodeToByteArray().copyInto(header, 0)
        intLE(pcm.size + 36).copyInto(header, 4)
        "WAVE".encodeToByteArray().copyInto(header, 8)
        "fmt ".encodeToByteArray().copyInto(header, 12)
        intLE(16).copyInto(header, 16)
        shortLE(1).copyInto(header, 20)         // PCM format
        shortLE(1).copyInto(header, 22)         // mono
        intLE(SAMPLE_RATE).copyInto(header, 24)
        intLE(byteRate).copyInto(header, 28)
        shortLE(2).copyInto(header, 32)         // block align
        shortLE(16).copyInto(header, 34)        // bits per sample
        "data".encodeToByteArray().copyInto(header, 36)
        intLE(pcm.size).copyInto(header, 40)
        return header + pcm
    }

    private fun intLE(value: Int): ByteArray = byteArrayOf(
        (value and 0xFF).toByte(),
        ((value shr 8) and 0xFF).toByte(),
        ((value shr 16) and 0xFF).toByte(),
        ((value shr 24) and 0xFF).toByte(),
    )

    private fun shortLE(value: Int): ByteArray = byteArrayOf(
        (value and 0xFF).toByte(),
        ((value shr 8) and 0xFF).toByte(),
    )
}
