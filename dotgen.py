#!/usr/bin/env python3
"""generate_dot.py

From `nodes_parent_name.jsonl` build:
  • macro.dot         – global view (roots + shared children, cluster per child)
  • micro_<root>.dot  – one detailed tree per root (root → children → grandchildren)

Usage
-----
$ python generate_dot.py           # assumes nodes_parent_name.jsonl in CWD
$ python generate_dot.py path/to/nodes_parent_name.jsonl

Then render:
$ sfdp  -Tsvg macro.dot        -o macro.svg   # global view
$ dot   -Tsvg micro_Person1.dot -o micro_Person1.svg  # single tree
$ for f in micro_*.dot; do dot -Tsvg "$f" -o "${f%.dot}.svg"; done
"""

import json
import sys
from collections import defaultdict
from pathlib import Path
from typing import Dict, Set, List, Tuple

# ----------------------- helpers ----------------------- #

def load_records(path: Path):
    """Return list of JSON objects from a .jsonl file."""
    return [json.loads(line) for line in path.read_text().splitlines() if line.strip()]


def build_graph(records):
    """Return (roots, children_of_root, grandchildren_of_child, edges).

    roots                     – list[str]
    children_of_root          – dict[root, set[child]]
    grandchildren_of_child    – dict[child, set[grand]]
    edges                     – list[(parent, child)]  # all directed edges
    """
    roots: List[str] = []
    edges: List[Tuple[str, str]] = []
    children_of_root: Dict[str, Set[str]] = defaultdict(set)
    grandchildren_of_child: Dict[str, Set[str]] = defaultdict(set)

    for rec in records:
        parent, name = rec["parent"], rec["name"]
        if parent is None:                       # a root declaration
            roots.append(name)
            continue
        edges.append((parent, name))             # directed edge
        if parent.startswith("Person"):         # root → child
            children_of_root[parent].add(name)
        elif parent.startswith("Child"):        # child → grandchild
            grandchildren_of_child[parent].add(name)

    return roots, children_of_root, grandchildren_of_child, edges


# ----------------------- DOT writers ----------------------- #

def write_macro(roots: List[str], children_of_root: Dict[str, Set[str]], out: Path):
    """Create macro.dot with clusters for every child."""
    all_children = sorted(set().union(*children_of_root.values()))
    lines = [
        "digraph G {",
        "    layout=sfdp;",
        "    overlap=false;",
        "    sep=\"+10\";",
        "",
    ]

    # clusters – one per child so overlapping children pop visually
    for child in all_children:
        lines.append(f"    subgraph cluster_{child} {{ label=\"{child}\"; color=\"#6baed6\"; {child}; }}")
    lines.append("")

    # root nodes styled + hyperlink to their micro SVG
    for root in roots:
        url = f"micro_{root}.svg"
        lines.append(
            f"    \"{root}\" [shape=box, style=filled, fillcolor=\"#f97316\", URL=\"{url}\", tooltip=\"Zoom to {root}\"];")
    lines.append("")

    # edges root → child
    for root, kids in children_of_root.items():
        for child in kids:
            lines.append(f"    \"{root}\" -> \"{child}\";")

    lines.append("}")
    out.write_text("\n".join(lines))
    print(f"✔  wrote {out}")


def write_micro(root: str, children: Set[str], grandchildren_of_child: Dict[str, Set[str]], out: Path):
    """Create micro_<root>.dot – full tree two levels deep."""
    lines = [
        "digraph G {",
        "    rankdir=LR;",                      # horizontal tree
        "    node [style=filled, shape=circle, fillcolor=\"#3b82f6\"];",  # default child colour
        "    \n    // root",  # comment
        f"    \"{root}\" [shape=box, fillcolor=\"#f97316\"];",
        "",
    ]

    # children nodes + edge
    for child in children:
        lines.append(f"    \"{child}\";")
        lines.append(f"    \"{root}\" -> \"{child}\";")

    # grandchildren nodes + edges
    for child in children:
        grands = grandchildren_of_child.get(child, set())
        for grand in grands:
            lines.append(f"    \"{grand}\" [fillcolor=\"#16a34a\"];")
            lines.append(f"    \"{child}\" -> \"{grand}\";")

    lines.append("}")
    out.write_text("\n".join(lines))
    # report count
    print(f"✔  wrote {out} (children: {len(children)}, grands: {sum(len(grandchildren_of_child.get(c,set())) for c in children)})")


# ----------------------- main ----------------------- #

def main(path_jsonl: str = "nodes_parent_name.jsonl"):
    p = Path(path_jsonl)
    if not p.exists():
        sys.exit(f"File not found: {p}")

    records = load_records(p)
    roots, children_of_root, grandchildren_of_child, _ = build_graph(records)

    # write macro
    write_macro(roots, children_of_root, Path("macro.dot"))

    # write microlayout for each root
    for root in roots:
        children = children_of_root.get(root, set())
        out = Path(f"micro_{root}.dot")
        write_micro(root, children, grandchildren_of_child, out)


if __name__ == "__main__":
    main(*sys.argv[1:])

