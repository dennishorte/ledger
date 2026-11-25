# System record

What a reader treats as true about the system, in the present tense.

## The corpus

The record is a tree of pages. Each page is a part, and each part is a page. A nested page is a part inside the page that contains it. The root page is the system.

A part contains itself and every part whose page is nested inside its page. The smallest part that contains a set of parts is the one that contains every part in the set and does not contain another part that also contains every part in the set.

Whether work is a new part is a judgment. Once a page exists, a reader follows that page and does not split it. A new part is a new page and a Parts entry on the containing page, both in the same change.

The root page is `docs/00-project.md` and stays there. The directory that holds a page holds that page as `00-name.md`, so `docs/` holds the root page. A child is a folder beside that page. The folder is `NN-name`. `NN` is a zero-padded two-digit number from `01` up, and it sets the order of those children only. The child's page is `00-name.md` in that folder, and `name` is the same on the folder and on the file. A child with no children of its own is a folder. A child inserted between two others takes a free number. A child already there keeps its number. One level down is the same: a page keeps its path, and its children are folders beside that page. A folder beside a page whose name begins with `_` is not a child. `_plans` and `_investigations` are such folders.

## Where a fact lives

Each fact has one home, and that page states it. The homes are in this order. The first one that fits is the home.

1. **Episode.** One case of this part running lives in Behavior. The episode states the case, then the setup, the action, and the result. Each invariant in Offers and each obligation in Rules has one episode, and that episode's result is that invariant or obligation holding. Behavior has no other episode.
2. **Surface.** An input or an output of this part lives in Offers. An invariant or a standing obligation that names an input or an output of this part lives there too. Offers does not say how the part is built.
3. **Obligation.** A standing obligation of this part while it runs, which names no input and no output, lives in Rules.
4. **Work.** The work that belongs to this part, then each boundary line, lives in Responsibility. A boundary line states work this part does not do and names no other part. Work the system does not do is stated only on the root.
5. **Containment.** A Parts entry records that the child is inside the parent. Each part has one name. No other part has that name. The name is the same on the child's page, in that entry, and in the system. A reader uses that name to decide whether a change is inside that child.
6. **Dependency.** A dependency between two parts that both have pages has one line, on the Dependencies of the smallest part that contains both. A dependency on something with no page has one line, on the Dependencies of the part that depends on it.

A term used in an Offers section is defined in that Offers section and nowhere else. No other Offers section uses that term. Only the page of that part, and pages nested inside it, may use the term. Any other term is defined once, in Words, on the smallest part that contains every page that uses it.

`None` in a section means that section's home has no facts.

## The page

Every page has the same sections, in this order: Responsibility, Parts, Offers, Dependencies, Behavior, Rules, Words, Checked.

### Parts

The next level down. Each entry is the child's name and the link to its page.

### Dependencies

Each line is "A depends on B". A party that has a page has its name as a link to that page. A party with no link has no page.

### Behavior

The names and values are the ones the system uses.

### Checked

Checked is not a fact about the system. It is `None`, or the date of a comparison that found every fact then on the page holding. Editing any fact on the page sets Checked to `None`.

## What a reader reads

A reader changing one part reads that part's page in full and every page above it in full. On those pages, each dependency line that names the part makes the other party a neighbor. When the neighbor's name is a link and that page is not already read in full, the reader reads that page's Offers and nothing else. When the name has no link, the reader opens nothing.

Those pages are the reading set. The reader does not read any other page. When the change is inside a child, that child is the part being changed, and the reading set is that child's.

The reading set is gathered by the skill `reading-set`.

## Authority

A reader treats each fact as true on its home page, whether or not Checked has a date.

The reader adds, removes, and rewrites facts only on pages in the reading set, and only for a fact the change adds, removes, or falsifies. Those edits are part of the same change. The reader does not move the change onto the part that homes a fact outside that set.

A difference between a page and the system that this change does not add, remove, or falsify is left as it is. The reader does not change the system to match the page, and does not change the page to match the system.

## Outside the record

The reason an obligation exists, the history of a choice, the alternatives, and instructions for a task are not facts on these pages.

A spirit is kept in `spirit.md` beside the page of the part it belongs to. A sub-part has a spirit of its own when the intent of that part is not already said by the spirit of the parts above it.
