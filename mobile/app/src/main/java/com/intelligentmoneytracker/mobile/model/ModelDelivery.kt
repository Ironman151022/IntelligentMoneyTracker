package com.intelligentmoneytracker.mobile.model

import android.content.Context
import androidx.core.content.edit
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkInfo
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import com.intelligentmoneytracker.mobile.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.firstOrNull
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.security.MessageDigest
import java.util.concurrent.TimeUnit

/**
 * Testing delivery: download the public Apache-2.0 `.litertlm` file directly
 * from Hugging Face. No HF token is required and none is shipped in the APK.
 *
 * Source: https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm
 */
object HuggingFaceModelConfig {
    const val REPO_ID = "litert-community/gemma-4-E2B-it-litert-lm"
    const val FILE_NAME = "gemma-4-E2B-it.litertlm"
    const val MODEL_ID = "gemma-4-e2b-it"
    const val VERSION = "hf-main"

    /** Public resolve URL — redirects to HF CDN; no auth for this public repo. */
    val DOWNLOAD_URL: String =
        "https://huggingface.co/$REPO_ID/resolve/main/$FILE_NAME?download=true"

    val TREE_API_URL: String =
        "https://huggingface.co/api/models/$REPO_ID/tree/main"

    // Known LFS oid/size from HF API (verified 2026-08). Refreshed at runtime when possible.
    const val FALLBACK_SHA256 =
        "181938105e0eefd105961417e8da75903eacda102c4fce9ce90f50b97139a63c"
    const val FALLBACK_SIZE_BYTES = 2_588_147_712L
}

data class ModelManifest(
    val modelId: String,
    val version: String,
    val downloadUrl: String,
    val sha256: String,
    val sizeBytes: Long,
    val minAppVersion: Int,
    val licenseUrl: String,
    val sourceRepo: String = BuildConfig.MODEL_SOURCE_REPO,
)

data class ModelUiState(
    val manifest: ModelManifest? = null,
    val localVersion: String? = null,
    val isDownloaded: Boolean = false,
    val isDownloadRunning: Boolean = false,
    val downloadProgress: Int? = null,
    val statusMessage: String = "Ready to download from Hugging Face.",
    val modelPath: String? = null,
    val downloadCompleted: Boolean = false,
)

private object ModelPrefs {
    private const val PREFS = "model_delivery"
    private const val KEY_VERSION = "local_version"
    private const val KEY_SHA = "local_sha256"
    private const val KEY_FILE = "local_file_name"

    fun version(context: Context): String? =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_VERSION, null)

    fun sha(context: Context): String? =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_SHA, null)

    fun fileName(context: Context): String? =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_FILE, null)

    fun save(context: Context, manifest: ModelManifest, fileName: String) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit {
            putString(KEY_VERSION, manifest.version)
            putString(KEY_SHA, manifest.sha256)
            putString(KEY_FILE, fileName)
        }
    }
}

object ModelPaths {
    private const val MODEL_DIR = "models"

    fun modelDirectory(context: Context): File = File(context.filesDir, MODEL_DIR).apply { mkdirs() }

    fun manifestBackedFile(context: Context, version: String): File =
        File(modelDirectory(context), "gemma-4-e2b-it-$version.litertlm")

    fun tempDownloadFile(context: Context): File =
        File(modelDirectory(context), "gemma-4-e2b-it.partial")

    fun resolvedModelFile(context: Context): File? {
        val fileName = ModelPrefs.fileName(context) ?: return null
        val file = File(modelDirectory(context), fileName)
        return file.takeIf(File::exists)
    }
}

private fun defaultHttpClient(): OkHttpClient =
    OkHttpClient.Builder()
        .followRedirects(true)
        .followSslRedirects(true)
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(0, TimeUnit.MILLISECONDS) // large model stream
        .writeTimeout(30, TimeUnit.SECONDS)
        .build()

class ModelManifestService(
    private val httpClient: OkHttpClient = defaultHttpClient(),
) {
    /**
     * Returns the Hugging Face download target. Prefers live HF tree metadata
     * (size + LFS sha256); falls back to baked-in public values if offline.
     */
    suspend fun fetch(): ModelManifest = withContext(Dispatchers.IO) {
        val live = runCatching { fetchFromHuggingFaceApi() }.getOrNull()
        live ?: fallbackManifest()
    }

    private fun fallbackManifest(): ModelManifest =
        ModelManifest(
            modelId = HuggingFaceModelConfig.MODEL_ID,
            version = HuggingFaceModelConfig.VERSION,
            downloadUrl = HuggingFaceModelConfig.DOWNLOAD_URL,
            sha256 = HuggingFaceModelConfig.FALLBACK_SHA256,
            sizeBytes = HuggingFaceModelConfig.FALLBACK_SIZE_BYTES,
            minAppVersion = 1,
            licenseUrl = BuildConfig.MODEL_LICENSE_URL,
            sourceRepo = BuildConfig.MODEL_SOURCE_REPO,
        )

    private fun fetchFromHuggingFaceApi(): ModelManifest {
        val request = Request.Builder()
            .url(HuggingFaceModelConfig.TREE_API_URL)
            .header("User-Agent", "IntelligentMoneyTracker-Android/0.1")
            .get()
            .build()
        httpClient.newCall(request).execute().use { response ->
            require(response.isSuccessful) {
                "Hugging Face tree API failed with HTTP ${response.code}"
            }
            val payload = response.body?.string().orEmpty()
            val files = JSONArray(payload)
            for (i in 0 until files.length()) {
                val entry = files.getJSONObject(i)
                if (entry.optString("path") != HuggingFaceModelConfig.FILE_NAME) continue
                val lfs = entry.optJSONObject("lfs")
                val sha256 = lfs?.optString("oid").orEmpty().ifBlank {
                    HuggingFaceModelConfig.FALLBACK_SHA256
                }
                val sizeBytes = when {
                    lfs != null && lfs.has("size") -> lfs.getLong("size")
                    entry.has("size") -> entry.getLong("size")
                    else -> HuggingFaceModelConfig.FALLBACK_SIZE_BYTES
                }
                return ModelManifest(
                    modelId = HuggingFaceModelConfig.MODEL_ID,
                    version = HuggingFaceModelConfig.VERSION,
                    downloadUrl = HuggingFaceModelConfig.DOWNLOAD_URL,
                    sha256 = sha256,
                    sizeBytes = sizeBytes,
                    minAppVersion = 1,
                    licenseUrl = BuildConfig.MODEL_LICENSE_URL,
                    sourceRepo = BuildConfig.MODEL_SOURCE_REPO,
                )
            }
            error("Model file ${HuggingFaceModelConfig.FILE_NAME} not found in HF repo tree.")
        }
    }
}

object ModelChecksum {
    fun sha256(file: File): String {
        val digest = MessageDigest.getInstance("SHA-256")
        file.inputStream().use { input ->
            val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
            while (true) {
                val read = input.read(buffer)
                if (read == -1) break
                digest.update(buffer, 0, read)
            }
        }
        return digest.digest().joinToString("") { "%02x".format(it) }
    }
}

class ModelManager(
    private val context: Context,
    private val manifestService: ModelManifestService = ModelManifestService(),
) {
    private val workManager = WorkManager.getInstance(context)

    /**
     * Performs the initial load: checks local storage and (once) fetches the HF manifest.
     * Does NOT make a network call on subsequent refreshes — use [observeWorkInfo] for live updates.
     */
    suspend fun loadUiState(): ModelUiState {
        val localFile = ModelPaths.resolvedModelFile(context)
        val isDownloaded = localFile != null
        val hasPartialDownload = ModelPaths.tempDownloadFile(context).exists()
        val message = when {
            isDownloaded -> "Model is stored locally."
            hasPartialDownload -> "Partial download found. Tap Download to resume."
            else -> "Ready to download ${HuggingFaceModelConfig.FILE_NAME} from Hugging Face."
        }
        return ModelUiState(
            localVersion = ModelPrefs.version(context),
            isDownloaded = isDownloaded,
            statusMessage = message,
            modelPath = localFile?.absolutePath,
        )
    }

    suspend fun refreshManifest(): Result<ModelManifest> = runCatching { manifestService.fetch() }

    /** Reactive stream of the download WorkInfo — zero network calls, purely WorkManager state. */
    fun observeWorkInfo(): kotlinx.coroutines.flow.Flow<WorkInfo?> =
        workManager.getWorkInfosByTagFlow(DOWNLOAD_WORK_NAME)
            .map { list -> list.firstOrNull() }

    suspend fun enqueueDownload(manifest: ModelManifest): Result<Unit> = runCatching {
        val input = workDataOf(
            KEY_URL to manifest.downloadUrl,
            KEY_SHA to manifest.sha256,
            KEY_VERSION to manifest.version,
            KEY_SIZE_BYTES to manifest.sizeBytes,
        )
        val request = OneTimeWorkRequestBuilder<ModelDownloadWorker>()
            .setInputData(input)
            .setConstraints(
                androidx.work.Constraints.Builder()
                    .setRequiredNetworkType(NetworkType.CONNECTED)
                    .build(),
            )
            .addTag(DOWNLOAD_WORK_NAME)
            .build()
        workManager.enqueueUniqueWork(DOWNLOAD_WORK_NAME, ExistingWorkPolicy.REPLACE, request)
    }

    fun observeTransactionReadyState(): Flow<Boolean> =
        workManager.getWorkInfosByTagFlow(DOWNLOAD_WORK_NAME)
            .map { work ->
                work.any { it.state == WorkInfo.State.SUCCEEDED } ||
                    ModelPaths.resolvedModelFile(context) != null
            }

    suspend fun currentDownloadInfo(): WorkInfo? = withContext(Dispatchers.IO) {
        workManager.getWorkInfosForUniqueWork(DOWNLOAD_WORK_NAME).get().firstOrNull()
    }

    fun resolvedModelPath(): String? = ModelPaths.resolvedModelFile(context)?.absolutePath

    companion object {
        const val DOWNLOAD_WORK_NAME = "model-download"
        const val KEY_PROGRESS = "progress"
        private const val KEY_URL = "url"
        private const val KEY_SHA = "sha"
        private const val KEY_VERSION = "version"
        private const val KEY_SIZE_BYTES = "size_bytes"
    }
}

class ModelDownloadWorker(
    appContext: Context,
    params: WorkerParameters,
) : CoroutineWorker(appContext, params) {

    override suspend fun doWork(): Result {
        val url = inputData.getString(KEY_URL) ?: return Result.failure()
        val sha = inputData.getString(KEY_SHA) ?: return Result.failure()
        val version = inputData.getString(KEY_VERSION) ?: return Result.failure()
        val sizeBytes = inputData.getLong(KEY_SIZE_BYTES, -1L)
        val targetFile = ModelPaths.manifestBackedFile(applicationContext, version)
        val tempFile = ModelPaths.tempDownloadFile(applicationContext)

        return runCatching {
            ensureStorage(sizeBytes)
            downloadFile(url, tempFile, sizeBytes)
            if (sizeBytes > 0L) {
                require(tempFile.length() == sizeBytes) {
                    "Downloaded size ${tempFile.length()} does not match expected $sizeBytes."
                }
            }
            val computed = ModelChecksum.sha256(tempFile)
            require(computed.equals(sha, ignoreCase = true)) {
                "Checksum mismatch after download (got $computed)."
            }
            if (targetFile.exists()) {
                targetFile.delete()
            }
            check(tempFile.renameTo(targetFile)) {
                "Downloaded file could not be moved into app storage."
            }
            ModelPrefs.save(
                applicationContext,
                buildManifest(url, sha, version, sizeBytes),
                targetFile.name,
            )
            Result.success()
        }.getOrElse { error ->
            // Keep partial file on network errors so resume can continue.
            val keepPartial = error is java.io.IOException
            if (!keepPartial && tempFile.exists()) {
                tempFile.delete()
            }
            Result.failure(workDataOf("error" to (error.message ?: "Unknown download error")))
        }
    }

    private fun buildManifest(url: String, sha: String, version: String, sizeBytes: Long): ModelManifest =
        ModelManifest(
            modelId = HuggingFaceModelConfig.MODEL_ID,
            version = version,
            downloadUrl = url,
            sha256 = sha,
            sizeBytes = sizeBytes,
            minAppVersion = 1,
            licenseUrl = BuildConfig.MODEL_LICENSE_URL,
            sourceRepo = BuildConfig.MODEL_SOURCE_REPO,
        )

    private fun ensureStorage(expectedSizeBytes: Long) {
        if (expectedSizeBytes <= 0) return
        val usable = ModelPaths.modelDirectory(applicationContext).usableSpace
        require(usable > expectedSizeBytes + 512L * 1024L * 1024L) {
            "Not enough free space for a multi-GB model download."
        }
    }

    private suspend fun downloadFile(
        url: String,
        destination: File,
        expectedSizeBytes: Long,
    ) = withContext(Dispatchers.IO) {
        val client = defaultHttpClient()
        val existingBytes = destination.takeIf(File::exists)?.length() ?: 0L
        if (expectedSizeBytes > 0L && existingBytes >= expectedSizeBytes) {
            return@withContext
        }
        val requestBuilder = Request.Builder()
            .url(url)
            .header("User-Agent", "IntelligentMoneyTracker-Android/0.1")
            .get()
        if (existingBytes > 0L) {
            requestBuilder.addHeader("Range", "bytes=$existingBytes-")
        }
        val request = requestBuilder.build()
        client.newCall(request).execute().use { response ->
            require(response.isSuccessful) {
                "Hugging Face download failed with HTTP ${response.code}"
            }
            val body = response.body ?: error("Download body was empty.")
            val shouldAppend = existingBytes > 0L && response.code == 206
            if (existingBytes > 0L && response.code == 200 && destination.exists()) {
                destination.delete()
            }
            val startingBytes = if (shouldAppend) existingBytes else 0L
            val totalBytes = when {
                expectedSizeBytes > 0L -> expectedSizeBytes
                body.contentLength() > 0L -> body.contentLength() + startingBytes
                else -> null
            }
            destination.parentFile?.mkdirs()
            body.byteStream().use { input ->
                FileOutputStream(destination, shouldAppend).use { output ->
                    val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
                    var downloaded = startingBytes
                    while (true) {
                        val read = input.read(buffer)
                        if (read == -1) break
                        output.write(buffer, 0, read)
                        downloaded += read
                        val progress = if (totalBytes != null) {
                            ((downloaded * 100) / totalBytes).toInt().coerceIn(0, 100)
                        } else {
                            0
                        }
                        setProgress(workDataOf(KEY_PROGRESS to progress))
                    }
                    output.flush()
                }
            }
        }
    }

    companion object {
        private const val KEY_URL = "url"
        private const val KEY_SHA = "sha"
        private const val KEY_VERSION = "version"
        private const val KEY_SIZE_BYTES = "size_bytes"
        private const val KEY_PROGRESS = "progress"
    }
}
