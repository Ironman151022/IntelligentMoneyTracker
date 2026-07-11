Categories are subject to user preferences: users can rename or change categories, add their own categories, and provide corrections that the AI learns from when classifying future transactions.

| Entity            | Meaning                                    | Fields / values                                                                     | Example                                   |
| ----------------- | ------------------------------------------ | ----------------------------------------------------------------------------------- | ----------------------------------------- |
| User              | App user and payer                         | `id`, `name`                                                                        | You                                       |
| Transaction       | Current structured view of one money event | `id`, `amount`, `currency`, `timestamp`, `status`, `updated_at`, `last_evidence_id` | ₹100 spent at Zomato today                |
| PaymentMethod     | How a transaction was paid                 | `method`: cash, upi, card, wallet, netbanking; `instrument?`; `account?`            | UPI; PhonePe; SBI savings                 |
| Category          | Spending or income classification          | `id`, `name`                                                                        | Food                                      |
| Merchant          | Payee, shop, brand, or platform            | `id`, `name`                                                                        | Zomato                                    |
| Beneficiary       | Person for whom the transaction occurred   | `id`, `name`                                                                        | Sister                                    |
| LineItem          | One item within a transaction              | `id`, `name`, `cost`, `quantity`                                                    | 2 pizzas — ₹600                           |
| RecurrencePattern | Repeating payment pattern                  | `id`, `type`: emi or subscription; `interval`                                       | Netflix monthly subscription              |
| Location          | Place associated with a transaction        | `id`, `name`, `latitude?`, `longitude?`                                             | Office canteen                            |
| Evidence          | Immutable source input                     | `id`, `index_id`, `raw_text`, `type`, `timestamp`, `source_channel`                 | “Paid ₹100 on Zomato” voice transcript    |
| Vector Store      | Embeddings for semantic recall             | `index_id`, `embedding`                                                             | Embedding for the Zomato voice transcript |



| Edge                                         | Meaning                                                  |
| -------------------------------------------- | -------------------------------------------------------- |
| `User ──PAID──► Transaction`                 | User made the transaction                                |
| `Transaction ──VIA──► PaymentMethod`         | Payment channel and optional instrument/account metadata |
| `Transaction ──CATEGORIZED_AS──► Category`   | Transaction classification                               |
| `Transaction ──AT──► Merchant`               | Merchant or platform paid to                             |
| `Transaction ──FOR──► Beneficiary`           | Person benefiting from the transaction                   |
| `Transaction ──HAS_LINE_ITEM──► LineItem`    | Item contained in the transaction                        |
| `Transaction ──MATCHES──► RecurrencePattern` | Transaction belongs to a recurring pattern               |
| `Transaction ──AT──► Location`               | Place associated with the transaction                    |
| `Evidence ──EXTRACTED_INTO──► Transaction`   | Evidence created a new transaction                       |
| `Evidence ──CORRECTS──► Transaction`         | Evidence updated an existing transaction in place        |
| `Evidence.index_id ──► Vector Store`         | Evidence embedding lookup key                            |


