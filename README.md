# Intelligent Money Tracker

An intelligent, privacy-first money tracking application powered by on-device AI and a knowledge graph.

## Key Features

- **Local LLM** — Uses on-device language models with no cloud inference, keeping your financial data private.
- **Mobile friendly** — Designed for seamless use on mobile devices.
- **Knowledge Graph (Ontology)** — Organizes transactions and relationships in a structured, queryable graph.
- **Gesture-based activation** — Trigger the AI instantly through intuitive gestures such as a double tap or a long press of the volume button, enabling hands-free, quick access.


## Workflow [ Features ]

1. **Activation** — The user activates the app via settings or gestures.
2. **Voice input** *(F1)* — The user speaks naturally, for example:
   > *"I bought food from Zomato for around ₹100."*
   
   The LLM listens, parses the input, and stores the transaction in the knowledge graph.

3. **Photo upload** *(F2)* — The user can upload photos (e.g., receipts or bills) for additional context.

4. **Automatic payment detection** *(F3)* — AI activates automatically when a payment is detected.

## Data Architecture

```
Database ⇌ Knowledge Graph
```

The traditional database and knowledge graph stay synchronized, enabling both structured storage and rich semantic relationships.
