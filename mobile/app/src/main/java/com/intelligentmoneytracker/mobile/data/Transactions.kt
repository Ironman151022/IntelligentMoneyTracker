package com.intelligentmoneytracker.mobile.data

import androidx.room.Dao
import androidx.room.Database
import androidx.room.Entity
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.RoomDatabase
import kotlinx.coroutines.flow.Flow

@Entity(tableName = "transactions")
data class TransactionEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val amount: Double,
    val currency: String,
    val status: String,
    val transactionType: String,
    val paymentMethod: String?,
    val beneficiary: String?,
    val merchant: String?,
    val category: String?,
    val subCategory: String?,
    val itemsJson: String?,
    val rawJson: String,
    val captureSource: String,
    val createdAtEpochMs: Long,
)

@Dao
interface TransactionDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(transaction: TransactionEntity): Long

    @Query("SELECT * FROM transactions ORDER BY createdAtEpochMs DESC LIMIT 20")
    fun observeRecent(): Flow<List<TransactionEntity>>

    @Query("SELECT COUNT(*) FROM transactions")
    fun observeCount(): Flow<Int>
}

@Database(
    entities = [TransactionEntity::class],
    version = 1,
    exportSchema = false,
)
abstract class AppDatabase : RoomDatabase() {
    abstract fun transactionDao(): TransactionDao
}
