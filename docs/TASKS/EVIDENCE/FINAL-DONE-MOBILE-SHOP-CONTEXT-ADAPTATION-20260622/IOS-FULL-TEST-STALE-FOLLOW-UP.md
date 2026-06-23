# iOS Full Test Stale Follow-up

Date: 2026-06-22

Status: FOLLOW-UP NON CORE

Source run:

- Command: XcodeBuildMCP full `test_sim -quiet`
- Result: NOT_GREEN, 891 passed, 18 failed, 32 skipped
- Log: `/Users/minxiang/Library/Developer/XcodeBuildMCP/workspaces/merchandise-control-admin-web-894074effa53/logs/test_sim_2026-06-22T23-52-35-481Z_pid21071_de4672e5.log`
- Result bundle: `/Users/minxiang/Library/Developer/XcodeBuildMCP/workspaces/merchandise-control-admin-web-894074effa53/result-bundles/test_sim_2026-06-22T23-52-35-481Z_pid21071_01d183c2.xcresult`

## Classification

| # | Test | Classification | Required follow-up |
| --- | --- | --- | --- |
| 1 | `SupabaseManualSyncReleaseUITests/testTask067DebugOutboxCardRemainsDebugOnlyAndSeparateFromReleaseCard` | Stale source-scanner marker | Update source extraction away from `private struct SupabaseManualSyncReleaseCard`. |
| 2 | `SupabaseManualSyncReleaseUITests/testTask067ManualSyncReleaseSourcesAvoidForbiddenScope` | Stale source-scanner marker | Same release-card source helper update. |
| 3 | `SupabaseManualSyncReleaseUITests/testTask067ReleaseCardSourceAvoidsDeveloperJargon` | Stale source-scanner marker | Same release-card source helper update. |
| 4 | `SupabaseManualSyncReleaseUITests/testTask069ReadOnlyReleaseSourcesAvoidForbiddenLiveCalls` | Stale source-scanner marker | Same release-card source helper update. |
| 5 | `SupabaseManualSyncReleaseUITests/testTask072ReleaseCardDeclaresProminentActionStylesForCardAndSheet` | Stale source-scanner marker | Same release-card source helper update. |
| 6 | `SupabaseManualSyncReleaseUITests/testTask072ReleaseCardRendersPresentationStateOnly` | Stale source-scanner marker | Same release-card source helper update. |
| 7 | `SupabaseManualSyncReleaseUITests/testTask074ReleaseCardRendersPreparedSummaryOnly` | Stale source-scanner marker | Same release-card source helper update. |
| 8 | `SupabaseManualSyncReleaseUITests/testTask074SummaryIsNotPersistedByReleaseSurface` | Stale source-scanner marker | Same release-card source helper update. |
| 9 | `SupabaseManualSyncReleaseUITests/testTask077ReleaseCardRendersReviewSheetFromPreparedPresentationOnly` | Stale source-scanner marker | Same release-card source helper update. |
| 10 | `SupabaseManualSyncReleaseUITests/testTask081ActivityRegistrationDrainIsAdapterOwned` | Stale source-scanner marker | Same release-card source helper update. |
| 11 | `SupabaseManualSyncReleaseUITests/testTask092RootForegroundHostUsesPresenterSharedViewModelAndBusyGating` | Stale source-scanner marker | Update `SupabaseManualSyncForegroundRootHost` marker to current root host boundary. |
| 12 | `SupabaseManualSyncReleaseUITests/testTask092RootForegroundSourcesAvoidForbiddenAutomationScope` | Stale source-scanner marker | Same root host helper update. |
| 13 | `SupabaseManualSyncReleaseUITests/testTask092WorkflowBusyGatingIsDeclaredOnInteractiveSurfaces` | Stale TASK-092 busy marker | Re-evaluate marker contract against current foreground workflow surfaces. |
| 14 | `SupabaseManualSyncReleaseUITests/testTask109ReleaseCardUsesConfirmationDialogsOnlyForMutations` | Stale source-scanner marker | Same release-card source helper update. |
| 15 | `SupabaseManualSyncReleaseUITests/testTask110OptionsCheckCloudRunsHistorySyncPath` | Stale Options implementation string scan | Replace fragile string expectations with behavior/domain test. |
| 16 | `SupabaseProductPriceManualPushServiceTests/testSourceContainsNoUpsertRetryOrScopeExtras` | Stale file path | Update scanner from root `SupabaseProductPriceManualPushService.swift` to `Sync/Manual/SupabaseProductPriceManualPushService.swift`. |
| 17 | `SupabaseProductPricePreviewServiceTests/testPreviewSourceHasNoSyncEventOrProductPriceWritePath` | Stale transport source boundary | Update scan to current adapter split under `Sync/Remote/`. |
| 18 | `Task089LargeDatasetBenchmarkTests/testLG1PreviewMediumSyntheticReadMostlyBenchmark` | Stale benchmark expectation | Decide whether cap preview should remain 1000/2 pages or benchmark should be restored to 5000/11. |

## DONE core impact

None. The Mobile Shop Context closure is covered by passing targeted iOS tests:

- `ShopContextTests`
- `LocalPendingChangeAccumulatorTests`
- `SyncEventRecordingTests`
- `HistorySessionSyncServiceTests`
- `WatermarkStoreTests`
- `Task118AutomaticDomainTests`

These pass 103/103 in the final closure run.
