package com.intelligentmoneytracker.mobile

import android.Manifest
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.EaseInOut
import androidx.compose.animation.core.InfiniteRepeatableSpec
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.StartOffset
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.keyframes
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.OpenInNew
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.EditNote
import androidx.compose.material.icons.filled.KeyboardArrowUp
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.work.WorkInfo
import com.intelligentmoneytracker.mobile.audio.AudioRecorder
import com.intelligentmoneytracker.mobile.data.TransactionEntity
import com.intelligentmoneytracker.mobile.inference.LoggerInferenceEngine
import com.intelligentmoneytracker.mobile.inference.SpikeResult
import com.intelligentmoneytracker.mobile.model.HuggingFaceModelConfig
import com.intelligentmoneytracker.mobile.model.ModelManager
import com.intelligentmoneytracker.mobile.model.ModelManifest
import com.intelligentmoneytracker.mobile.model.ModelUiState
import kotlinx.coroutines.Job
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import java.util.Locale

// ──────────────────────────────────────────────────────────
// Design tokens
// ──────────────────────────────────────────────────────────
private val ColorGreen = Color(0xFF1B7A4E)
private val ColorStar = Color(0xFFF9A825)
private val ColorLink = Color(0xFF1A73E8)
private val ColorBorder = Color(0xFFE0E0E0)
private val ColorMeta = Color(0xFF5F6368)
private val ColorScrim = Color(0xCC000000)        // ~80 % black
private val ColorInputBg = Color(0xFF1C1C1E)

private val GlassGreen = Color(0xFF00C853)
private val GlassOrange = Color(0xFFFF6D00)
private val GlassRed = Color(0xFFFF1744)

// ──────────────────────────────────────────────────────────
// State models
// ──────────────────────────────────────────────────────────
data class LoggerUiState(
    val isVisible: Boolean = false,
    val inputText: String = "",
    val isRecording: Boolean = false,
    val recordingAmplitude: Float = 0f,
    val isProcessing: Boolean = false,
    val lastResult: SpikeResult? = null,
    val clarificationContext: String? = null,
)

data class MainScreenState(
    val modelState: ModelUiState = ModelUiState(),
    val recentCount: Int = 0,
    val recentTransactions: List<TransactionEntity> = emptyList(),
    val loggerState: LoggerUiState = LoggerUiState(),
    val isBusy: Boolean = false,
    val errorMessage: String? = null,
)

// ──────────────────────────────────────────────────────────
// Activity
// ──────────────────────────────────────────────────────────
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val container = (application as MoneyTrackerApp).appContainer
        setContent {
            MaterialTheme {
                val viewModel: MainViewModel = androidx.lifecycle.viewmodel.compose.viewModel(
                    factory = MainViewModel.Factory(
                        container.modelManager,
                        container.loggerInferenceEngine,
                        container.transactionDao,
                    ),
                )
                MoneyTrackerScreen(viewModel = viewModel)
            }
        }
    }
}

// ──────────────────────────────────────────────────────────
// ViewModel
// ──────────────────────────────────────────────────────────
class MainViewModel(
    private val modelManager: ModelManager,
    private val loggerInferenceEngine: LoggerInferenceEngine,
    transactionDao: com.intelligentmoneytracker.mobile.data.TransactionDao,
) : ViewModel() {

    private val mutableUiState = MutableStateFlow(MainScreenState())
    private val audioRecorder = AudioRecorder()
    private var recordingJob: Job? = null

    val uiState: StateFlow<MainScreenState> = combine(
        mutableUiState,
        transactionDao.observeCount(),
        transactionDao.observeRecent(),
    ) { base, count, recent ->
        base.copy(recentCount = count, recentTransactions = recent)
    }.stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5_000),
        initialValue = MainScreenState(),
    )

    init {
        refreshModelState()
        observeDownloadFlow()
    }

    fun refreshModelState() {
        viewModelScope.launch {
            mutableUiState.value = mutableUiState.value.copy(isBusy = true, errorMessage = null)
            val refreshed = modelManager.loadUiState()
            mutableUiState.value = mutableUiState.value.copy(modelState = refreshed, isBusy = false)
            val modelPath: String? = refreshed.modelPath
            if (modelPath != null) {
                runCatching { loggerInferenceEngine.warmUp(modelPath) }
                    .onFailure { error ->
                        Log.w(TAG, "Model warm-up failed; will retry on first inference", error)
                    }
            }
        }
    }

    private fun observeDownloadFlow() {
        viewModelScope.launch {
            modelManager.observeWorkInfo().collect { workInfo ->
                if (workInfo == null) return@collect
                val progress = workInfo.progress
                    .getInt(ModelManager.KEY_PROGRESS, -1)
                    .takeIf { it >= 0 }
                val isRunning = workInfo.state == WorkInfo.State.RUNNING ||
                    workInfo.state == WorkInfo.State.ENQUEUED
                val isDone = workInfo.state == WorkInfo.State.SUCCEEDED
                val message = when (workInfo.state) {
                    WorkInfo.State.ENQUEUED -> "Download queued…"
                    WorkInfo.State.RUNNING -> if (progress != null) "Downloading… $progress%" else "Downloading…"
                    WorkInfo.State.SUCCEEDED -> "Model is stored locally."
                    WorkInfo.State.FAILED -> workInfo.outputData.getString("error") ?: "Download failed."
                    else -> mutableUiState.value.modelState.statusMessage
                }
                mutableUiState.value = mutableUiState.value.copy(
                    modelState = mutableUiState.value.modelState.copy(
                        isDownloadRunning = isRunning,
                        downloadProgress = progress,
                        statusMessage = message,
                        downloadCompleted = isDone,
                    ),
                )
                if (isDone) refreshModelState()
            }
        }
    }

    fun startDownload() {
        viewModelScope.launch {
            mutableUiState.value = mutableUiState.value.copy(isBusy = true, errorMessage = null)
            val manifest: ModelManifest = mutableUiState.value.modelState.manifest
                ?: modelManager.refreshManifest().getOrElse { error ->
                    mutableUiState.value = mutableUiState.value.copy(
                        isBusy = false,
                        errorMessage = error.message ?: "Could not fetch model info.",
                    )
                    return@launch
                }
            mutableUiState.value = mutableUiState.value.copy(
                isBusy = false,
                modelState = mutableUiState.value.modelState.copy(manifest = manifest),
            )
            modelManager.enqueueDownload(manifest).fold(
                onSuccess = {
                    mutableUiState.value = mutableUiState.value.copy(
                        modelState = mutableUiState.value.modelState.copy(
                            isDownloadRunning = true,
                            statusMessage = "Download queued…",
                        ),
                    )
                },
                onFailure = { error ->
                    mutableUiState.value = mutableUiState.value.copy(errorMessage = error.message)
                },
            )
        }
    }

    // ── Logger ──────────────────────────────────────────────

    fun openLogger() {
        mutableUiState.value = mutableUiState.value.copy(
            loggerState = mutableUiState.value.loggerState.copy(isVisible = true),
        )
    }

    fun closeLogger() {
        recordingJob?.cancel()
        recordingJob = null
        audioRecorder.requestStop()
        mutableUiState.value = mutableUiState.value.copy(
            loggerState = LoggerUiState(isVisible = false),
        )
        // Do NOT reset the conversation here — resetting calls createConversation which
        // re-prefills the large system prompt and holds the mutex. The warm conversation
        // is reused on the next open; history accumulation is negligible for short JSON turns.
    }

    fun updateInputText(text: String) {
        mutableUiState.value = mutableUiState.value.copy(
            loggerState = mutableUiState.value.loggerState.copy(inputText = text),
        )
    }

    fun clearLastResult() {
        mutableUiState.value = mutableUiState.value.copy(
            loggerState = mutableUiState.value.loggerState.copy(
                lastResult = null,
                clarificationContext = null,
            ),
        )
    }

    fun submitTextInput() {
        val rawText = mutableUiState.value.loggerState.inputText.trim()
        if (rawText.isBlank()) return
        val modelPath = modelManager.resolvedModelPath() ?: return
        val context = mutableUiState.value.loggerState.clarificationContext
        val fullMessage = buildMessage(context, rawText)
        dispatchInference(
            modelPath = modelPath,
            onRun = { loggerInferenceEngine.runUserText(modelPath, fullMessage) },
            capturedContext = fullMessage,
        )
        mutableUiState.value = mutableUiState.value.copy(
            loggerState = mutableUiState.value.loggerState.copy(inputText = ""),
        )
    }

    fun startRecording() {
        val modelPath = modelManager.resolvedModelPath() ?: return
        recordingJob = viewModelScope.launch {
            mutableUiState.value = mutableUiState.value.copy(
                loggerState = mutableUiState.value.loggerState.copy(isRecording = true, recordingAmplitude = 0f),
            )
            runCatching {
                audioRecorder.record { amplitude ->
                    mutableUiState.value = mutableUiState.value.copy(
                        loggerState = mutableUiState.value.loggerState.copy(recordingAmplitude = amplitude),
                    )
                }
            }.fold(
                onSuccess = { wavBytes ->
                    mutableUiState.value = mutableUiState.value.copy(
                        loggerState = mutableUiState.value.loggerState.copy(isRecording = false),
                    )
                    dispatchInference(
                        modelPath = modelPath,
                        onRun = { loggerInferenceEngine.runUserAudio(modelPath, wavBytes) },
                        capturedContext = null,
                    )
                },
                onFailure = { error ->
                    mutableUiState.value = mutableUiState.value.copy(
                        loggerState = mutableUiState.value.loggerState.copy(isRecording = false),
                        errorMessage = error.message,
                    )
                },
            )
        }
    }

    fun stopRecording() {
        audioRecorder.requestStop()
    }

    private fun dispatchInference(
        modelPath: String,
        onRun: suspend () -> SpikeResult,
        capturedContext: String?,
    ) {
        viewModelScope.launch {
            mutableUiState.value = mutableUiState.value.copy(
                loggerState = mutableUiState.value.loggerState.copy(isProcessing = true),
            )
            runCatching { onRun() }.fold(
                onSuccess = { result ->
                    val newContext = if (result.parsedAction == "ask_clarification") capturedContext else null
                    mutableUiState.value = mutableUiState.value.copy(
                        loggerState = mutableUiState.value.loggerState.copy(
                            isProcessing = false,
                            lastResult = result,
                            clarificationContext = newContext,
                        ),
                    )
                },
                onFailure = { error ->
                    mutableUiState.value = mutableUiState.value.copy(
                        loggerState = mutableUiState.value.loggerState.copy(isProcessing = false),
                        errorMessage = error.message,
                    )
                },
            )
        }
    }

    private fun buildMessage(clarificationContext: String?, userText: String): String =
        if (clarificationContext != null) "$clarificationContext $userText" else userText

    override fun onCleared() {
        super.onCleared()
        runBlocking(Dispatchers.Default) {
            loggerInferenceEngine.release()
        }
    }

    class Factory(
        private val modelManager: ModelManager,
        private val loggerInferenceEngine: LoggerInferenceEngine,
        private val transactionDao: com.intelligentmoneytracker.mobile.data.TransactionDao,
    ) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T =
            MainViewModel(modelManager, loggerInferenceEngine, transactionDao) as T
    }

    companion object {
        private const val TAG: String = "MainViewModel"
    }
}

// ──────────────────────────────────────────────────────────
// Root screen
// ──────────────────────────────────────────────────────────
@Composable
private fun MoneyTrackerScreen(viewModel: MainViewModel) {
    val context = LocalContext.current
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { granted ->
        if (granted) viewModel.startRecording()
    }
    Box(modifier = Modifier.fillMaxSize()) {
        Scaffold { innerPadding ->
            Surface(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(innerPadding),
                color = Color(0xFFF7FBF8),
            ) {
                HomeContent(
                    state = state,
                    onDownload = viewModel::startDownload,
                    onOpenRepo = {
                        context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(BuildConfig.MODEL_SOURCE_REPO)))
                    },
                    onLogTransaction = viewModel::openLogger,
                )
            }
        }
        // Logger overlay on top of everything
        AnimatedVisibility(
            visible = state.loggerState.isVisible,
            enter = fadeIn(),
            exit = fadeOut(),
        ) {
            LoggerOverlay(
                loggerState = state.loggerState,
                onDismiss = viewModel::closeLogger,
                onInputChange = viewModel::updateInputText,
                onSubmitText = viewModel::submitTextInput,
                onMicClick = {
                    permissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
                },
                onStopRecording = viewModel::stopRecording,
                onClearResult = viewModel::clearLastResult,
            )
        }
    }
}

// ──────────────────────────────────────────────────────────
// Home content
// ──────────────────────────────────────────────────────────
@Composable
private fun HomeContent(
    state: MainScreenState,
    onDownload: () -> Unit,
    onOpenRepo: () -> Unit,
    onLogTransaction: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Text(
            text = stringResource(R.string.app_name),
            style = MaterialTheme.typography.headlineMedium,
            fontWeight = FontWeight.Bold,
        )
        Text(
            text = stringResource(R.string.home_subtitle),
            style = MaterialTheme.typography.bodyLarge,
            color = ColorMeta,
        )
        state.errorMessage?.let { InfoCard(title = "Issue", body = it) }

        if (!state.modelState.isDownloaded) {
            ModelDownloadCard(
                modelState = state.modelState,
                onDownload = onDownload,
                onLearnMore = onOpenRepo,
            )
        } else {
            ModelReadyCard(modelState = state.modelState)
            LogTransactionButton(onClick = onLogTransaction)
            TransactionsCard(
                count = state.recentCount,
                transactions = state.recentTransactions,
            )
        }
    }
}

@Composable
private fun LogTransactionButton(onClick: () -> Unit) {
    Button(
        onClick = onClick,
        modifier = Modifier
            .fillMaxWidth()
            .height(56.dp),
        shape = RoundedCornerShape(28.dp),
        colors = ButtonDefaults.buttonColors(
            containerColor = ColorGreen,
            contentColor = Color.White,
        ),
    ) {
        Icon(Icons.Filled.EditNote, contentDescription = null, modifier = Modifier.size(22.dp))
        Spacer(modifier = Modifier.width(10.dp))
        Text(text = "Log Transaction", fontWeight = FontWeight.SemiBold, fontSize = 16.sp)
    }
}

// ──────────────────────────────────────────────────────────
// Logger overlay
// ──────────────────────────────────────────────────────────
@Composable
private fun LoggerOverlay(
    loggerState: LoggerUiState,
    onDismiss: () -> Unit,
    onInputChange: (String) -> Unit,
    onSubmitText: () -> Unit,
    onMicClick: () -> Unit,
    onStopRecording: () -> Unit,
    onClearResult: () -> Unit,
) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(ColorScrim)
            .clickable(
                indication = null,
                interactionSource = remember { MutableInteractionSource() },
                onClick = onDismiss,
            ),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp)
                .clickable(
                    indication = null,
                    interactionSource = remember { MutableInteractionSource() },
                    onClick = {},
                ),
            verticalArrangement = Arrangement.spacedBy(16.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            AnimatedVisibility(
                visible = loggerState.lastResult != null,
                enter = fadeIn() + slideInVertically { it / 2 },
                exit = fadeOut() + slideOutVertically { it / 2 },
            ) {
                loggerState.lastResult?.let { result ->
                    ResponseCard(
                        result = result,
                        onDismiss = onClearResult,
                    )
                }
            }
            InputBar(
                text = loggerState.inputText,
                isRecording = loggerState.isRecording,
                isProcessing = loggerState.isProcessing,
                amplitude = loggerState.recordingAmplitude,
                clarificationHint = if (loggerState.clarificationContext != null) "Answering clarification…" else null,
                onTextChange = onInputChange,
                onSubmit = onSubmitText,
                onMicClick = onMicClick,
                onStop = onStopRecording,
            )
            // Dismiss hint
            Text(
                text = "Tap outside to close",
                style = MaterialTheme.typography.bodySmall,
                color = Color.White.copy(alpha = 0.4f),
            )
        }
    }
}

// ──────────────────────────────────────────────────────────
// Input bar
// ──────────────────────────────────────────────────────────
@Composable
private fun InputBar(
    text: String,
    isRecording: Boolean,
    isProcessing: Boolean,
    amplitude: Float,
    clarificationHint: String?,
    onTextChange: (String) -> Unit,
    onSubmit: () -> Unit,
    onMicClick: () -> Unit,
    onStop: () -> Unit,
) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(60.dp)
            .clip(RoundedCornerShape(30.dp))
            .background(ColorInputBg)
            .padding(horizontal = 16.dp),
        contentAlignment = Alignment.Center,
    ) {
        when {
            isProcessing -> ProcessingRow()
            isRecording -> RecordingRow(amplitude = amplitude, onStop = onStop)
            else -> TextInputRow(
                text = text,
                hint = clarificationHint,
                onTextChange = onTextChange,
                onSubmit = onSubmit,
                onMicClick = onMicClick,
            )
        }
    }
}

@Composable
private fun ProcessingRow() {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        modifier = Modifier.fillMaxWidth(),
    ) {
        CircularProgressIndicator(
            modifier = Modifier.size(20.dp),
            color = ColorGreen,
            strokeWidth = 2.dp,
        )
        Text(
            text = "Processing…",
            color = Color.White.copy(alpha = 0.7f),
            style = MaterialTheme.typography.bodyMedium,
        )
    }
}

@Composable
private fun RecordingRow(amplitude: Float, onStop: () -> Unit) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier.fillMaxWidth(),
    ) {
        WaveformBars(
            amplitude = amplitude,
            modifier = Modifier.weight(1f),
        )
        Spacer(modifier = Modifier.width(8.dp))
        IconButton(onClick = onStop, modifier = Modifier.size(40.dp)) {
            Icon(
                Icons.Filled.Stop,
                contentDescription = "Stop recording",
                tint = GlassRed,
                modifier = Modifier.size(22.dp),
            )
        }
    }
}

@Composable
private fun TextInputRow(
    text: String,
    hint: String?,
    onTextChange: (String) -> Unit,
    onSubmit: () -> Unit,
    onMicClick: () -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            Icons.Filled.Add,
            contentDescription = null,
            tint = Color.White.copy(alpha = 0.5f),
            modifier = Modifier.size(20.dp),
        )
        Spacer(modifier = Modifier.width(8.dp))
        BasicTextField(
            value = text,
            onValueChange = onTextChange,
            modifier = Modifier.weight(1f),
            textStyle = TextStyle(color = Color.White, fontSize = 15.sp),
            cursorBrush = SolidColor(ColorGreen),
            singleLine = true,
            decorationBox = { inner ->
                if (text.isEmpty()) {
                    Text(
                        text = hint ?: "Ask anything…",
                        color = Color.White.copy(alpha = 0.4f),
                        fontSize = 15.sp,
                    )
                }
                inner()
            },
        )
        Spacer(modifier = Modifier.width(8.dp))
        AnimatedVisibility(visible = text.isNotBlank()) {
            IconButton(onClick = onSubmit, modifier = Modifier.size(36.dp)) {
                Icon(Icons.AutoMirrored.Filled.Send, contentDescription = "Send", tint = ColorGreen, modifier = Modifier.size(20.dp))
            }
        }
        IconButton(onClick = onMicClick, modifier = Modifier.size(40.dp)) {
            Icon(Icons.Filled.Mic, contentDescription = "Record", tint = Color.White, modifier = Modifier.size(22.dp))
        }
    }
}

// ──────────────────────────────────────────────────────────
// Waveform animation
// ──────────────────────────────────────────────────────────
@Composable
private fun WaveformBars(amplitude: Float, modifier: Modifier = Modifier) {
    val transition = rememberInfiniteTransition(label = "waveform")
    Row(
        modifier = modifier,
        horizontalArrangement = Arrangement.spacedBy(3.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        repeat(14) { index ->
            val phaseOffsetMs = (index * 60).coerceIn(0, 900)
            val barHeight by transition.animateFloat(
                initialValue = 4f,
                targetValue = (12f + amplitude * 24f).coerceAtLeast(4f),
                animationSpec = InfiniteRepeatableSpec(
                    animation = keyframes {
                        durationMillis = 700
                        4f at 0 using EaseInOut
                        (12f + amplitude * 20f) at 350 using EaseInOut
                        4f at 700 using EaseInOut
                    },
                    repeatMode = RepeatMode.Restart,
                    initialStartOffset = StartOffset(phaseOffsetMs),
                ),
                label = "bar$index",
            )
            Box(
                modifier = Modifier
                    .width(3.dp)
                    .height(barHeight.dp)
                    .clip(RoundedCornerShape(2.dp))
                    .background(Color.White.copy(alpha = 0.85f)),
            )
        }
    }
}

// ──────────────────────────────────────────────────────────
// Glassmorphic response cards
// ──────────────────────────────────────────────────────────
@Composable
private fun ResponseCard(result: SpikeResult, onDismiss: () -> Unit) {
    val json = remember(result.rawResponse) {
        runCatching { JSONObject(result.rawResponse) }.getOrNull()
    }
    when (result.parsedAction) {
        "log_transaction" -> GlassCard(
            accentColor = GlassGreen,
            badgeLabel = "log_transaction",
            onDismiss = onDismiss,
        ) { LogTransactionContent(json) }

        "ask_clarification" -> GlassCard(
            accentColor = GlassOrange,
            badgeLabel = "ask_clarification",
            onDismiss = onDismiss,
        ) {
            Text(
                text = json?.optString("clarification_request") ?: "Could you clarify?",
                color = Color.White,
                style = MaterialTheme.typography.bodyLarge,
                lineHeight = 24.sp,
            )
        }

        "unsupported_request" -> GlassCard(
            accentColor = GlassRed,
            badgeLabel = "unsupported_request",
            onDismiss = onDismiss,
        ) {
            Text(
                text = json?.optString("reason") ?: "This isn't supported right now.",
                color = Color.White,
                style = MaterialTheme.typography.bodyLarge,
                lineHeight = 24.sp,
            )
        }
    }
}

@Composable
private fun GlassCard(
    accentColor: Color,
    badgeLabel: String,
    onDismiss: () -> Unit,
    content: @Composable () -> Unit,
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(24.dp),
        colors = CardDefaults.cardColors(
            containerColor = accentColor.copy(alpha = 0.14f),
        ),
        border = BorderStroke(1.dp, accentColor.copy(alpha = 0.35f)),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                ActionBadge(label = badgeLabel, color = accentColor)
                IconButton(onClick = onDismiss, modifier = Modifier.size(28.dp)) {
                    Icon(
                        Icons.Filled.Close,
                        contentDescription = "Dismiss",
                        tint = Color.White.copy(alpha = 0.6f),
                        modifier = Modifier.size(16.dp),
                    )
                }
            }
            content()
        }
    }
}

@Composable
private fun ActionBadge(label: String, color: Color) {
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(20.dp))
            .background(color.copy(alpha = 0.25f))
            .padding(horizontal = 12.dp, vertical = 4.dp),
    ) {
        Text(
            text = label,
            color = color,
            style = MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.Bold,
            letterSpacing = 0.5.sp,
        )
    }
}

@Composable
private fun LogTransactionContent(json: JSONObject?) {
    if (json == null) return
    val amount = json.optDouble("amount", 0.0)
    val currency = json.optString("currency", "INR")
    val symbol = if (currency == "INR") "₹" else currency
    Text(
        text = "$symbol${formatAmount(amount)}",
        color = Color.White,
        style = MaterialTheme.typography.displaySmall,
        fontWeight = FontWeight.Bold,
    )
    Row(
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        modifier = Modifier.fillMaxWidth(),
    ) {
        listOfNotNull(
            json.optString("merchant").takeIf(String::isNotBlank),
            json.optString("category").takeIf(String::isNotBlank),
            json.optString("transaction_type").takeIf(String::isNotBlank),
            json.optString("payment_method").takeIf(String::isNotBlank),
        ).forEach { chip ->
            TransactionChip(label = chip)
        }
    }
    val status = json.optString("status", "completed")
    Text(
        text = "Logged · $status",
        color = GlassGreen,
        style = MaterialTheme.typography.bodySmall,
        fontWeight = FontWeight.Medium,
    )
}

@Composable
private fun TransactionChip(label: String) {
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(12.dp))
            .background(Color.White.copy(alpha = 0.10f))
            .padding(horizontal = 8.dp, vertical = 3.dp),
    ) {
        Text(
            text = label,
            color = Color.White.copy(alpha = 0.85f),
            style = MaterialTheme.typography.bodySmall,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

private fun formatAmount(amount: Double): String =
    if (amount == amount.toLong().toDouble()) {
        amount.toLong().toString()
    } else {
        String.format(Locale.US, "%.2f", amount)
    }

// ──────────────────────────────────────────────────────────
// Model download card
// ──────────────────────────────────────────────────────────
@Composable
private fun ModelDownloadCard(
    modelState: ModelUiState,
    onDownload: () -> Unit,
    onLearnMore: () -> Unit,
) {
    val sizeLabel = formatSizeGb(
        modelState.manifest?.sizeBytes ?: HuggingFaceModelConfig.FALLBACK_SIZE_BYTES,
    )
    val progressFraction = modelState.downloadProgress?.div(100f)
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(20.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        border = BorderStroke(1.dp, ColorBorder),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            ModelCardHeader()
            Text(
                text = stringResource(R.string.model_display_name),
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold,
                fontSize = 26.sp,
            )
            SizeRow(label = sizeLabel)
            LearnMoreRow(onClick = onLearnMore)
            if (modelState.isDownloadRunning || modelState.downloadProgress != null) {
                DownloadProgressSection(
                    message = modelState.statusMessage,
                    progress = progressFraction,
                    progressPercent = modelState.downloadProgress,
                    totalBytes = modelState.manifest?.sizeBytes ?: HuggingFaceModelConfig.FALLBACK_SIZE_BYTES,
                )
            }
            Spacer(modifier = Modifier.height(4.dp))
            DownloadButton(
                isRunning = modelState.isDownloadRunning,
                hasPartialProgress = (modelState.downloadProgress ?: 0) > 0,
                onClick = onDownload,
            )
        }
    }
}

@Composable
private fun ModelCardHeader() {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Row(
            horizontalArrangement = Arrangement.spacedBy(6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(Icons.Filled.Star, contentDescription = null, tint = ColorStar, modifier = Modifier.size(18.dp))
            Text(
                text = stringResource(R.string.model_card_badge),
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.Medium,
            )
        }
        Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            Icon(Icons.Filled.MoreVert, contentDescription = null, tint = ColorMeta, modifier = Modifier.size(20.dp))
            Icon(Icons.Filled.KeyboardArrowUp, contentDescription = null, tint = ColorMeta, modifier = Modifier.size(20.dp))
        }
    }
}

@Composable
private fun SizeRow(label: String) {
    Row(
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(Icons.Filled.Download, contentDescription = null, tint = ColorGreen, modifier = Modifier.size(18.dp))
        Text(text = label, style = MaterialTheme.typography.bodyMedium, color = ColorMeta)
    }
}

@Composable
private fun LearnMoreRow(onClick: () -> Unit) {
    Row(
        modifier = Modifier.clickable(onClick = onClick),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(Icons.AutoMirrored.Filled.OpenInNew, contentDescription = null, tint = ColorLink, modifier = Modifier.size(16.dp))
        Text(
            text = stringResource(R.string.model_learn_more),
            style = MaterialTheme.typography.bodyMedium,
            color = ColorLink,
            textDecoration = TextDecoration.Underline,
        )
    }
}

@Composable
private fun DownloadProgressSection(
    message: String,
    progress: Float?,
    progressPercent: Int?,
    totalBytes: Long,
) {
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(text = message, style = MaterialTheme.typography.bodySmall, color = ColorMeta)
        if (progress != null) {
            LinearProgressIndicator(
                progress = { progress },
                modifier = Modifier.fillMaxWidth(),
                color = ColorGreen,
                trackColor = ColorGreen.copy(alpha = 0.15f),
            )
            Text(
                text = "${progressPercent}%  ·  ${formatDownloaded(progressPercent, totalBytes)}",
                style = MaterialTheme.typography.bodySmall,
                color = ColorMeta,
            )
        } else {
            LinearProgressIndicator(
                modifier = Modifier.fillMaxWidth(),
                color = ColorGreen,
                trackColor = ColorGreen.copy(alpha = 0.15f),
            )
        }
    }
}

@Composable
private fun DownloadButton(isRunning: Boolean, hasPartialProgress: Boolean, onClick: () -> Unit) {
    Button(
        onClick = onClick,
        enabled = !isRunning,
        modifier = Modifier
            .fillMaxWidth()
            .height(52.dp),
        shape = RoundedCornerShape(26.dp),
        colors = ButtonDefaults.buttonColors(
            containerColor = ColorGreen,
            contentColor = Color.White,
            disabledContainerColor = ColorGreen.copy(alpha = 0.55f),
            disabledContentColor = Color.White,
        ),
    ) {
        if (isRunning) {
            CircularProgressIndicator(modifier = Modifier.size(18.dp), color = Color.White, strokeWidth = 2.dp)
            Spacer(modifier = Modifier.width(10.dp))
        }
        val label = when {
            isRunning -> stringResource(R.string.model_downloading_action)
            hasPartialProgress -> stringResource(R.string.model_resume_action)
            else -> stringResource(R.string.model_download_action)
        }
        Text(text = label, fontWeight = FontWeight.SemiBold, fontSize = 16.sp)
    }
}

// ──────────────────────────────────────────────────────────
// Model ready card
// ──────────────────────────────────────────────────────────
@Composable
private fun ModelReadyCard(modelState: ModelUiState) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(20.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        border = BorderStroke(1.dp, ColorBorder),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(18.dp),
            horizontalArrangement = Arrangement.spacedBy(14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(Icons.Filled.CheckCircle, contentDescription = null, tint = ColorGreen, modifier = Modifier.size(32.dp))
            Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(
                    text = stringResource(R.string.model_display_name),
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                )
                Text(
                    text = modelState.statusMessage,
                    style = MaterialTheme.typography.bodySmall,
                    color = ColorMeta,
                )
            }
        }
    }
}

// ──────────────────────────────────────────────────────────
// Transactions card
// ──────────────────────────────────────────────────────────
@Composable
private fun TransactionsCard(count: Int, transactions: List<TransactionEntity>) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(20.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        border = BorderStroke(1.dp, ColorBorder),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Text(text = "Transactions", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
            Text(text = "$count logged", style = MaterialTheme.typography.bodySmall, color = ColorMeta)
            if (transactions.isEmpty()) {
                Text(
                    text = "No transactions yet. Tap Log Transaction to start.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = ColorMeta,
                )
            } else {
                transactions.forEach { tx -> TransactionRow(tx) }
            }
        }
    }
}

@Composable
private fun TransactionRow(tx: TransactionEntity) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 6.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(
                text = "${tx.merchant ?: tx.transactionType}",
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.Medium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                text = "${tx.category ?: tx.transactionType} · ${tx.captureSource}",
                style = MaterialTheme.typography.bodySmall,
                color = ColorMeta,
                maxLines = 1,
            )
        }
        Text(
            text = "₹${formatAmount(tx.amount)}",
            style = MaterialTheme.typography.bodyLarge,
            fontWeight = FontWeight.Bold,
            color = if (tx.transactionType == "income") ColorGreen else Color(0xFF1A1A1A),
        )
    }
}

// ──────────────────────────────────────────────────────────
// Info card
// ──────────────────────────────────────────────────────────
@Composable
private fun InfoCard(title: String, body: String) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = GlassRed.copy(alpha = 0.08f)),
        border = BorderStroke(1.dp, GlassRed.copy(alpha = 0.25f)),
    ) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(text = title, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
            Text(text = body, style = MaterialTheme.typography.bodySmall)
        }
    }
}

// ──────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────
private fun formatSizeGb(sizeBytes: Long): String =
    String.format(Locale.US, "%.2f GB", sizeBytes.toDouble() / 1_000_000_000.0)

private fun formatDownloaded(progressPercent: Int?, totalBytes: Long): String {
    val downloaded = totalBytes * (progressPercent ?: 0) / 100
    return "${formatSizeGb(downloaded)} of ${formatSizeGb(totalBytes)}"
}
