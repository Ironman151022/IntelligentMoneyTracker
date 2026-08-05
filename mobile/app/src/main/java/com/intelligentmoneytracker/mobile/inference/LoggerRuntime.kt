package com.intelligentmoneytracker.mobile.inference

import android.content.Context
import android.util.Log
import com.google.ai.edge.litertlm.Backend
import com.google.ai.edge.litertlm.Capabilities
import com.google.ai.edge.litertlm.Content
import com.google.ai.edge.litertlm.Conversation
import com.google.ai.edge.litertlm.ConversationConfig
import com.google.ai.edge.litertlm.Contents
import com.google.ai.edge.litertlm.Engine
import com.google.ai.edge.litertlm.EngineConfig
import com.google.ai.edge.litertlm.ExperimentalApi
import com.google.ai.edge.litertlm.ExperimentalFlags
import com.google.ai.edge.litertlm.Message
import com.google.ai.edge.litertlm.MessageCallback
import com.google.ai.edge.litertlm.SamplerConfig
import com.intelligentmoneytracker.mobile.data.TransactionDao
import com.intelligentmoneytracker.mobile.data.TransactionEntity
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import org.json.JSONObject

data class SpikeResult(
    val rawResponse: String,
    val parsedAction: String,
    val storedTransactionId: Long? = null,
)

/**
 * On-device logger inference — aligned with Google AI Edge Gallery's LiteRT-LM pattern.
 *
 * Key rules that match Gallery (LlmChatModelHelper.kt):
 * 1. [Engine] is created ONCE per model path and kept warm (never close between prompts).
 * 2. [Conversation] is kept open across turns; first real user turn pays system-prompt prefill.
 * 3. Thinking is disabled via extraContext `enable_thinking=false` (Gallery's approach).
 * 4. [sendMessageAsync] is used for streaming callbacks, matching Gallery exactly.
 * 5. Never call conversation.close()/engine.close() from inside [MessageCallback] —
 *    LiteRT waits on callback_thread_pool (≈10s) and that deadlocks → DEADLINE_EXCEEDED.
 * 6. [MAX_NUM_TOKENS] is 2048 so the KV cache fits in mobile GPU VRAM.
 * 7. [cacheDir] is null for production model paths, matching Gallery.
 */
class LoggerInferenceEngine(
    private val context: Context,
    private val transactionDao: TransactionDao,
) {
    private val mutex: Mutex = Mutex()
    private var engine: Engine? = null
    private var conversation: Conversation? = null
    private var loadedModelPath: String? = null
    private var isAudioBackendLoaded: Boolean = false
    private var cachedSystemPrompt: String? = null

    /**
     * Pre-initialize Engine + Conversation only (Gallery pattern).
     * Do NOT send a dummy message or close() from inside MessageCallback — LiteRT's
     * callback_thread_pool waits ≤10s for that callback to finish, and closing from
     * onDone deadlocks it → DEADLINE_EXCEEDED.
     */
    suspend fun warmUp(modelPath: String) {
        withContext(Dispatchers.Default) {
            mutex.withLock {
                val t = System.currentTimeMillis()
                ensureEngineReady(modelPath, needsAudio = false)
                Log.i(
                    TAG,
                    "warmUp finished in ${System.currentTimeMillis() - t} ms " +
                        "(backend=${engine?.engineConfig?.backend})",
                )
            }
        }
    }

    /** Free native LiteRT resources. Call from onCleared only. */
    suspend fun release() {
        withContext(Dispatchers.Default) {
            mutex.withLock { closeRuntime() }
        }
    }

    suspend fun runUserText(modelPath: String, userText: String): SpikeResult = runPrompt(
        modelPath = modelPath,
        messageText = userText,
        audioBytes = null,
        captureSource = "user_text",
    )

    suspend fun runUserAudio(modelPath: String, audioBytes: ByteArray): SpikeResult = runPrompt(
        modelPath = modelPath,
        messageText = "Listen to this audio and extract the transaction. Return one JSON object only.",
        audioBytes = audioBytes,
        captureSource = "user_audio",
    )

    suspend fun runTextSpike(modelPath: String): SpikeResult = runPrompt(
        modelPath = modelPath,
        messageText = "Ordered lunch on Zomato for ₹400 via UPI.",
        audioBytes = null,
        captureSource = "text_spike",
    )

    suspend fun runAudioSpike(modelPath: String): SpikeResult = runPrompt(
        modelPath = modelPath,
        messageText = "Extract the transaction from this audio and respond with one JSON object only.",
        audioBytes = requireSpikeAudio(),
        captureSource = "audio_spike",
    )

    private suspend fun runPrompt(
        modelPath: String,
        messageText: String,
        audioBytes: ByteArray?,
        captureSource: String,
    ): SpikeResult = withContext(Dispatchers.Default) {
        val response: String = mutex.withLock {
            executeOnWarmEngine(modelPath, messageText, audioBytes)
        }
        val cleaned = response
            .removePrefix("```json")
            .removePrefix("```")
            .removeSuffix("```")
            .trim()
        val json: JSONObject = JSONObject(cleaned)
        val action: String = validateResponse(json)
        val storedId: Long? = if (action == "log_transaction") {
            transactionDao.insert(
                TransactionEntity(
                    amount = json.getDouble("amount"),
                    currency = json.optString("currency", "INR"),
                    status = json.optString("status", "completed"),
                    transactionType = json.optString("transaction_type", "expense"),
                    paymentMethod = json.optString("payment_method").takeIf(String::isNotBlank),
                    beneficiary = json.optString("beneficiary").takeIf(String::isNotBlank),
                    merchant = json.optString("merchant").takeIf(String::isNotBlank),
                    category = json.optString("category").takeIf(String::isNotBlank),
                    subCategory = json.optString("sub_category").takeIf(String::isNotBlank),
                    itemsJson = json.optJSONArray("items")?.toString(),
                    rawJson = json.toString(2),
                    captureSource = captureSource,
                    createdAtEpochMs = System.currentTimeMillis(),
                ),
            )
        } else {
            null
        }
        SpikeResult(
            rawResponse = json.toString(2),
            parsedAction = action,
            storedTransactionId = storedId,
        )
    }

    /**
     * Sends the message using [sendMessageAsync] (Gallery's streaming callback API).
     * Accumulates token text and suspends until [MessageCallback.onDone].
     * The [mutex] remains locked for the duration — preventing concurrent inference calls.
     */
    private suspend fun executeOnWarmEngine(
        modelPath: String,
        messageText: String,
        audioBytes: ByteArray?,
    ): String = suspendCancellableCoroutine { cont ->
        ensureEngineReady(modelPath, needsAudio = audioBytes != null)
        val activeConversation: Conversation = conversation
            ?: error("Conversation not initialized after ensureEngineReady.")
        val parts: List<Content> = buildList {
            if (audioBytes != null) add(Content.AudioBytes(audioBytes))
            add(Content.Text(messageText))
        }
        val t = System.currentTimeMillis()
        val response = StringBuilder()
        activeConversation.sendMessageAsync(
            Contents.of(parts),
            object : MessageCallback {
                override fun onMessage(message: Message) {
                    val token = message.toString()
                    if (!token.startsWith("<ctrl")) response.append(token)
                }
                override fun onDone() {
                    Log.i(
                        TAG,
                        "sendMessageAsync done in ${System.currentTimeMillis() - t} ms " +
                            "(audio=$isAudioBackendLoaded, backend=${engine?.engineConfig?.backend})",
                    )
                    if (cont.isActive) cont.resume(response.toString().trim())
                }
                override fun onError(throwable: Throwable) {
                    if (cont.isActive) cont.resumeWithException(throwable)
                }
            },
            EXTRA_CONTEXT_NO_THINKING,
        )
        cont.invokeOnCancellation { runCatching { activeConversation.cancelProcess() } }
    }

    @OptIn(ExperimentalApi::class)
    private fun ensureEngineReady(modelPath: String, needsAudio: Boolean) {
        val canReuse = engine != null &&
            engine!!.isInitialized() &&
            loadedModelPath == modelPath &&
            conversation != null &&
            (!needsAudio || isAudioBackendLoaded)
        if (canReuse) {
            Log.d(TAG, "Engine warm — skipping init (audio=$isAudioBackendLoaded)")
            return
        }
        closeRuntime()
        val t = System.currentTimeMillis()
        val created = runCatching {
            buildEngine(modelPath, Backend.GPU(), needsAudio)
        }.recoverCatching { err ->
            Log.w(TAG, "GPU init failed, falling back to CPU", err)
            buildEngine(modelPath, Backend.CPU(), needsAudio)
        }.getOrThrow()
        engine = created
        loadedModelPath = modelPath
        isAudioBackendLoaded = needsAudio
        conversation = buildConversation(created)
        Log.i(
            TAG,
            "Engine+conversation ready in ${System.currentTimeMillis() - t} ms " +
                "(backend=${created.engineConfig.backend}, audio=$needsAudio)",
        )
    }

    @OptIn(ExperimentalApi::class)
    private fun buildEngine(modelPath: String, backend: Backend, needsAudio: Boolean): Engine {
        val supportsMtp = checkSpeculativeDecodingSupport(modelPath)
        Log.i(TAG, "Building engine backend=$backend audio=$needsAudio MTP=$supportsMtp")
        val config = EngineConfig(
            modelPath = modelPath,
            backend = backend,
            audioBackend = if (needsAudio) Backend.CPU() else null,
            maxNumTokens = MAX_NUM_TOKENS,
            // Gallery only sets cacheDir for /data/local/tmp test models; null for production.
            // Always setting cacheDir can cause GPU shader-cache issues and slower startup.
            cacheDir = if (modelPath.startsWith("/data/local/tmp"))
                context.getExternalFilesDir(null)?.absolutePath
            else
                null,
        )
        ExperimentalFlags.enableSpeculativeDecoding = supportsMtp
        return Engine(config).also {
            it.initialize()
            ExperimentalFlags.enableSpeculativeDecoding = false
        }
    }

    private fun buildConversation(activeEngine: Engine): Conversation {
        val prompt = cachedSystemPrompt ?: loadSystemPrompt().also { cachedSystemPrompt = it }
        return activeEngine.createConversation(
            ConversationConfig(
                systemInstruction = Contents.of(prompt),
                samplerConfig = SamplerConfig(
                    topK = TOP_K,
                    topP = TOP_P,
                    temperature = TEMPERATURE,
                ),
                maxOutputToken = MAX_OUTPUT_TOKENS,
            ),
        )
    }

    private fun checkSpeculativeDecodingSupport(modelPath: String): Boolean =
        runCatching {
            Capabilities(modelPath).use { it.hasSpeculativeDecodingSupport() }
        }.getOrDefault(false)

    private fun closeRuntime() {
        runCatching { conversation?.close() }
        runCatching { engine?.close() }
        conversation = null
        engine = null
        loadedModelPath = null
        isAudioBackendLoaded = false
    }

    private fun loadSystemPrompt(): String =
        context.assets.open("logger_system_prompt.txt").bufferedReader().use { it.readText() }

    private fun validateResponse(json: JSONObject): String {
        val action = json.optString("action")
        require(action.isNotBlank()) { "Response missing action field." }
        when (action) {
            "log_transaction" -> require(json.has("amount")) { "log_transaction missing amount." }
            "ask_clarification" -> require(json.has("clarification_request")) {
                "ask_clarification missing clarification_request."
            }
            "unsupported_request" -> require(json.has("reason")) {
                "unsupported_request missing reason."
            }
            else -> error("Unexpected action: $action")
        }
        return action
    }

    private fun requireSpikeAudio(): ByteArray =
        runCatching {
            context.assets.open("spike_sample.wav").use { it.readBytes() }
        }.getOrElse {
            error("Add app/src/main/assets/spike_sample.wav to run the audio spike.")
        }

    companion object {
        private const val TAG = "LoggerInference"
        /**
         * KV-cache token budget. Gallery's DEFAULT_MAX_TOKEN = 1024.
         * We use 2048 to accommodate our system prompt + a few conversation turns.
         * Keep this ≤ what the device GPU can fit; exceeding VRAM causes a silent CPU
         * fallback which is 15-20× slower (= the 2-minute latency bug).
         */
        private const val MAX_NUM_TOKENS: Int = 2048
        /** Our JSON responses are compact; 256 is plenty and keeps inference fast. */
        private const val MAX_OUTPUT_TOKENS: Int = 256
        private const val TOP_K: Int = 64
        private const val TOP_P: Double = 0.95
        private const val TEMPERATURE: Double = 0.2
        /** Mirrors Gallery: disable thinking via extraContext, not a per-send ThinkingConfig. */
        private val EXTRA_CONTEXT_NO_THINKING: Map<String, String> =
            mapOf("enable_thinking" to "false")
    }
}
