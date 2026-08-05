package com.intelligentmoneytracker.mobile

import android.app.Application
import androidx.room.Room
import com.intelligentmoneytracker.mobile.data.AppDatabase
import com.intelligentmoneytracker.mobile.inference.LoggerInferenceEngine
import com.intelligentmoneytracker.mobile.model.ModelManager

class MoneyTrackerApp : Application() {
    lateinit var appContainer: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        appContainer = AppContainer(this)
    }
}

class AppContainer(application: Application) {
    private val database = Room.databaseBuilder(
        application,
        AppDatabase::class.java,
        "intelligent-money-tracker.db",
    ).fallbackToDestructiveMigration(dropAllTables = true).build()

    val transactionDao = database.transactionDao()
    val modelManager = ModelManager(application)
    val loggerInferenceEngine = LoggerInferenceEngine(
        context = application,
        transactionDao = transactionDao,
    )
}
