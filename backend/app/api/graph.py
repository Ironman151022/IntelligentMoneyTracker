from fastapi import APIRouter, HTTPException, Query

from app.services.database import get_connection

router = APIRouter(prefix="/graph", tags=["graph"])

RECENT_TXN_DEFAULT = 100


def _nid(kind: str, entity_id: int) -> str:
    return f"{kind}:{entity_id}"


@router.get("/")
def get_graph(limit: int = Query(RECENT_TXN_DEFAULT, ge=1, le=500)):
    """Project relational tables into ontology nodes + edges for visualization."""
    conn = get_connection()
    try:
        transactions = conn.execute(
            """
            SELECT id, amount, currency, type, status, created_at,
                   payment_method_id, merchant_id
            FROM transactions
            ORDER BY id DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()

        if not transactions:
            return {"nodes": [], "edges": [], "transaction_count": 0}

        txn_ids = [row["id"] for row in transactions]
        placeholders = ",".join("?" * len(txn_ids))

        payment_ids = {
            row["payment_method_id"]
            for row in transactions
            if row["payment_method_id"] is not None
        }
        merchant_ids = {
            row["merchant_id"] for row in transactions if row["merchant_id"] is not None
        }

        items = conn.execute(
            f"""
            SELECT id, name, transaction_id, line_amount, quantity
            FROM items
            WHERE transaction_id IN ({placeholders})
            """,
            txn_ids,
        ).fetchall()

        txn_categories = conn.execute(
            f"""
            SELECT transaction_id, category_id
            FROM transaction_categories
            WHERE transaction_id IN ({placeholders})
            """,
            txn_ids,
        ).fetchall()

        txn_beneficiaries = conn.execute(
            f"""
            SELECT transaction_id, beneficiary_id, allocated_amount
            FROM transaction_beneficiaries
            WHERE transaction_id IN ({placeholders})
            """,
            txn_ids,
        ).fetchall()

        category_ids = {row["category_id"] for row in txn_categories}
        beneficiary_ids = {row["beneficiary_id"] for row in txn_beneficiaries}

        # Walk category parents so hierarchy edges are visible.
        categories_by_id: dict[int, dict] = {}
        pending = set(category_ids)
        while pending:
            batch = list(pending)
            pending = set()
            batch_ph = ",".join("?" * len(batch))
            rows = conn.execute(
                f"""
                SELECT id, name, parent_id
                FROM categories
                WHERE id IN ({batch_ph})
                """,
                batch,
            ).fetchall()
            for row in rows:
                categories_by_id[row["id"]] = dict(row)
                parent_id = row["parent_id"]
                if parent_id is not None and parent_id not in categories_by_id:
                    pending.add(parent_id)
                    category_ids.add(parent_id)

        payment_methods: dict[int, dict] = {}
        if payment_ids:
            pm_ph = ",".join("?" * len(payment_ids))
            for row in conn.execute(
                f"SELECT id, method FROM payment_methods WHERE id IN ({pm_ph})",
                list(payment_ids),
            ).fetchall():
                payment_methods[row["id"]] = dict(row)

        merchants: dict[int, dict] = {}
        if merchant_ids:
            m_ph = ",".join("?" * len(merchant_ids))
            for row in conn.execute(
                f"SELECT id, name FROM merchants WHERE id IN ({m_ph})",
                list(merchant_ids),
            ).fetchall():
                merchants[row["id"]] = dict(row)

        beneficiaries: dict[int, dict] = {}
        if beneficiary_ids:
            b_ph = ",".join("?" * len(beneficiary_ids))
            for row in conn.execute(
                f"""
                SELECT id, name, relationship
                FROM beneficiaries
                WHERE id IN ({b_ph})
                """,
                list(beneficiary_ids),
            ).fetchall():
                beneficiaries[row["id"]] = dict(row)

        nodes: dict[str, dict] = {}
        edges: list[dict] = []

        def add_node(node_id: str, node_type: str, label: str, data: dict | None = None):
            if node_id not in nodes:
                nodes[node_id] = {
                    "id": node_id,
                    "type": node_type,
                    "label": label,
                    "data": data or {},
                }

        for txn in transactions:
            tid = txn["id"]
            txn_node = _nid("transaction", tid)
            add_node(
                txn_node,
                "Transaction",
                f"₹{txn['amount']} {txn['type']}",
                {
                    "id": tid,
                    "amount": txn["amount"],
                    "currency": txn["currency"],
                    "type": txn["type"],
                    "status": txn["status"],
                    "created_at": txn["created_at"],
                },
            )

            if txn["payment_method_id"] is not None:
                pid = txn["payment_method_id"]
                pm = payment_methods.get(pid)
                if pm:
                    pm_node = _nid("payment_method", pid)
                    add_node(
                        pm_node,
                        "PaymentMethod",
                        pm["method"],
                        {"id": pid, "method": pm["method"]},
                    )
                    edges.append(
                        {
                            "source": txn_node,
                            "target": pm_node,
                            "rel": "paid_via",
                        }
                    )

            if txn["merchant_id"] is not None:
                mid = txn["merchant_id"]
                merchant = merchants.get(mid)
                if merchant:
                    m_node = _nid("merchant", mid)
                    add_node(
                        m_node,
                        "Merchant",
                        merchant["name"],
                        {"id": mid, "name": merchant["name"]},
                    )
                    edges.append(
                        {"source": txn_node, "target": m_node, "rel": "at"}
                    )

        for item in items:
            item_node = _nid("item", item["id"])
            add_node(
                item_node,
                "Item",
                item["name"],
                {
                    "id": item["id"],
                    "name": item["name"],
                    "line_amount": item["line_amount"],
                    "quantity": item["quantity"],
                    "transaction_id": item["transaction_id"],
                },
            )
            edges.append(
                {
                    "source": _nid("transaction", item["transaction_id"]),
                    "target": item_node,
                    "rel": "has",
                }
            )

        for link in txn_categories:
            cid = link["category_id"]
            cat = categories_by_id.get(cid)
            if not cat:
                continue
            c_node = _nid("category", cid)
            add_node(
                c_node,
                "Category",
                cat["name"],
                {"id": cid, "name": cat["name"], "parent_id": cat["parent_id"]},
            )
            edges.append(
                {
                    "source": _nid("transaction", link["transaction_id"]),
                    "target": c_node,
                    "rel": "categorized_as",
                }
            )

        for cat in categories_by_id.values():
            if cat["parent_id"] is None:
                continue
            parent = categories_by_id.get(cat["parent_id"])
            if not parent:
                continue
            child_node = _nid("category", cat["id"])
            parent_node = _nid("category", parent["id"])
            add_node(
                child_node,
                "Category",
                cat["name"],
                {
                    "id": cat["id"],
                    "name": cat["name"],
                    "parent_id": cat["parent_id"],
                },
            )
            add_node(
                parent_node,
                "Category",
                parent["name"],
                {
                    "id": parent["id"],
                    "name": parent["name"],
                    "parent_id": parent["parent_id"],
                },
            )
            edges.append(
                {"source": child_node, "target": parent_node, "rel": "parent"}
            )

        for link in txn_beneficiaries:
            bid = link["beneficiary_id"]
            beneficiary = beneficiaries.get(bid)
            if not beneficiary:
                continue
            b_node = _nid("beneficiary", bid)
            add_node(
                b_node,
                "Beneficiary",
                beneficiary["name"],
                {
                    "id": bid,
                    "name": beneficiary["name"],
                    "relationship": beneficiary["relationship"],
                },
            )
            edges.append(
                {
                    "source": _nid("transaction", link["transaction_id"]),
                    "target": b_node,
                    "rel": "for",
                    "data": {"allocated_amount": link["allocated_amount"]},
                }
            )

        return {
            "nodes": list(nodes.values()),
            "edges": edges,
            "transaction_count": len(transactions),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error building graph: {e}") from e
    finally:
        conn.close()
