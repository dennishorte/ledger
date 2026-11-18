# How `docs/` is organized

**Status:** LIVING
**Last Updated:** 2026-11-18

`docs/` holds three kinds of writing. Each kind has one place. A new file goes in the place that matches what it is for.

```
docs/
  00-project.md            living — project root
  README.md                living — index of the present-tense notes
  <topic>.md               living — one lasting description
  _plans/
    NN-name.md             a top-level leaf
    NN-name/
      00-name.md           a parent that was created with children
      MM-child.md          a child
      99-maintenance/      maintenance rounds for that subtree
  _investigations/
    <writeup>.md           a point-in-time writeup behind an open issue
```

The playbooks live in `.ledger/process/`. They are the process for every project that uses this framework. They are not files in `docs/`.

## Living docs

The markdown files directly in `docs/` are the lasting description of the project, written in the present tense. `docs/00-project.md` is the project root: scope, decisions, and the children manifest in §14. `docs/README.md` is the index of the other present-tense notes. A further lasting description is a new file here, named for what it describes.

A living doc has no lifecycle status and no children manifest. When reality changes, rewrite the doc. When a claim can go stale, stamp **Last verified** with `git rev-parse HEAD` immediately before the commit that changes the doc. The doc never names the commit it lives in.

## Work nodes

A node is the working document for one piece of work. It has the sections in PRD §6.1 and a lifecycle. It lives in `docs/_plans/` from the time it is created until its lasting outcome has been written into a living doc.

| Case | Where the file goes |
|------|---------------------|
| Top-level leaf | `docs/_plans/NN-name.md` |
| Parent created with children | `docs/_plans/NN-name/00-name.md`, children at `docs/_plans/NN-name/MM-child.md` |
| A leaf that is later split | the parent stays at `docs/_plans/NN-name.md`; children go in `docs/_plans/NN-name/` |
| Maintenance rounds | `docs/_plans/NN-name/99-maintenance/` |

`NN` and `MM` are zero-padded two-digit numbers. They set display order only. Leave a gap when inserting a file; do not renumber the files that are already there.

While a node exists, `docs/00-project.md` §14 lists it, and a parent node's own children manifest lists its children. A finished child stays in that manifest for as long as the parent node exists.

## When a node leaves

Finishing the work and removing the node are two steps.

1. The node reaches COMPLETE by `leaf-workflow.md`.
2. Write what should still be true into a living doc at the top of `docs/`. Then delete the node file and remove its row from the parent's children manifest, in one commit.

The living doc is the record that remains. If the work produced nothing that later work needs to read, delete the node without adding a living doc.

## Investigations

`docs/_investigations/` holds a writeup kept as it was written, usually the backing notes for an open issue. It is left as a record of that moment. A conclusion that later work still needs is written into a living doc.
