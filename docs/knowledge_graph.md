# Money-tracker knowledge graph

This model represents financial data as connected entities. The database uses normal, typed tables for speed and low storage use; the foreign keys and relationship tables are the graph edges. A graph database and embeddings are not required for this model.

Audio / text is turned into a central **Transaction** node (via online speech-to-text when needed, then the on-device LLM) and linked to the related entities below.

## Nodes

The model has six node types.

1. **Transaction** — one money event. It stores the amount, currency, type (expense / income / transfer / refund), lifecycle status, and timestamps.
2. **PaymentMethod** — how the money moved, for example `upi`, `cash`, or `card`. One payment method can be reused by many transactions.
3. **Category** — a user-visible classification. Categories form a hierarchy: for example, `Food` can be the parent of `Restaurants`, `Food delivery`, and `Lunch`.
4. **Merchant** — the counterparty shop, platform, brand, or payer source, for example Zomato, Domino's, or an employer name. A merchant node is reused across transactions.
5. **Item** — one item within a transaction, including its name, quantity, and line amount. An item belongs to one transaction.
6. **Beneficiary** — the person who benefited from (or, for income, who funded) a transaction, such as `Self`, Ravi, or Ananya. A beneficiary can be linked to many transactions.

`Transaction` is a graph node even though it has its own table. A dedicated typed table makes common financial queries, indexes, and amount validation efficient.

## Tables

The first six tables contain the nodes. The remaining tables contain relationships or lookup aliases; they are not additional node types.


| Table name                  | Columns                                                                                                                                                                                                                                                                                            |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `transactions`              | `id` (PK), `amount`, `currency`, `type` (`'expense'`, `'income'`, `'transfer'`, `'refund'`), `status` (`'pending'`, `'completed'`, `'failed'`, `'refunded'`), `created_at`, `updated_at` (nullable), `payment_method_id` (nullable FK → `payment_methods.id`), `merchant_id` (nullable FK → `merchants.id`) |
| `items`                     | `id` (PK), `name`, `transaction_id` (FK → `transactions.id`), `line_amount` (nullable), `quantity` (int, nullable)                                                                                                                                                                                 |
| `beneficiaries`             | `id` (PK), `name` (unique), `relationship` (nullable)                                                                                                                                                                                                                                              |
| `transaction_beneficiaries` | `transaction_id` (FK → `transactions.id`), `beneficiary_id` (FK → `beneficiaries.id`), `allocated_amount` (nullable)                                                                                                                                                                               |
| `transaction_categories`    | `transaction_id` (FK → `transactions.id`), `category_id` (FK → `categories.id`)                                                                                                                                                                                                                    |
| `categories`                | `id` (PK), `name`, `parent_id` (nullable FK → `categories.id`)                                                                                                                                                                                                                                     |
| `payment_methods`           | `id` (PK), `method`                                                                                                                                                                                                                                                                                |
| `merchants`                 | `id` (PK), `name`                                                                                                                                                                                                                                                                                  |
| `merchant_aliases`          | `id` (PK), `merchant_id` (FK → `merchants.id`), `name`                                                                                                                                                                                                                                             |


`amount` is the transaction total. `line_amount` is one item's cost. `allocated_amount` is the split assigned to one beneficiary.

`type` is the money direction — not lifecycle state. Salary credited or “someone sent me ₹100” are `income`; buying lunch is `expense`; moving money between own accounts is `transfer`.

`status` is only lifecycle: `pending`, `completed`, `failed`, or `refunded`.

`categories` intentionally has only `name` and `parent_id` beyond its ID. A category's position in the hierarchy supplies its meaning.

## Relationship edges


| Graph edge                                 | Physical representation                                 |
| ------------------------------------------ | ------------------------------------------------------- |
| `Transaction ──paid_via──► PaymentMethod`  | `transactions.payment_method_id` → `payment_methods.id` |
| `Transaction ──has──► Item`                | `items.transaction_id` → `transactions.id`              |
| `Transaction ──categorized_as──► Category` | `transaction_categories`                                |
| `Transaction ──for──► Beneficiary`         | `transaction_beneficiaries`                             |
| `Transaction ──at──► Merchant`             | `transactions.merchant_id` → `merchants.id`             |
| `Category ──parent──► Category`            | `categories.parent_id` → `categories.id`                |


The category and beneficiary relations use separate relationship tables because a transaction can have multiple categories and multiple beneficiaries. The beneficiary relationship also has data of its own: the amount allocated to that person. Merchant aliases are stored in `merchant_aliases` and point at `merchants`.

## Example transactions

Assume the user logs the following transactions:

1. **T1** — “Ordered lunch on Zomato for ₹400 via UPI.” (`type = expense`)
2. **T2** — “Ordered a pizza and Coke from Domino's for ₹550 via UPI; ₹400 was for Ravi and ₹150 for Ananya.” (`type = expense`)
3. **T3** — “Ordered a burger and Coke from Domino's for ₹650 via UPI for Ravi.” (`type = expense`)
4. **T4** — “Bought a sandwich and Coke from Campus Café for ₹320 in cash; sandwich for Ananya and Coke for me.” (`type = expense`)
5. **T5** — “Salary credited ₹80,000 from Acme Corp via bank transfer.” (`type = income`)
6. **T6** — “Ravi sent me ₹100 via UPI.” (`type = income`)

T1, T2, and T3 reuse one UPI payment-method node. T2, T3, and T4 each have two items, including a Coke item. T2 and T3 reuse the Domino's merchant node. T5 and T6 are inflows; they still use `status = completed` when the money has landed.

### Payment-method nodes


| id   | method |
| ---- | ------ |
| `P1` | upi    |
| `P2` | cash   |




### Category nodes


| id   | name          | parent_id |
| ---- | ------------- | --------- |
| `C1` | Food          | `NULL`    |
| `C2` | Food delivery | `C1`      |
| `C3` | Restaurants   | `C1`      |
| `C4` | Lunch         | `C1`      |


This creates a category hierarchy:

```text
Food
├── Food delivery
├── Restaurants
└── Lunch
```

`Lunch` is stored as another category node because the user may want to view lunch spending. It can be connected to a transaction alongside `Restaurants` or `Food delivery`. Spending under any child category rolls up into `Food`.