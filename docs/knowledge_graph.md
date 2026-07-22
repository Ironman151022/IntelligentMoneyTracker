# Money-tracker knowledge graph

This model represents financial data as connected entities. The database uses normal, typed tables for speed and low storage use; the foreign keys and relationship tables are the graph edges. A graph database and embeddings are not required for this model.

## Nodes

The model has six node types.

1. **Transaction** — one completed, pending, cancelled, or refunded money event. It stores the amount, currency, status, and app-recorded timestamps.
2. **PaymentMethod** — how the transaction was paid, for example `upi`, `cash`, or `card`. One UPI node can be reused by many transactions.
3. **Category** — a user-visible classification. Categories form a hierarchy: for example, `Food` can be the parent of `Restaurants`, `Food delivery`, and `Lunch`.
4. **Merchant** — the payee, shop, platform, or brand, for example Zomato or Domino's. A merchant node is reused across transactions.
5. **LineItem** — one item bought within a transaction, including its name, quantity, and cost. A line item belongs to one transaction.
6. **Beneficiary** — the person who benefited from a transaction, such as `Self`, Ravi, or Ananya. A beneficiary can be linked to many transactions.

`Transaction` is a graph node even though it has its own table. A dedicated typed table makes common financial queries, indexes, and amount validation efficient.

## Tables

The first six tables contain the nodes. The remaining tables contain relationships or lookup aliases; they are not additional node types.

| Table name | Columns |
| --- | --- |
| `transactions` | `id` (PK), `amount_minor`, `currency`, `status`, `recorded_at`, `updated_at`, `payment_method_id` (FK → `payment_methods.id`), `merchant_id` (FK → `merchants.id`) |
| `payment_methods` | `id` (PK), `method` |
| `categories` | `id` (PK), `name`, `parent_category_id` (nullable FK → `categories.id`) |
| `merchants` | `id` (PK), `name`, `normalized_name` |
| `line_items` | `id` (PK), `transaction_id` (FK → `transactions.id`), `name`, `quantity`, `cost_minor` |
| `beneficiaries` | `id` (PK), `name`, `relation` |
| `transaction_categories` | `transaction_id` (FK → `transactions.id`), `category_id` (FK → `categories.id`), primary key: (`transaction_id`, `category_id`) |
| `transaction_beneficiaries` | `transaction_id` (FK → `transactions.id`), `beneficiary_id` (FK → `beneficiaries.id`), `allocated_amount_minor`, primary key: (`transaction_id`, `beneficiary_id`) |
| `merchant_aliases` | `id` (PK), `merchant_id` (FK → `merchants.id`), `alias`, `normalized_alias` |

`amount_minor`, `cost_minor`, and `allocated_amount_minor` use the currency's smallest unit. For INR, `40000` represents ₹400. This avoids floating-point rounding errors.

`categories` intentionally has only `name` and `parent_category_id` beyond its ID. There is no `kind` column. A category's position in the hierarchy supplies its meaning.

## Relationship edges

| Graph edge | Physical representation |
| --- | --- |
| `Transaction ──VIA──► PaymentMethod` | `transactions.payment_method_id` |
| `Transaction ──AT──► Merchant` | `transactions.merchant_id` |
| `Transaction ──CATEGORIZED_AS──► Category` | `transaction_categories` |
| `Category ──CHILD_OF──► Category` | `categories.parent_category_id` |
| `Transaction ──HAS_LINE_ITEM──► LineItem` | `line_items.transaction_id` |
| `Transaction ──FOR──► Beneficiary` | `transaction_beneficiaries` |

The category and beneficiary relations use separate relationship tables because a transaction can have multiple categories and multiple beneficiaries. The beneficiary relationship also has data of its own: the amount allocated to that person.

## Example transactions

Assume the user logs the following transactions:

1. **T1** — “Ordered lunch on Zomato for ₹400 via UPI.”
2. **T2** — “Ordered a pizza and Coke from Domino's for ₹550 via UPI; ₹400 was for Ravi and ₹150 for Ananya.”
3. **T3** — “Ordered a burger and Coke from Domino's for ₹650 via UPI for Ravi.”
4. **T4** — “Bought a sandwich and Coke from Campus Café for ₹320 in cash; sandwich for Ananya and Coke for me.”

T1, T2, and T3 reuse one UPI payment-method node. T2, T3, and T4 each have two line items, including a Coke line item. T2 and T3 reuse the Domino's merchant node.

### Payment-method nodes

| id | method |
| --- | --- |
| `P1` | upi |
| `P2` | cash |

### Category nodes

| id | name | parent_category_id |
| --- | --- | --- |
| `C1` | Food | `NULL` |
| `C2` | Food delivery | `C1` |
| `C3` | Restaurants | `C1` |
| `C4` | Lunch | `C1` |

This creates a category hierarchy:

```text
Food
├── Food delivery
├── Restaurants
└── Lunch
```

`Lunch` is stored as another category node because the user may want to view lunch spending. It can be connected to a transaction alongside `Restaurants` or `Food delivery`. Spending under any child category rolls up into `Food`.
