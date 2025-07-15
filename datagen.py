import json
import random
from pathlib import Path
from typing import List, Tuple

# ---------- tweak these knobs ---------- #
NUM_ROOTS               = 20
NUM_CHILD_POOL          = 40
NUM_GRANDCHILD_POOL     = 70
CHILDREN_PER_ROOT       = 4
GRANDCHILDREN_PER_CHILD = 3
SEED                    = 42
# --------------------------------------- #

def build_edges() -> List[Tuple[str, str]]:
    """Return list of directed edges (parent, child)."""
    random.seed(SEED)

    roots        = [f"Person{i}" for i in range(1, NUM_ROOTS + 1)]
    child_pool   = [f"Child{i}"  for i in range(1, NUM_CHILD_POOL + 1)]
    grand_pool   = [f"Grand{i}"  for i in range(1, NUM_GRANDCHILD_POOL + 1)]

    edges: List[Tuple[str, str]] = []

    # root → child
    for r in roots:
        picks = random.sample(child_pool, CHILDREN_PER_ROOT)
        edges.extend((r, c) for c in picks)

    # child → grandchild
    children_used = {c for _, c in edges}
    for c in children_used:
        picks = random.sample(grand_pool, GRANDCHILDREN_PER_CHILD)
        edges.extend((c, g) for g in picks)

    return roots, edges


def write_parent_name(roots: List[str], edges: List[Tuple[str, str]], path: Path):
    """Write JSON-Lines with fields {parent, name}."""
    with path.open("w") as f:
        # roots first
        for r in roots:
            json.dump({"parent": None, "name": r}, f)
            f.write("\n")

        # every edge becomes a record
        for parent, child in edges:
            json.dump({"parent": parent, "name": child}, f)
            f.write("\n")


if __name__ == "__main__":
    roots, edges = build_edges()
    out = Path("nodes_parent_name.jsonl")
    write_parent_name(roots, edges, out)

    print(f"Wrote {out} with {len(roots) + len(edges)} records.")

