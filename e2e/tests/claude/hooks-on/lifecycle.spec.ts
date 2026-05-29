import path from 'path';

import { expect, test } from '../../../fixtures/pixel-agents';
import {
  idlePrompt,
  notificationPermissionPrompt,
  preToolUseAgent,
  preToolUseBash,
  sendHookEvent,
  sessionEndClear,
  sessionEndExit,
  sessionEndResume,
  sessionStartClear,
  sessionStartResume,
  sessionStartStartup,
  subagentStart,
  taskCompleted,
  teammateIdle,
  waitForHookServer,
} from '../../../helpers/hooks';
import { spawnInternalAgentAndWait } from '../../../helpers/internal-agent';
import {
  INLINE_TEAMMATE_ALIAS,
  INLINE_TEAMMATE_ROLE,
  uniqueTeamName,
  withInlineTeammateSession,
  withInlineTeammateSessions,
} from '../../../helpers/lifecycle';
import {
  arrangeNextClaudeInvocation,
  claudeScenario,
  mockClaudeInitRecord,
  spawnExternalClaudeScenario,
  waitForClaudeHookSetup,
} from '../../../helpers/mock-claude';
import {
  closeAgentFromOverlay,
  expectNoOverlay,
  expectNoOverlayWithTexts,
  expectOverlayCount,
  expectOverlayVisible,
  expectOverlayVisibleForAgent,
  expectOverlayVisibleWithTexts,
  expectSingleAgentOverlay,
  readAgentOverlayIds,
} from '../../../helpers/office';
import {
  buildAssistantToolUseBatchRecord,
  buildAssistantToolUseRecord,
  buildTeamConfig,
  buildTeamMetadataRecord,
  buildTurnDurationRecord,
  buildUserToolResultBatchRecord,
  buildUserToolResultRecord,
  getClaudeProjectDir,
  seedTeamConfig,
} from '../../../helpers/team';
import {
  closeBottomPanel,
  getPixelAgentsFrame,
  openPixelAgentsPanel,
  setSettings,
} from '../../../helpers/webview';

const PARALLEL_PARENT_TOOL_ID = 'toolu-b5-parent';
const SECOND_TEAMMATE_ALIAS = 'reviewer';
const SECOND_TEAMMATE_ROLE = 'reviewer';

function otherOverlayId(ids: number[], knownId: number): number {
  const otherId = ids.find((id) => id !== knownId);
  if (otherId === undefined) {
    throw new Error(`Expected an overlay id other than ${knownId}, got ${JSON.stringify(ids)}`);
  }
  return otherId;
}

test.describe('Hooks ON / Lifecycle', () => {
  test('B1 internal clear reassignment', async ({ pixelAgents }) => {
    const { frame, window, tmpHome, mockLogFile } = pixelAgents;

    await setSettings(frame, {
      watchAllSessions: false,
      hooksEnabled: true,
      alwaysShowLabels: true,
      debugView: false,
    });

    await waitForClaudeHookSetup(tmpHome);
    await arrangeNextClaudeInvocation(
      tmpHome,
      claudeScenario('B1 internal clear reassignment')
        .defineSession('replacement', '{{sessionId}}-clear')
        .at(3_500)
        .emitHook(sessionEndClear('{{sessionId}}') as Record<string, unknown>)
        .at(3_600)
        .appendJsonl(mockClaudeInitRecord('mock-claude-clear-ready'), {
          session: 'replacement',
        })
        .at(3_800)
        .emitHook(
          sessionStartClear(
            '{{sessions.replacement.sessionId}}',
            '{{cwd}}',
            '{{sessions.replacement.transcriptPath}}',
          ) as Record<string, unknown>,
        )
        .at(4_200)
        .emitHook(
          preToolUseBash('{{sessions.replacement.sessionId}}', 'npm test') as Record<
            string,
            unknown
          >,
        )
        .at(4_800)
        .emitHook(preToolUseBash('{{sessionId}}', 'npm run stale') as Record<string, unknown>)
        .holdOpenFor(7_000)
        .build(),
    );
    await spawnInternalAgentAndWait(frame, tmpHome, mockLogFile);
    await openPixelAgentsPanel(window);
    const panelFrame = await getPixelAgentsFrame(window);
    const originalAgentId = await expectSingleAgentOverlay(panelFrame);

    await expectOverlayVisible(panelFrame, 'Running: npm test');
    await expectOverlayCount(panelFrame, 1);
    expect(await readAgentOverlayIds(panelFrame)).toEqual([originalAgentId]);

    await panelFrame.waitForTimeout(500);
    await expectNoOverlay(panelFrame, 'Running: npm run stale');
    expect(await readAgentOverlayIds(panelFrame)).toEqual([originalAgentId]);
  });

  test('B3 internal resume reassignment within grace', async ({ pixelAgents }) => {
    const { frame, window, tmpHome, mockLogFile } = pixelAgents;

    await setSettings(frame, {
      watchAllSessions: false,
      hooksEnabled: true,
      alwaysShowLabels: true,
      debugView: false,
    });

    await waitForClaudeHookSetup(tmpHome);
    await arrangeNextClaudeInvocation(
      tmpHome,
      claudeScenario('B3 internal resume reassignment')
        .defineSession('replacement', '{{sessionId}}-resume')
        .at(3_500)
        .emitHook(sessionEndResume('{{sessionId}}') as Record<string, unknown>)
        .at(3_600)
        .appendJsonl(mockClaudeInitRecord('mock-claude-resume-ready'), {
          session: 'replacement',
        })
        .at(3_800)
        .emitHook(
          sessionStartResume(
            '{{sessions.replacement.sessionId}}',
            '{{cwd}}',
            '{{sessions.replacement.transcriptPath}}',
          ) as Record<string, unknown>,
        )
        .at(4_200)
        .emitHook(
          preToolUseBash('{{sessions.replacement.sessionId}}', 'npm test') as Record<
            string,
            unknown
          >,
        )
        .at(4_800)
        .emitHook(preToolUseBash('{{sessionId}}', 'npm run stale') as Record<string, unknown>)
        .holdOpenFor(9_000)
        .build(),
    );
    await spawnInternalAgentAndWait(frame, tmpHome, mockLogFile);
    await openPixelAgentsPanel(window);
    const panelFrame = await getPixelAgentsFrame(window);
    const originalAgentId = await expectSingleAgentOverlay(panelFrame);

    await expectOverlayVisible(panelFrame, 'Running: npm test');
    await expectOverlayCount(panelFrame, 1);
    expect(await readAgentOverlayIds(panelFrame)).toEqual([originalAgentId]);

    // Settling wait: give the runtime a chance to wrongly attach the stale tool
    // to the resumed agent before asserting absence.
    await panelFrame.waitForTimeout(500);
    await expectNoOverlay(panelFrame, 'Running: npm run stale');

    // Wait past the 2s resume grace window for the new tool to take effect.
    // expectOverlayVisible polls until the assertion holds; bumping the timeout
    // covers grace expiry + post-grace tool propagation.
    await expectOverlayVisible(panelFrame, 'Running: npm test', 5_000);
    await expectOverlayCount(panelFrame, 1);
    expect(await readAgentOverlayIds(panelFrame)).toEqual([originalAgentId]);
  });

  test('B2 clear edge with another agent in the same projectDir', async ({ pixelAgents }) => {
    const { frame, window, tmpHome, workspaceDir, mockLogFile } = pixelAgents;

    await setSettings(frame, {
      watchAllSessions: true,
      hooksEnabled: true,
      alwaysShowLabels: true,
      debugView: false,
    });

    await waitForClaudeHookSetup(tmpHome);
    await arrangeNextClaudeInvocation(
      tmpHome,
      claudeScenario('B2 clear edge with sibling agent hooks on')
        .defineSession('replacement', '{{sessionId}}-clear')
        .at(7_000)
        .emitHook(sessionEndClear('{{sessionId}}') as Record<string, unknown>)
        .at(7_100)
        .appendJsonl(mockClaudeInitRecord('mock-claude-b2-clear-ready'), {
          session: 'replacement',
        })
        .at(7_300)
        .emitHook(
          sessionStartClear(
            '{{sessions.replacement.sessionId}}',
            '{{cwd}}',
            '{{sessions.replacement.transcriptPath}}',
          ) as Record<string, unknown>,
        )
        .at(7_600)
        .emitHook(
          preToolUseBash('{{sessions.replacement.sessionId}}', 'npm run cleared') as Record<
            string,
            unknown
          >,
        )
        .at(8_100)
        .emitHook(preToolUseBash('{{sessionId}}', 'npm run stale') as Record<string, unknown>)
        .holdOpenFor(12_000)
        .build(),
    );

    await spawnInternalAgentAndWait(frame, tmpHome, mockLogFile);
    await openPixelAgentsPanel(window);
    const panelFrame = await getPixelAgentsFrame(window);
    const internalAgentId = await expectSingleAgentOverlay(panelFrame);

    await spawnExternalClaudeScenario({
      tmpHome,
      workspaceDir,
      mockLogFile,
      sessionId: 'b2-sibling-hooks-on',
      scenario: claudeScenario('B2 sibling external hooks on')
        .at(200)
        .emitHook(
          sessionStartStartup('b2-sibling-hooks-on', '{{cwd}}', '{{transcriptPath}}') as Record<
            string,
            unknown
          >,
        )
        .at(1_000)
        .emitHook(
          preToolUseBash('b2-sibling-hooks-on', 'npm run sibling') as Record<string, unknown>,
        )
        .holdOpenFor(12_000)
        .build(),
    });

    await expectOverlayCount(panelFrame, 2, 12_000);
    const externalAgentId = otherOverlayId(await readAgentOverlayIds(panelFrame), internalAgentId);

    await expectOverlayVisibleForAgent(panelFrame, externalAgentId, 'Running: npm run sibling');
    await expectOverlayVisibleForAgent(
      panelFrame,
      internalAgentId,
      'Running: npm run cleared',
      12_000,
    );
    await expectNoOverlay(panelFrame, 'Running: npm run stale');
    expect(await readAgentOverlayIds(panelFrame)).toEqual([internalAgentId, externalAgentId]);
  });

  test('B4 resume after grace expires cleans up the old agent', async ({ pixelAgents }) => {
    const { frame, tmpHome, workspaceDir, mockLogFile } = pixelAgents;

    await setSettings(frame, {
      watchAllSessions: true,
      hooksEnabled: true,
      alwaysShowLabels: true,
      debugView: false,
    });

    await waitForClaudeHookSetup(tmpHome);
    await spawnExternalClaudeScenario({
      tmpHome,
      workspaceDir,
      mockLogFile,
      sessionId: 'b4-hooks-on-old',
      scenario: claudeScenario('B4 resume after grace expires hooks on')
        .defineSession('replacement', 'b4-hooks-on-resumed')
        .at(200)
        .emitHook(
          sessionStartStartup('b4-hooks-on-old', '{{cwd}}', '{{transcriptPath}}') as Record<
            string,
            unknown
          >,
        )
        .at(900)
        .emitHook(
          preToolUseBash('b4-hooks-on-old', 'npm run before-resume') as Record<string, unknown>,
        )
        .at(2_200)
        .emitHook(sessionEndResume('b4-hooks-on-old') as Record<string, unknown>)
        .at(4_800)
        .appendJsonl(mockClaudeInitRecord('mock-claude-b4-late-resume'), {
          session: 'replacement',
        })
        .at(5_000)
        .emitHook(
          sessionStartResume(
            '{{sessions.replacement.sessionId}}',
            '{{cwd}}',
            '{{sessions.replacement.transcriptPath}}',
          ) as Record<string, unknown>,
        )
        .at(5_300)
        .emitHook(
          preToolUseBash('{{sessions.replacement.sessionId}}', 'npm run late-resume') as Record<
            string,
            unknown
          >,
        )
        .holdOpenFor(9_000)
        .build(),
    });

    await expectOverlayVisible(frame, 'Running: npm run before-resume');
    const oldAgentId = await expectSingleAgentOverlay(frame);

    await expectOverlayCount(frame, 0, 8_000);
    await expectOverlayVisible(frame, 'Running: npm run late-resume', 10_000);
    const [newAgentId] = await readAgentOverlayIds(frame);
    expect(newAgentId).toBeDefined();
    expect(newAgentId).not.toBe(oldAgentId);
  });

  test('B5 three parallel Task subagents in one turn', async ({ pixelAgents }) => {
    const { frame, window, tmpHome, mockLogFile } = pixelAgents;

    await setSettings(frame, {
      watchAllSessions: false,
      hooksEnabled: true,
      alwaysShowLabels: true,
      debugView: false,
    });

    await waitForClaudeHookSetup(tmpHome);
    await arrangeNextClaudeInvocation(
      tmpHome,
      claudeScenario('B5 three parallel Task subagents in one turn hooks on')
        .at(300)
        .emitHook(
          sessionStartStartup('{{sessionId}}', '{{cwd}}', '{{transcriptPath}}') as Record<
            string,
            unknown
          >,
        )
        .at(2_500)
        .appendJsonl(
          buildAssistantToolUseBatchRecord([
            {
              toolId: `${PARALLEL_PARENT_TOOL_ID}-1`,
              toolName: 'Task',
              input: { description: 'Parallel task 1' },
            },
            {
              toolId: `${PARALLEL_PARENT_TOOL_ID}-2`,
              toolName: 'Task',
              input: { description: 'Parallel task 2' },
            },
            {
              toolId: `${PARALLEL_PARENT_TOOL_ID}-3`,
              toolName: 'Task',
              input: { description: 'Parallel task 3' },
            },
          ]),
        )
        .at(9_000)
        .appendJsonl(
          buildUserToolResultBatchRecord([
            { toolUseId: `${PARALLEL_PARENT_TOOL_ID}-1` },
            { toolUseId: `${PARALLEL_PARENT_TOOL_ID}-2` },
            { toolUseId: `${PARALLEL_PARENT_TOOL_ID}-3` },
          ]),
        )
        .at(10_200)
        .appendJsonl(buildTurnDurationRecord())
        .holdOpenFor(13_000)
        .build(),
    );

    await spawnInternalAgentAndWait(frame, tmpHome, mockLogFile);
    await openPixelAgentsPanel(window);
    const panelFrame = await getPixelAgentsFrame(window);

    await expectOverlayVisible(panelFrame, 'Subtask: Parallel task 3');
    await expectOverlayVisible(panelFrame, 'Parallel task 1');
    await expectOverlayVisible(panelFrame, 'Parallel task 2');
    await expectOverlayVisible(panelFrame, 'Parallel task 3');
    await expectOverlayCount(panelFrame, 4, 10_000);
    expect(await readAgentOverlayIds(panelFrame)).toHaveLength(4);

    await expectOverlayCount(panelFrame, 1, 16_000);
  });

  test('B6 inline teammate removed from config', async ({ pixelAgents }) => {
    const { frame, window, tmpHome, mockLogFile } = pixelAgents;
    const teamName = uniqueTeamName('b6-inline-hooks-on');
    const configPath = seedTeamConfig(tmpHome, teamName, ['lead', INLINE_TEAMMATE_ROLE]);

    await setSettings(frame, {
      watchAllSessions: false,
      hooksEnabled: true,
      alwaysShowLabels: true,
      debugView: false,
    });

    await waitForClaudeHookSetup(tmpHome);
    await arrangeNextClaudeInvocation(
      tmpHome,
      withInlineTeammateSession(claudeScenario('B6 inline teammate removed from config hooks on'))
        .at(300)
        .emitHook(
          sessionStartStartup('{{sessionId}}', '{{cwd}}', '{{transcriptPath}}') as Record<
            string,
            unknown
          >,
        )
        .at(500)
        .appendJsonl(buildTeamMetadataRecord(teamName))
        .at(1_500)
        .appendJsonl(buildTeamMetadataRecord(teamName, INLINE_TEAMMATE_ROLE), {
          session: INLINE_TEAMMATE_ALIAS,
        })
        .at(2_500)
        .appendJsonl(
          buildAssistantToolUseRecord('toolu-b6-teammate-search', 'WebSearch', {
            query: 'pixel agents lifecycle regressions',
          }),
          { session: INLINE_TEAMMATE_ALIAS },
        )
        .at(8_000)
        .writeJson(configPath, buildTeamConfig(['lead']))
        .holdOpenFor(14_000)
        .build(),
    );

    await spawnInternalAgentAndWait(frame, tmpHome, mockLogFile);
    await openPixelAgentsPanel(window);
    const panelFrame = await getPixelAgentsFrame(window);

    await expectOverlayVisibleWithTexts(panelFrame, [INLINE_TEAMMATE_ROLE], 10_000);
    await expectOverlayVisible(panelFrame, 'Searching the web');
    await expectOverlayCount(panelFrame, 2, 10_000);

    await expectOverlayCount(panelFrame, 1, 12_000);
    await expectNoOverlayWithTexts(panelFrame, [INLINE_TEAMMATE_ROLE], 2_000);

    // Stability check: after cascade removal, the teammate must not reappear
    // (zombie cleanup race). Polling alone cannot test this; we have to wait.
    await panelFrame.waitForTimeout(8_000);
    await expectOverlayCount(panelFrame, 1);
    await expectNoOverlayWithTexts(panelFrame, [INLINE_TEAMMATE_ROLE], 2_000);
  });

  test('B7 lead SessionEnd cascades removal to active inline teammates', async ({
    pixelAgents,
  }) => {
    const { frame, tmpHome, workspaceDir, mockLogFile } = pixelAgents;
    const teamName = uniqueTeamName('b7-inline-hooks-on');

    await setSettings(frame, {
      watchAllSessions: true,
      hooksEnabled: true,
      alwaysShowLabels: true,
      debugView: false,
    });

    seedTeamConfig(tmpHome, teamName, ['lead', INLINE_TEAMMATE_ROLE, SECOND_TEAMMATE_ROLE]);
    await waitForClaudeHookSetup(tmpHome);
    await spawnExternalClaudeScenario({
      tmpHome,
      workspaceDir,
      mockLogFile,
      sessionId: 'b7-hooks-on-lead',
      scenario: withInlineTeammateSessions(claudeScenario('B7 lead SessionEnd cascade hooks on'), [
        { alias: INLINE_TEAMMATE_ALIAS, role: INLINE_TEAMMATE_ROLE },
        { alias: SECOND_TEAMMATE_ALIAS, role: SECOND_TEAMMATE_ROLE },
      ])
        .at(200)
        .emitHook(
          sessionStartStartup('b7-hooks-on-lead', '{{cwd}}', '{{transcriptPath}}') as Record<
            string,
            unknown
          >,
        )
        .at(900)
        .emitHook(
          preToolUseAgent('b7-hooks-on-lead', 'Delegate teammates') as Record<string, unknown>,
        )
        .at(1_100)
        .appendJsonl(buildTeamMetadataRecord(teamName))
        .at(1_300)
        .appendJsonl(buildTeamMetadataRecord(teamName, INLINE_TEAMMATE_ROLE), {
          session: INLINE_TEAMMATE_ALIAS,
        })
        .at(1_300)
        .appendJsonl(buildTeamMetadataRecord(teamName, SECOND_TEAMMATE_ROLE), {
          session: SECOND_TEAMMATE_ALIAS,
        })
        .at(1_500)
        .emitHook(
          subagentStart('b7-hooks-on-lead', INLINE_TEAMMATE_ROLE) as Record<string, unknown>,
        )
        .at(2_200)
        .appendJsonl(
          buildAssistantToolUseRecord('toolu-b7-search', 'WebSearch', {
            query: 'pixel agents cascade removal',
          }),
          { session: INLINE_TEAMMATE_ALIAS },
        )
        .at(2_400)
        .appendJsonl(
          buildAssistantToolUseRecord('toolu-b7-review', 'Bash', {
            command: 'npm run review',
          }),
          { session: SECOND_TEAMMATE_ALIAS },
        )
        .at(5_000)
        .emitHook(sessionEndExit('b7-hooks-on-lead') as Record<string, unknown>)
        .holdOpenFor(8_000)
        .build(),
    });

    await expectOverlayCount(frame, 3, 12_000);
    await expectOverlayVisibleWithTexts(frame, [INLINE_TEAMMATE_ROLE]);
    await expectOverlayVisibleWithTexts(frame, [SECOND_TEAMMATE_ROLE]);

    await expectOverlayCount(frame, 0, 8_000);
  });

  test('B8 external basic subagent with run_in_background true but no teamName', async ({
    pixelAgents,
  }) => {
    const { frame, tmpHome, workspaceDir, mockLogFile } = pixelAgents;

    await setSettings(frame, {
      watchAllSessions: true,
      hooksEnabled: true,
      alwaysShowLabels: true,
      debugView: false,
    });

    await waitForClaudeHookSetup(tmpHome);
    await spawnExternalClaudeScenario({
      tmpHome,
      workspaceDir,
      mockLogFile,
      sessionId: 'b8-hooks-on-basic',
      scenario: claudeScenario('B8 external basic subagent no teamName hooks on')
        .at(200)
        .emitHook(
          sessionStartStartup('b8-hooks-on-basic', '{{cwd}}', '{{transcriptPath}}') as Record<
            string,
            unknown
          >,
        )
        .at(900)
        .emitHook(
          preToolUseAgent('b8-hooks-on-basic', 'Background basic subtask') as Record<
            string,
            unknown
          >,
        )
        .at(1_100)
        .appendJsonl(
          buildAssistantToolUseRecord('toolu-b8-agent', 'Agent', {
            description: 'Background basic subtask',
            run_in_background: true,
          }),
        )
        .at(1_500)
        .emitHook(subagentStart('b8-hooks-on-basic', 'general-purpose') as Record<string, unknown>)
        .at(4_500)
        .appendJsonl(buildUserToolResultRecord('toolu-b8-agent'))
        .at(4_900)
        .appendJsonl(buildTurnDurationRecord())
        .holdOpenFor(7_000)
        .build(),
    });

    await expectOverlayVisible(frame, 'Subtask: Background basic subtask');
    await expectOverlayCount(frame, 1, 10_000);
    await expectNoOverlay(frame, 'general-purpose', 2_000);
    // Stability check: a misrouted SubagentStart could spawn a teammate-style
    // overlay seconds later (the lead has no teamName, so this is the regression).
    await frame.waitForTimeout(5_000);
    await expectOverlayCount(frame, 1);
  });

  test('B9 permission prompt routes to teammate, not lead', async ({ pixelAgents }) => {
    const { frame, tmpHome, workspaceDir, mockLogFile } = pixelAgents;
    const teamName = uniqueTeamName('b9-inline-hooks-on');

    await setSettings(frame, {
      watchAllSessions: true,
      hooksEnabled: true,
      alwaysShowLabels: true,
      debugView: false,
    });

    seedTeamConfig(tmpHome, teamName, ['lead', INLINE_TEAMMATE_ROLE]);
    await waitForClaudeHookSetup(tmpHome);
    await spawnExternalClaudeScenario({
      tmpHome,
      workspaceDir,
      mockLogFile,
      sessionId: 'b9-hooks-on-lead',
      scenario: withInlineTeammateSession(claudeScenario('B9 teammate permission routing hooks on'))
        .at(200)
        .emitHook(
          sessionStartStartup('b9-hooks-on-lead', '{{cwd}}', '{{transcriptPath}}') as Record<
            string,
            unknown
          >,
        )
        .at(900)
        .emitHook(
          preToolUseAgent('b9-hooks-on-lead', 'Delegate teammate work') as Record<string, unknown>,
        )
        .at(1_100)
        .appendJsonl(buildTeamMetadataRecord(teamName))
        .at(1_300)
        .appendJsonl(buildTeamMetadataRecord(teamName, INLINE_TEAMMATE_ROLE), {
          session: INLINE_TEAMMATE_ALIAS,
        })
        .at(1_500)
        .emitHook(
          subagentStart('b9-hooks-on-lead', INLINE_TEAMMATE_ROLE) as Record<string, unknown>,
        )
        .at(2_200)
        .appendJsonl(
          buildAssistantToolUseRecord('toolu-b9-search', 'WebSearch', {
            query: 'permission routing',
          }),
          { session: INLINE_TEAMMATE_ALIAS },
        )
        .at(3_500)
        .emitHook(notificationPermissionPrompt('b9-hooks-on-lead') as Record<string, unknown>)
        .at(5_200)
        .emitHook(
          taskCompleted('b9-hooks-on-lead', INLINE_TEAMMATE_ROLE) as Record<string, unknown>,
        )
        .holdOpenFor(8_000)
        .build(),
    });

    await expectOverlayVisibleWithTexts(frame, [INLINE_TEAMMATE_ROLE], 12_000);
    await expectOverlayVisibleWithTexts(frame, [INLINE_TEAMMATE_ROLE, 'Needs approval'], 8_000);
    await expectNoOverlayWithTexts(frame, ['LEAD', 'Needs approval']);
    await expectNoOverlayWithTexts(frame, [INLINE_TEAMMATE_ROLE, 'Needs approval'], 8_000);
  });

  test('B10 TeammateIdle targets the specific teammate only', async ({ pixelAgents }) => {
    const { frame, tmpHome, workspaceDir, mockLogFile } = pixelAgents;
    const teamName = uniqueTeamName('b10-inline-hooks-on');

    await setSettings(frame, {
      watchAllSessions: true,
      hooksEnabled: true,
      alwaysShowLabels: true,
      debugView: false,
    });

    seedTeamConfig(tmpHome, teamName, ['lead', INLINE_TEAMMATE_ROLE, SECOND_TEAMMATE_ROLE]);
    await waitForClaudeHookSetup(tmpHome);
    await spawnExternalClaudeScenario({
      tmpHome,
      workspaceDir,
      mockLogFile,
      sessionId: 'b10-hooks-on-lead',
      scenario: withInlineTeammateSessions(claudeScenario('B10 targeted teammate idle hooks on'), [
        { alias: INLINE_TEAMMATE_ALIAS, role: INLINE_TEAMMATE_ROLE },
        { alias: SECOND_TEAMMATE_ALIAS, role: SECOND_TEAMMATE_ROLE },
      ])
        .at(200)
        .emitHook(
          sessionStartStartup('b10-hooks-on-lead', '{{cwd}}', '{{transcriptPath}}') as Record<
            string,
            unknown
          >,
        )
        .at(900)
        .emitHook(
          preToolUseAgent('b10-hooks-on-lead', 'Delegate teammates') as Record<string, unknown>,
        )
        .at(1_100)
        .appendJsonl(buildTeamMetadataRecord(teamName))
        .at(1_300)
        .appendJsonl(buildTeamMetadataRecord(teamName, INLINE_TEAMMATE_ROLE), {
          session: INLINE_TEAMMATE_ALIAS,
        })
        .at(1_300)
        .appendJsonl(buildTeamMetadataRecord(teamName, SECOND_TEAMMATE_ROLE), {
          session: SECOND_TEAMMATE_ALIAS,
        })
        .at(1_500)
        .emitHook(
          subagentStart('b10-hooks-on-lead', INLINE_TEAMMATE_ROLE) as Record<string, unknown>,
        )
        .at(2_200)
        .appendJsonl(
          buildAssistantToolUseRecord('toolu-b10-search', 'WebSearch', {
            query: 'specific teammate idle',
          }),
          { session: INLINE_TEAMMATE_ALIAS },
        )
        .at(2_400)
        .appendJsonl(
          buildAssistantToolUseRecord('toolu-b10-review', 'Bash', {
            command: 'npm run reviewer',
          }),
          { session: SECOND_TEAMMATE_ALIAS },
        )
        .at(4_000)
        .emitHook(
          teammateIdle('b10-hooks-on-lead', INLINE_TEAMMATE_ROLE) as Record<string, unknown>,
        )
        .holdOpenFor(8_000)
        .build(),
    });

    await expectOverlayCount(frame, 3, 12_000);
    await expectOverlayVisibleWithTexts(
      frame,
      [INLINE_TEAMMATE_ROLE, 'Might be waiting for input'],
      8_000,
    );
    await expectOverlayVisibleWithTexts(frame, [SECOND_TEAMMATE_ROLE, 'Running: npm run reviewer']);
    await expectNoOverlayWithTexts(frame, [SECOND_TEAMMATE_ROLE, 'Might be waiting for input']);
    await expectNoOverlayWithTexts(frame, ['LEAD', 'Might be waiting for input']);
  });

  test('B11 rapid clear then new tool in under 500 ms', async ({ pixelAgents }) => {
    const { frame, window, tmpHome, mockLogFile } = pixelAgents;

    await setSettings(frame, {
      watchAllSessions: false,
      hooksEnabled: true,
      alwaysShowLabels: true,
      debugView: false,
    });

    await waitForClaudeHookSetup(tmpHome);
    await arrangeNextClaudeInvocation(
      tmpHome,
      claudeScenario('B11 rapid clear then new tool in under 500 ms hooks on')
        .defineSession('replacement', '{{sessionId}}-clear-fast')
        .at(3_500)
        .emitHook(sessionEndClear('{{sessionId}}') as Record<string, unknown>)
        .at(3_600)
        .appendJsonl(mockClaudeInitRecord('mock-claude-clear-fast-ready'), {
          session: 'replacement',
        })
        .at(3_650)
        .emitHook(
          sessionStartClear(
            '{{sessions.replacement.sessionId}}',
            '{{cwd}}',
            '{{sessions.replacement.transcriptPath}}',
          ) as Record<string, unknown>,
        )
        .at(3_775)
        .emitHook(
          preToolUseBash('{{sessions.replacement.sessionId}}', 'npm run fresh') as Record<
            string,
            unknown
          >,
        )
        .at(3_925)
        .emitHook(preToolUseBash('{{sessionId}}', 'npm run ghost') as Record<string, unknown>)
        .holdOpenFor(7_000)
        .build(),
    );

    await spawnInternalAgentAndWait(frame, tmpHome, mockLogFile);
    await openPixelAgentsPanel(window);
    const panelFrame = await getPixelAgentsFrame(window);
    const originalAgentId = await expectSingleAgentOverlay(panelFrame);

    await expectOverlayVisible(panelFrame, 'Running: npm run fresh');
    await expectOverlayCount(panelFrame, 1);
    expect(await readAgentOverlayIds(panelFrame)).toEqual([originalAgentId]);

    await panelFrame.waitForTimeout(750);
    await expectNoOverlay(panelFrame, 'Running: npm run ghost');
    expect(await readAgentOverlayIds(panelFrame)).toEqual([originalAgentId]);
  });

  test('B12 close via X prevents old JSONL re-adoption during cooldown', async ({
    pixelAgents,
  }) => {
    const { frame, tmpHome, workspaceDir, mockLogFile } = pixelAgents;

    await setSettings(frame, {
      watchAllSessions: true,
      hooksEnabled: true,
      alwaysShowLabels: true,
      debugView: false,
    });

    await waitForClaudeHookSetup(tmpHome);
    await spawnExternalClaudeScenario({
      tmpHome,
      workspaceDir,
      mockLogFile,
      sessionId: 'b12-hooks-on-old',
      scenario: claudeScenario('B12 dismissal cooldown hooks on old session')
        .at(200)
        .emitHook(
          sessionStartStartup('b12-hooks-on-old', '{{cwd}}', '{{transcriptPath}}') as Record<
            string,
            unknown
          >,
        )
        .at(900)
        .emitHook(preToolUseBash('b12-hooks-on-old', 'npm run old-live') as Record<string, unknown>)
        .at(7_000)
        .appendJsonl(
          buildAssistantToolUseRecord('toolu-b12-old-stale', 'Bash', {
            command: 'npm run old-stale',
          }),
        )
        .holdOpenFor(12_000)
        .build(),
    });

    await expectOverlayVisible(frame, 'Running: npm run old-live');
    const oldAgentId = await expectSingleAgentOverlay(frame);
    await closeAgentFromOverlay(frame, { agentId: oldAgentId });
    await expectOverlayCount(frame, 0, 8_000);

    await spawnExternalClaudeScenario({
      tmpHome,
      workspaceDir,
      mockLogFile,
      sessionId: 'b12-hooks-on-new',
      scenario: claudeScenario('B12 dismissal cooldown hooks on new session')
        .at(200)
        .emitHook(
          sessionStartStartup('b12-hooks-on-new', '{{cwd}}', '{{transcriptPath}}') as Record<
            string,
            unknown
          >,
        )
        .at(900)
        .emitHook(preToolUseBash('b12-hooks-on-new', 'npm run reopened') as Record<string, unknown>)
        .holdOpenFor(8_000)
        .build(),
    });

    await expectOverlayVisible(frame, 'Running: npm run reopened', 10_000);
    await expectOverlayCount(frame, 1);
    const [newAgentId] = await readAgentOverlayIds(frame);
    expect(newAgentId).not.toBe(oldAgentId);

    // Stability check: the closed JSONL must NOT be re-adopted during the 3-min
    // cooldown. 4s is enough to cover several scanner ticks.
    await frame.waitForTimeout(4_000);
    await expectNoOverlay(frame, 'Running: npm run old-stale', 2_000);
    await expectOverlayCount(frame, 1);
  });

  // C8: verify playDoneSound() fires on agentStatus: 'waiting'.
  // The webview's notificationSound.ts records every invocation into
  // window.__pixelAgentsSoundsPlayed (a test-only marker that runs BEFORE the
  // soundEnabled gate). We trigger waiting state by sending an idle_prompt
  // notification hook (the same path A7 uses to surface "Might be waiting for
  // input") and assert the sound was dispatched.
  test('C8 sound chime fires on agentStatus waiting', async ({ pixelAgents }) => {
    const { frame, tmpHome, workspaceDir, mockLogFile } = pixelAgents;

    await setSettings(frame, {
      watchAllSessions: true,
      hooksEnabled: true,
      alwaysShowLabels: true,
      debugView: false,
    });

    await waitForClaudeHookSetup(tmpHome);
    const serverConfig = await waitForHookServer(tmpHome);
    const sessionId = 'c8-sound-chime-session';

    await spawnExternalClaudeScenario({
      tmpHome,
      workspaceDir,
      mockLogFile,
      scenario: claudeScenario('C8 sound chime smoke').holdOpenFor(3_000).build(),
      sessionId,
    });

    const projectDir = getClaudeProjectDir(tmpHome, workspaceDir);
    const transcriptPath = path.join(projectDir, `${sessionId}.jsonl`);

    // SessionStart registers the session with the hook server so that the next
    // event (PreToolUseBash) drives the agent visible rather than landing in the
    // pre-registration buffer (same pattern as A7).
    await sendHookEvent(serverConfig, sessionStartStartup(sessionId, workspaceDir, transcriptPath));

    // Drive the agent active first (so the waiting transition is a real state
    // change rather than a no-op on a never-active agent).
    await sendHookEvent(serverConfig, preToolUseBash(sessionId, 'npm test'));
    await expectOverlayCount(frame, 1);
    await expectOverlayVisible(frame, 'Running: npm test');

    // Reset the marker AFTER active-state dispatch so we only capture sounds
    // triggered by the idle_prompt under test.
    await frame.evaluate(() => {
      const w = window as Window & {
        __pixelAgentsTestHooks?: { playedSounds?: unknown[] };
      };
      if (w.__pixelAgentsTestHooks) w.__pixelAgentsTestHooks.playedSounds = [];
    });

    await sendHookEvent(serverConfig, idlePrompt(sessionId));
    await expectOverlayVisible(frame, 'Might be waiting for input');

    await expect
      .poll(
        async () =>
          frame.evaluate(() => {
            const w = window as Window & {
              __pixelAgentsTestHooks?: { playedSounds?: Array<{ kind: string }> };
            };
            return (w.__pixelAgentsTestHooks?.playedSounds ?? []).map((s) => s.kind);
          }),
        { timeout: 5_000 },
      )
      .toContain('done');
  });

  // C9: verify restored agents skip the matrix-rain spawn animation.
  //
  // Invariant: useExtensionMessages.ts:153 passes skipSpawnEffect=true when
  // creating characters from the existingAgents payload. If someone drops
  // that arg, restored agents would briefly show matrixEffect='spawn' for
  // ~300ms (the matrix rain animation), regressing the "instant restore" UX.
  //
  // Trigger: close the bottom panel, then reopen it. closeBottomPanel hides
  // the WebviewView; PixelAgentsViewProvider does not set
  // retainContextWhenHidden so VS Code disposes the webview. Reopening via
  // openPixelAgentsPanel re-runs resolveWebviewView, bootstraps a fresh
  // React app, sends webviewReady, and the extension's view provider
  // unconditionally calls sendExistingAgents on every webviewReady
  // (PixelAgentsViewProvider.ts:479).
  //
  // window.location.reload() does NOT work here: vscode-webview:// iframes
  // can't survive a content-level reload (the security token / CSP / API
  // binding break) — the panel renders broken text instead of the canvas.
  //
  // Observable: window.__pixelAgentsTestHooks.getCharacters() (exposed from
  // App.tsx) returns a snapshot of character.matrixEffect. Sample for 400ms
  // starting at first character observation post-restore. A broken impl
  // (skipSpawnEffect=false) would show 'spawn' in at least one early sample
  // because the matrix effect lives ~300ms before transitioning to null.
  test('C9 restored agents skip spawn effect (no matrix animation)', async ({ pixelAgents }) => {
    const { window, tmpHome, mockLogFile } = pixelAgents;
    let frame = pixelAgents.frame;

    await setSettings(frame, {
      watchAllSessions: false,
      hooksEnabled: true,
      alwaysShowLabels: true,
      debugView: false,
    });

    await waitForClaudeHookSetup(tmpHome);
    await arrangeNextClaudeInvocation(
      tmpHome,
      claudeScenario('C9 restored agents skip spawn effect').holdOpenFor(20_000).build(),
    );
    await spawnInternalAgentAndWait(frame, tmpHome, mockLogFile);

    await openPixelAgentsPanel(window);
    frame = await getPixelAgentsFrame(window);
    await expectOverlayCount(frame, 1);

    // Let the original spawn animation finish so we don't confuse it with
    // the post-restore observation (matrix effect lives ~300ms; 800ms cushion).
    await frame.waitForTimeout(800);

    await closeBottomPanel(window);
    await openPixelAgentsPanel(window);
    frame = await getPixelAgentsFrame(window);

    // The fresh webview has an empty addAgentLog. Wait until restoreAgents has
    // run (existingAgents → layoutLoaded → addAgent), then read the log. The
    // log captures matrixEffect AT addAgent time (synchronous inside the
    // wrapper), so it's immune to the ~300ms matrix-effect lifetime race that
    // would let a regression slip past a snapshot-based observable.
    await expect
      .poll(
        async () =>
          frame.evaluate(() => {
            const w = window as Window & {
              __pixelAgentsTestHooks?: { addAgentLog?: unknown[] };
            };
            return w.__pixelAgentsTestHooks?.addAgentLog?.length ?? 0;
          }),
        { timeout: 15_000 },
      )
      .toBeGreaterThan(0);

    const log = await frame.evaluate(() => {
      const w = window as Window & {
        __pixelAgentsTestHooks?: {
          addAgentLog?: Array<{
            id: number;
            skipSpawnEffect: boolean | undefined;
            matrixEffectAtCreation: string | null;
          }>;
        };
      };
      return w.__pixelAgentsTestHooks?.addAgentLog ?? [];
    });

    // Every addAgent call in this fresh webview comes from the restore path
    // (there's no agentCreated message between webview boot and our read).
    // Each must have skipSpawnEffect=true and matrixEffect=null at creation.
    expect(log.length).toBeGreaterThan(0);
    for (const entry of log) {
      expect(entry.skipSpawnEffect).toBe(true);
      expect(entry.matrixEffectAtCreation).toBeNull();
    }
  });
});
