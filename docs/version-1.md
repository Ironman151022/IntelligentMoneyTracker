# Version 1 — Transaction Logging

## Goal
Version 1 supports fast capture and logging of transactions from user input.

## Included
- Create a transaction from voice or text input
- Extract amount, currency, merchant, category, and payment method when available
- Record the system capture time; never extract, infer, or ask the user for a date or time
- Store immutable source evidence
- Link evidence to the created transaction
- Show a success, review, or failure state

## Excluded
- Editing or deleting transactions
- Transaction corrections
- Queries and analytics
- Budgeting
- Recurrence detection
- Split transactions
- User preference learning
- Advanced categorization feedback

## Core flow
1. User triggers the gesture and provides input.
2. The app stores the input as Evidence.
3. AI extracts structured transaction data without a user-provided date or time.
4. The backend validates and creates the Transaction.
5. The UI displays the logged transaction.

## Transaction states
- `confirmed`: required fields were extracted confidently.
- `needs_review`: transaction was saved but has missing or ambiguous fields.
- `failed`: the transaction could not be created.
