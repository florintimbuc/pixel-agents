# Pixel Agents

Pixel Agents turns AI coding sessions into animated characters in a pixel-art office. This glossary is the canonical language for contributors and integrators; end-user docs may simplify it but must never contradict it.

## Hosts

**Host**:
An environment that composes and runs the office. There are two: VS Code and standalone.
_Avoid_: surface, flavor, platform, edition

**Standalone**:
The host that serves the office to a browser from a local server, independent of any editor.
_Avoid_: CLI (that's the entry command, not the host), browser mode

**Adapter**:
The code that binds one host to the shared runtime. Each host has exactly one adapter.

## Agents & Teams

**Agent**:
An AI coding session tracked by Pixel Agents, whether spawned from the office or adopted from an external terminal.
_Avoid_: bot, terminal (as a synonym), session (as a synonym)

**Character**:
The animated pixel-art figure representing an agent in the office. An agent has a status and a session; its character has a position and an animation state.
_Avoid_: avatar, sprite (a sprite is the image asset, not the figure)

**Sub-agent**:
An ephemeral piece of delegated work running inside an agent's session, visualized with its own character. Not an Agent (no session of its own) and not a Teammate (no name, no team); it exists only for the duration of its task.
_Avoid_: subtask (UI label prefix only)

**Team**:
A named group of agents — one Lead plus its Teammates — working together on a task.

**Lead**:
The agent that owns a Team and spawns its teammates.
_Avoid_: parent (that's the sub-agent relationship), orchestrator

**Teammate**:
A named member of a Team, spawned and coordinated by the Lead. Every teammate is an Agent: it has its own session and transcript. Defined by its identity in the team, not by how it runs.

**Inline teammate**:
A teammate that runs inside the Lead's process and shares the Lead's terminal. It has its own session; its character can be selected, but its terminal cannot be focused — there is no way to switch which session the Lead's terminal displays.

**Tmux teammate**:
A teammate that runs in its own terminal with its own event delivery. Fully focusable, and behaves like any other agent.
_Avoid_: session teammate (both teammate forms have sessions), terminal teammate

## Agent Lifecycle

**Launch**:
Start a new agent from the office.
_Avoid_: spawn (that's the character-level visual event), create

**Adopt**:
Begin tracking a session that was started outside the office. An adopted agent is a full citizen.
_Avoid_: import, attach

**Spawn / Despawn**:
The character-level visual event: a character materializing into or dissolving out of the office. An agent is launched or adopted; its character spawns.

**Dismiss**:
Remove an agent from the office by user choice, without judging its session. A dismissed session is not re-adopted.
_Avoid_: close, delete

**Orphaned**:
An agent whose transcript has been deleted, so the session it represents no longer exists. The office removes orphaned agents automatically.
_Avoid_: stale (implies inactivity or age, which never removes an agent), dead, ended

## Interaction

**Select**:
Mark a character as the current subject in the office (the white outline). Selection is what seat reassignment operates on.
_Avoid_: focus (reserved for terminals), highlight

**Follow**:
The camera tracking the selected character. Ends on manual pan or deselection.
_Avoid_: track

**Focus**:
Bring an agent's terminal to the front. Reserved exclusively for terminals — never the in-office highlight.

## Agent Status

**Active**:
An agent that is executing its turn.
_Avoid_: busy, working, running

**Inactive**:
An agent that is not executing. Comes in exactly three forms: done, waiting for input, or permission request.
_Avoid_: waiting (the wire protocol's historical umbrella term), idle

**Done**:
The inactive form where the agent finished its turn and nothing is pending.

**Waiting for input**:
The inactive form where the agent asked the user something and is blocked on a reply.

**Permission request**:
The inactive form where the agent is blocked until the user approves a tool use. Unlike the other two forms, it can occur mid-turn.

**Activity label**:
The human-readable line describing what an agent is doing right now (e.g. "Reading foo.ts"), shown above its character.
_Avoid_: status text, tool status

**Speech bubble**:
The indicator above a character announcing a form of inactivity: "…" for a permission request (stays until resolved), a checkmark for a finished turn (fades on its own).
_Avoid_: bubble alone when ambiguous, notification

## Office & Layout

**Office**:
The whole simulated world: the layout plus its inhabitants — characters and pets — and their live state.
_Avoid_: map, scene, room, level

**Layout**:
The office's spatial arrangement: the tile grid, floors, walls, carpets, areas, and furniture. It is the part of the office that the editor edits and that can be exported and shared.
_Avoid_: floor plan, blueprint, map

**Tile**:
One cell of the office grid.

**Floor**:
The walkable surface of a tile, painted with a pattern and color.

**Wall**:
A blocking tile that visually connects to adjacent walls.

**Carpet**:
A decorative layer painted over floor tiles.

**Area**:
A named region of tiles. Areas exist so workspace folders can be mapped to them.
_Avoid_: zone, region

**Area mapping**:
The assignment of a workspace folder to one or more areas. Many folders may share an area. Agents launched from a folder prefer seats inside any of its areas.

**Furniture**:
A placeable item in the layout — desks, chairs, storage, electronics, decor.
_Avoid_: object, prop, item

**Desk**:
Furniture that seats face and that hosts surface items. An agent's character sitting at its desk is the visual expression of being active.

**Seat**:
A sittable spot the office derives from chair furniture, assignable to exactly one agent.
_Avoid_: chair (that's the furniture), workstation

**Chair**:
The furniture category whose items create seats. Every footprint tile of a chair yields one seat.

**Seat assignment**:
Which agent owns which seat. Persisted, and changeable by selecting a character and clicking a free seat.

**Pet**:
An animated creature that lives in the office and belongs to no agent. Purely decorative; wanders like a character.
_Avoid_: mascot, animal

**Wander**:
The stroll a character takes away from its seat while its agent is done. Characters whose agents are waiting for input or awaiting a permission stay seated.
_Avoid_: roam, patrol

## Activity Detection

**Hook**:
A push notification an AI tool sends about its own session activity, delivered to Pixel Agents as it happens.

**Transcript**:
The append-only record of a session. Read in both detection modes for tool content.
_Avoid_: JSONL (Claude's file format, not the concept), log

**Hooks mode**:
The preferred detection mode, in which agent status is driven by hooks.

**Heuristic mode**:
The fallback detection mode, in which agent status is inferred from transcript activity, timers, and silence.
_Avoid_: file fallback, transcript mode, polling mode

## Integration Boundary

**Provider**:
The integration that connects one coding-agent CLI — Claude Code, Codex, Pi, Antigravity, OpenClaw, and the like — to Pixel Agents. A provider normalizes its CLI's raw activity into agent events and knows how to install that CLI's hooks. One provider per CLI; Claude Code is the reference implementation.
_Avoid_: plugin, connector

**Agent event**:
The canonical, CLI-agnostic description of something happening in a session: a tool started, a turn ended, a teammate went idle. Providers produce agent events; everything downstream consumes only these, never CLI-specific names.
_Avoid_: hook event (the raw, CLI-specific payload before a provider normalizes it)

**Runtime**:
The host-independent core that tracks agents and drives the office. It is a separate thing from the hosts that compose it, the providers that feed it, and the office UI it serves.
_Avoid_: server, backend

**Transport**:
The channel carrying protocol messages between the office UI and the runtime. The protocol is identical on every host; only the wire differs.
_Avoid_: connection, socket

**Protocol**:
The message contract between the office UI and the runtime, shared by both hosts and defined in a single source of truth.
_Avoid_: API
