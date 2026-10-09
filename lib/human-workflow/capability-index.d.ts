/** A discoverable inventory, not a workflow runner or an authorization grant.
 * Keep unavailable platform primitives visible without inventing executable tools. */
import type { CapabilityManifest } from './capabilities.js';
export declare const CAPABILITY_CATEGORIES: readonly ["groups", "members", "messages", "collection", "files", "presentation", "facts", "feedback", "automation", "workspace"];
export type CapabilityCategory = typeof CAPABILITY_CATEGORIES[number];
export declare function capabilityCatalog(manifest: CapabilityManifest, category?: unknown, detail?: unknown): {
    contracts?: {
        readonly schema: "human.capability.contracts.v1";
        readonly statusMeaning: "node-implementation-only";
        readonly sourceSurface: {
            readonly maxUtf8Bytes: number;
            readonly limitOrigin: "product";
            readonly includes: "title-body-form-cover-actions-and-metadata";
            readonly onExcess: "revise-explicitly-no-truncation";
        };
        readonly taskProposal: {
            readonly maxUtf8Bytes: number;
            readonly limitOrigin: "product";
        };
        readonly platformReadiness: {
            readonly status: "unknown";
            readonly evaluated: "per-user-operation";
            readonly checks: readonly ["native-context-and-version", "app-platform-permission", "original-group-and-user", "current-node-binding", "exact-content-authorization"];
        };
        readonly modeTemplate: {
            readonly schemaVersion: 1;
            readonly fields: 12;
            readonly choices: {
                readonly min: 2;
                readonly max: 12;
            };
            readonly purpose: "reusable-work-method";
            readonly personalData: "per-work-instance-not-template";
        };
        readonly memberForm: {
            readonly schema: "human.form.v1";
            readonly schemas: readonly ["human.form.v1", "human.form.v2", "human.form.v3"];
            readonly schemaMeaning: "schema and legacy top-level kinds/mediaTypes describe v1 compatibility, not the maximum current capability; choose bySchema for the requested data";
            readonly tools: readonly ["human_task_create", "human_task_prepare_round", "human_task_prepare_review"];
            readonly paths: {
                readonly initial: "initialRound.form";
                readonly additional: "content.form";
                readonly correction: "content.correction.form";
                readonly presentation: "inside the chosen form at form.presentation, never beside form";
            };
            readonly bySchema: {
                readonly 'human.form.v1': {
                    readonly attachmentKinds: readonly ["image"];
                    readonly mediaTypes: readonly ["image/jpeg", "image/png"];
                    readonly presentation: false;
                };
                readonly 'human.form.v2': {
                    readonly attachmentKinds: readonly ["image"];
                    readonly mediaTypes: readonly ["image/jpeg", "image/png"];
                    readonly presentation: true;
                };
                readonly 'human.form.v3': {
                    readonly inherits: "human.form.v2";
                    readonly attachmentKinds: readonly ["image", "file"];
                    readonly imageMediaTypes: readonly ["image/jpeg", "image/png"];
                    readonly fileMediaTypes: readonly ["image/jpeg", "image/png", "application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.openxmlformats-officedocument.presentationml.presentation", "text/plain", "text/csv"];
                    readonly presentation: true;
                    readonly word: "DOCX (.docx), not legacy DOC (.doc) or macro-enabled documents";
                    readonly maxFiles: 1;
                    readonly maxBytes: number;
                };
            };
            readonly validation: {
                readonly issueSchema: "human.form.issue.v1";
                readonly fields: readonly ["path", "code", "message", "expected?", "correctPath?"];
                readonly repair: "repair the exact parameter without dropping user requirements; schema validation does not test receiver readiness";
                readonly receiverFailure: "receiver-file-unavailable or receiver_format_unsupported, never inferred from a form validation error";
            };
            readonly maxUtf8Bytes: number;
            readonly limitOrigin: "product";
            readonly fields: 12;
            readonly choices: {
                readonly min: 1;
                readonly max: 20;
            };
            readonly kinds: readonly ["short-text", "long-text", "choice", "boolean", "number"];
            readonly number: "safe-integer";
            readonly conditions: readonly ["present", "eq", "all", "any", "not"];
            readonly v2: {
                readonly additionalKinds: readonly ["multi-choice", "date", "time"];
                readonly fieldHelp: {
                    readonly descriptionCharacters: 300;
                    readonly sectionCharacters: 80;
                };
                readonly multiChoice: {
                    readonly bounds: readonly ["minSelected", "maxSelected"];
                    readonly unique: true;
                    readonly order: "declared-choices";
                    readonly condition: "contains";
                    readonly emptyIsPresent: false;
                };
                readonly date: {
                    readonly format: "YYYY-MM-DD";
                    readonly calendarValidated: true;
                    readonly optionalBounds: readonly ["start", "end"];
                    readonly timezoneConversion: false;
                };
                readonly time: {
                    readonly format: "HH:mm";
                    readonly optionalBounds: readonly ["start", "end"];
                    readonly implicitDefault: false;
                };
                readonly oldSchemaAcceptsExtensions: false;
            };
            readonly attachment: {
                readonly modes: readonly ["none", "optional", "required"];
                readonly maxFiles: 1;
                readonly maxBytes: number;
                readonly mediaTypes: readonly ["image/jpeg", "image/png"];
                readonly v3: {
                    readonly kind: "file";
                    readonly mediaTypes: readonly ["image/jpeg", "image/png", "application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.openxmlformats-officedocument.presentationml.presentation", "text/plain", "text/csv"];
                    readonly selection: "nonempty-task-specific-subset";
                    readonly manifest: "human.submission.manifest.v2";
                    readonly tool: "human_submission_file";
                    readonly requires: "server-and-current-node-receiveFormats-confirmed";
                    readonly oldNode: "reject-never-silently-drop-attachment";
                    readonly displayName: "encrypted-metadata-never-a-storage-path";
                    readonly validation: "bounded-format-check-not-antivirus";
                    readonly execution: false;
                    readonly documentAutomaticAnalysis: false;
                    readonly legacyOfficeBinaryFormats: false;
                    readonly status: "accepted-after-server-confirmation-received-after-durable-node-save";
                };
            };
            readonly answers: {
                readonly maxUtf8Bytes: 12000;
                readonly limitOrigin: "product";
                readonly includes: "normalized-field-values-only-not-images";
            };
            readonly executableCode: false;
        };
        readonly audience: {
            readonly initial: readonly ["all-group", "owner-select", "known-members"];
            readonly selectionTool: "human_task_create";
            readonly selectionParameter: "initialRound.audience";
            readonly selectionRequires: "owner-native-selection-after-room-binding";
            readonly selectionRequiresAppliesTo: "owner-select";
            readonly composition: {
                readonly default: "all-group";
                readonly choice: "agent-selects-from-current-user-intent";
                readonly sourceSurfaceId: "optional-same-session-group-source";
                readonly workspaceSourceId: "mutually-exclusive-verified-workspace-source";
                readonly knownIdentityDoesNotForceKnownMembers: true;
                readonly ownerReselectionAllowed: true;
                readonly taskOrRound: "independent-choice-by-user-intent-not-by-known-identities";
                readonly mandatoryQuestionnaire: false;
            };
            readonly maxSelectedMembers: 20;
            readonly limitOrigin: "product";
            readonly binds: "whole-task";
            readonly laterRounds: "may-narrow-not-expand";
            readonly membersAre: "group-scoped-native-identities-not-real-names";
            readonly rosterEnumeration: false;
            readonly knownMembers: {
                readonly capability: "task.audience-known";
                readonly source: "same-session-successful-sourceSurfaceId-or-verified-workspaceSourceId";
                readonly parameter: "initialRound.sourceParticipantRefs";
                readonly references: "1..20-distinct-observed-source-task-participantRefs";
                readonly genericParameter: "initialRound.sourceRecipientRefs";
                readonly genericReferences: "1..20-exact-source-task-human.recipient.ref.v1";
                readonly parametersMutuallyExclusive: true;
                readonly genericQuery: "human_task_recipients";
                readonly genericSources: readonly ["observed", "selection", "audience"];
                readonly beforeMemberFirstOpen: true;
                readonly staleSelectionRevision: "reject-never-replace";
                readonly duplicatesAcrossAliases: "reject";
                readonly resolution: "server-verifies-source-task-original-group-and-native-member-mapping";
                readonly taskEffect: "new-independent-task";
                readonly recipientRefs: null;
                readonly nativeGroupAndMemberRepicking: false;
                readonly selectorPreselection: false;
                readonly ownerNativeSendConfirmation: true;
                readonly rosterEnumeration: false;
                readonly groupIdProvidesRoster: false;
                readonly automaticMention: false;
                readonly visibility: {
                    readonly taskPage: "owner-and-resolved-recipients";
                    readonly submissionsAndFeedback: "owner-and-self";
                    readonly sharedTitleAndCover: "visible-in-group-not-recipient-private";
                    readonly privateEvaluationInSharedCard: false;
                };
                readonly nativeParticipantMeaning: "audience-not-mention";
                readonly nativeSystemNotice: "platform-behavior-not-guaranteed";
                readonly invalidMapping: "reject-never-widen-or-guess";
                readonly names: "self-reported-match-unambiguously-or-ask";
            };
            readonly outcomes: readonly ["success", "cancelled", "failed", "unknown"];
            readonly cancelledSelectionPublishes: false;
        };
        readonly recipientFacts: {
            readonly tool: "human_task_recipients";
            readonly schema: "human.recipient.facts.v1";
            readonly reference: "human.recipient.ref.v1";
            readonly sources: readonly ["observed", "selection", "audience"];
            readonly association: "server-verified-same-group-member-identity";
            readonly nativeIdsExported: false;
            readonly namesExported: false;
            readonly observed: "recorded-encounter-not-read-receipt";
            readonly confirmed: "participation-not-submission";
            readonly roundId: "null-for-identity-only-or-exact-round-for-submission-facts";
            readonly submission: readonly ["acceptedCount", "latestSubmissionId", "acceptedAt", "receivedAt"];
            readonly acceptedVersionsSurviveAttachmentExpiry: true;
            readonly knownSetIsCompleteGroupRoster: false;
            readonly selectionBeforeFirstOpenCreatesParticipant: false;
            readonly ownerExcluded: true;
            readonly identityMeaning: "wechat-member-within-original-group-not-business-role";
            readonly platformFields: {
                readonly opengid: "group";
                readonly group_openid: "wechat-member-in-that-group";
            };
            readonly identity: {
                readonly schema: "human.member.identity.v1";
                readonly fields: readonly ["groupRef", "memberRef"];
                readonly purpose: "persist-and-correlate-known-identities-not-an-action-argument";
                readonly notInterchangeableWith: readonly ["recipientRef", "selectionRef.memberRefs", "participantRef", "native-group_openid"];
                readonly namespace: "app-owner-account-original-group";
                readonly stableAcross: readonly ["tasks", "rounds", "selection-revisions", "node-restarts-with-same-keys"];
                readonly rotatesWith: readonly ["namespace-or-identity-key-change", "group-or-native-member-identity-change"];
                readonly unlimitedPlatformLifetimeGuaranteed: false;
                readonly businessRole: false;
                readonly authorization: false;
            };
            readonly acquisition: readonly ["verified-current-entrant", "native-selected-members", "published-known-audience"];
            readonly nativeIdentityHandling: "verified-native-group-and-member-identities-held-by-service-agent-uses-scoped-references";
            readonly hiddenRawIdsMeanUnavailable: false;
            readonly selectedMembersRequireFirstOpen: false;
            readonly zeroObservedParticipantsMeansNoSelectedIdentities: false;
            readonly persistence: "store-provenance-bound-references-revalidate-at-use-not-permanent-membership";
            readonly crossGroupReuse: false;
            readonly fullRosterExport: false;
            readonly realtimeMembershipSync: false;
            readonly pageSize: 20;
            readonly pagination: "offset-with-unchanged-snapshot-restart-on-change";
            readonly use: "agent-chooses-recipients-from-user-intent-and-evidence-not-a-fixed-pending-filter";
        };
        readonly workspaceDirectory: {
            readonly capability: "workspace.directory";
            readonly tools: readonly ["human_workspace_directory", "human_workspace_sync", "human_workspace_note"];
            readonly namespace: "verified-node-binding-and-real-native-workspace";
            readonly modelSuppliedWorkspacePath: false;
            readonly source: "sourceSurfaceId-or-workspaceSourceId-mutually-exclusive";
            readonly update: "expectedRevision-CAS-reload-on-conflict";
            readonly facts: "source-task-snapshot-and-asOf";
            readonly notes: "agent-authored-business-record-not-verified-identity";
            readonly noteFields: readonly ["displayName", "aliases", "notes"];
            readonly groupNote: "memberRef=null";
            readonly removeNote: "value=null";
            readonly nativeIdsExported: false;
            readonly completeGroupRoster: false;
            readonly cachedReadIsAuthorization: false;
            readonly sourceUse: "recheck-both-native-sessions-workspace-binding-and-server-source";
            readonly doesNotShare: readonly ["private-instance-memory", "private-feedback", "execution-permission"];
            readonly backgroundRosterScan: false;
            readonly realtimeMembershipSync: false;
        };
        readonly reshare: {
            readonly capability: "task.reshare";
            readonly tool: "human_task_reshare";
            readonly source: "sourceSurfaceId-or-workspaceSourceId";
            readonly roundId: "null-original-entry-or-published-public-round";
            readonly retains: readonly ["task", "content", "audience", "cover", "submissions"];
            readonly creates: "new-share-attempt-and-native-activity-not-new-task";
            readonly ownerNativeTap: true;
            readonly automaticMention: false;
            readonly unknownResult: "reconcile-no-automatic-replay";
            readonly privateRoundShare: false;
        };
        readonly workflowPreview: {
            readonly choices: readonly ["inline", "page", "none"];
            readonly default: "inline";
            readonly kinds: readonly ["round", "review", "reminder"];
            readonly inline: "full-authoritative-versioned-content-and-target";
            readonly changedDraft: "reject-and-repreview";
            readonly fallback: "page-for-unrepresentable-full-preview-or-cover-or-budget";
            readonly truncatedApproval: false;
            readonly conversationTextIsApproval: false;
            readonly none: "draft-only-with-exact-draftRef-no-surface-private-review-or-nonempty-targeted-round-only";
            readonly privatePublication: {
                readonly capability: "task.private-publish";
                readonly tool: "human_task_publish_private";
                readonly parameters: readonly ["taskRef", "draftRef"];
                readonly readiness: {
                    readonly tool: "human_private_update_status";
                    readonly states: readonly ["ready", "unavailable", "no-current-input"];
                    readonly meaning: "current-host-input-proof-not-user-intent-or-fresh-cloud-permission";
                    readonly cloudPermission: "revalidated-at-publication";
                    readonly unavailableProofMeansDisabled: false;
                };
                readonly kinds: readonly ["review-with-optional-correction", "round-with-nonempty-recipientRefs"];
                readonly intent: "agent-understands-current-real-user-request-no-fixed-phrase-or-required-extra-turn";
                readonly evidence: "host-derived-current-user-input-not-model-approved-flag";
                readonly permission: "owner-enabled-revocable-session-until-disabled-with-legacy-fixed-expiry";
                readonly executionLifetime: "current-native-user-turn-only-with-automatic-runtime-lease-no-extra-confirmation";
                readonly scope: "original-node-session-generation-and-task-only-no-workspace-write-sharing";
                readonly exclusions: readonly ["public-round", "share", "reminder", "background-automation"];
                readonly nonInstructions: readonly ["attachments", "quoted-text", "tool-output"];
                readonly draftOnly: readonly ["questions", "preview-request", "negation", "unclear-intent-or-recipient"];
                readonly fallback: "existing-owner-button-when-runtime-or-permission-unavailable";
                readonly unknownResult: "durable-no-replay-query-the-original-draft";
                readonly agentNext: "query-human_task_lifecycle-before-reporting-updated-or-preparing-requested-reminder";
            };
            readonly outcome: "published-content-not-automatic-message";
        };
        readonly reminders: {
            readonly tool: "human_task_prepare_reminder";
            readonly nativeEffect: "separate-at-mentions-and-task-link";
            readonly independentOwnerClick: true;
            readonly automaticAfterShare: false;
            readonly shareParameter: false;
            readonly composition: readonly ["share-only", "remind-existing-task-only", "share-then-separate-reminder"];
            readonly singleGestureCombination: {
                readonly status: "unverified";
                readonly toolExposed: false;
                readonly documentedJointParameter: false;
                readonly nativeExtraNotice: "device-behavior-unverified";
            };
            readonly sources: readonly ["exact-references", "participantRefs", "task-audience", "selected-members"];
            readonly mutuallyExclusive: true;
            readonly exactReferences: {
                readonly parameter: "content.recipientRefs";
                readonly source: "human_task_recipients";
                readonly recipientSource: "exact-references";
                readonly condition: "none";
                readonly nativeTypes: readonly ["complete", "participate"];
                readonly roundId: "exact-round-or-null-for-original-entry";
                readonly arbitraryAuthorizedSubsets: true;
                readonly automaticBusinessFilter: false;
                readonly noSilentSubstitutionOrDeduplication: true;
                readonly selectionScope: "all-current-selected-members-or-explicit-subset-from-current-facts";
                readonly requiresFirstOpen: false;
                readonly excludesConfirmedOrSubmitted: false;
                readonly checks: readonly ["task-and-original-group", "current-source-revision", "binding-and-authorization", "audience-and-private-round-visibility"];
                readonly namesPreview: "native-open-data-list-in-original-group-no-js-export";
                readonly maximum: 20;
                readonly limitOrigin: "product";
            };
            readonly predicates: {
                readonly optional: true;
                readonly purpose: "execution-time-fact-filter-not-mandatory-business-flow";
            };
            readonly legacyParticipation: {
                readonly tool: "human_task_remind";
                readonly compatibilityOnly: true;
                readonly condition: "unconfirmed-participation";
                readonly use: "only-when-user-requests-this-filter";
                readonly notEquivalentTo: readonly ["all-selected-members", "all-group-members", "pending-submission"];
                readonly genericReplacement: "human_task_prepare_reminder:exact-references:condition=none";
            };
            readonly preview: {
                readonly choices: readonly ["inline", "page"];
                readonly default: "inline";
                readonly inline: "immutable-reminder-intent-in-conversation";
                readonly page: "optional-separate-preview";
                readonly fallback: "old-or-missing-verified-inline-intent-uses-preview-page";
                readonly finalNativeTap: "required-in-verified-original-group";
                readonly backgroundAutoApproveOrSend: false;
            };
            readonly selectedMembers: {
                readonly parameter: "content.recipientSource";
                readonly value: "selected-members";
                readonly reference: "content.selectionRef";
                readonly selection: "complete-current-task-native-selection";
                readonly changedRevision: "reject";
                readonly arbitrarySubsets: false;
                readonly conditions: readonly ["pending-submission"];
                readonly beforeMemberFirstOpen: true;
                readonly rosterEnumeration: false;
                readonly createsParticipantRecords: false;
                readonly excludes: "accepted_at-submissions-and-owner";
                readonly maximum: 20;
            };
            readonly taskAudience: {
                readonly parameter: "content.recipientSource";
                readonly value: "task-audience";
                readonly conditions: readonly ["pending-submission"];
                readonly tasks: readonly ["owner-select", "known-members"];
                readonly round: "public-recipientRefs-null";
                readonly beforeMemberFirstOpen: true;
                readonly scope: "immutable-task-selected-audience-minus-submitted-and-owner";
                readonly eligibility: "rechecked-at-execution";
                readonly previewCount: "informational-not-authorization";
                readonly maxRecipients: 20;
                readonly createsParticipantRecords: false;
                readonly rosterEnumeration: false;
            };
            readonly sentEvidence: "drafts[].effects.notificationState";
            readonly nativeSuccessIsReadReceipt: false;
        };
        readonly processing: {
            readonly triggers: readonly ["manual", "per-submission", "all-recipients"];
            readonly allRecipients: "freeze-explicit-submission-versions-then-process-individually";
            readonly output: readonly ["feedback-draft"];
            readonly publication: readonly ["owner-per-result"];
            readonly automaticPublication: {
                readonly status: "planned";
                readonly reason: "Requires a separately owner-approved, revocable publication policy; processing permission is not publication permission.";
            };
        };
        readonly presentation: {
            readonly messageCard: {
                readonly customizable: readonly ["title", "cover"];
                readonly cover: {
                    readonly schema: "human.card.asset.v1";
                    readonly optional: true;
                    readonly aspectRatio: "5:4";
                    readonly mediaTypes: readonly ["image/png", "image/jpeg"];
                    readonly maxBytes: number;
                    readonly maxDimension: 2048;
                    readonly prepareTool: "human_card_cover_prepare";
                    readonly sources: readonly ["current-session-attachment", "explicit-relative-workspace-reference"];
                    readonly default: "bundled-fixed";
                    readonly source: "node-prepared-immutable-image";
                    readonly preparation: "validate-and-normalize-existing-image";
                    readonly artworkCreation: "agent-uses-actually-available-computer-tools";
                    readonly imageGeneration: false;
                    readonly bundledFonts: false;
                    readonly templateRendering: false;
                    readonly tools: readonly ["human_surface_share", "human_task_create", "human_task_prepare_round"];
                    readonly roundScope: "public-recipientRefs-null-only";
                    readonly approval: "exact-image-sha256-in-source-or-draft-digest";
                    readonly privateCorrection: false;
                    readonly arbitraryUrls: false;
                };
                readonly layout: "wechat-native-template";
                readonly sourceBody: "in-app-description-not-a-wechat-share-parameter";
            };
            readonly taskPage: {
                readonly schema: "human.form.v2";
                readonly schemas: readonly ["human.form.v1", "human.form.v2", "human.form.v3"];
                readonly customizable: readonly ["field-labels", "field-types", "field-conditions", "instructions", "sections", "descriptions", "theme", "icon", "layout", "submitLabel", "completionText", "blocks"];
                readonly themes: readonly ["blue", "green", "purple", "orange", "slate"];
                readonly icons: readonly ["clipboard", "book", "calendar", "briefcase", "checklist"];
                readonly layouts: readonly ["stacked", "compact"];
                readonly blocks: {
                    readonly kinds: readonly ["paragraph", "list", "notice"];
                    readonly max: 8;
                    readonly noticeTones: readonly ["info", "warning", "success"];
                };
                readonly authority: "presentation-only";
                readonly permissionOrStateChanges: false;
            };
            readonly memberState: "participated-not-analyzed";
            readonly canResetParticipatedState: false;
            readonly arbitraryHtmlOrScripts: false;
        };
        readonly examples: readonly [{
            readonly need: "收集可参与的项目分工与日期时间";
            readonly tool: "human_task_create";
            readonly formSchema: "human.form.v2";
            readonly kinds: readonly ["multi-choice", "date", "time"];
            readonly presentation: readonly ["section", "description", "notice"];
        }, {
            readonly need: "登记课程或活动选项并按选择追问";
            readonly tool: "human_task_create";
            readonly formSchema: "human.form.v2";
            readonly kinds: readonly ["multi-choice", "short-text"];
            readonly conditions: readonly ["contains"];
            readonly attachment: "optional";
        }, {
            readonly need: "单纯阅读并确认";
            readonly tool: "human_surface_share";
            readonly requiresForm: false;
        }, {
            readonly need: "另给已登记YYB布置新作业";
            readonly tool: "human_task_create";
            readonly audience: "known-members";
            readonly prerequisite: "从准确来源任务和成功发卡回执取得sourceSurfaceId；查真实提交将姓名唯一对应sourceParticipantRefs，重名或缺失先询问";
            readonly result: "原群新独立任务，不追加旧任务；仍由主人确认发送，不自动@";
        }];
        readonly workflow: {
            readonly fixedBusinessSequence: false;
            readonly modePackageRequiredForSingleTask: false;
            readonly presetActivationIsTaskAuthorization: false;
            readonly sameWorkspaceIsTaskAuthorization: false;
            readonly unknownSideEffect: "reconcile-before-any-new-operation";
            readonly ordinaryShareFallback: false;
        };
    } | {
        audience: {
            readonly initial: readonly ["all-group", "owner-select", "known-members"];
            readonly selectionTool: "human_task_create";
            readonly selectionParameter: "initialRound.audience";
            readonly selectionRequires: "owner-native-selection-after-room-binding";
            readonly selectionRequiresAppliesTo: "owner-select";
            readonly composition: {
                readonly default: "all-group";
                readonly choice: "agent-selects-from-current-user-intent";
                readonly sourceSurfaceId: "optional-same-session-group-source";
                readonly workspaceSourceId: "mutually-exclusive-verified-workspace-source";
                readonly knownIdentityDoesNotForceKnownMembers: true;
                readonly ownerReselectionAllowed: true;
                readonly taskOrRound: "independent-choice-by-user-intent-not-by-known-identities";
                readonly mandatoryQuestionnaire: false;
            };
            readonly maxSelectedMembers: 20;
            readonly limitOrigin: "product";
            readonly binds: "whole-task";
            readonly laterRounds: "may-narrow-not-expand";
            readonly membersAre: "group-scoped-native-identities-not-real-names";
            readonly rosterEnumeration: false;
            readonly knownMembers: {
                readonly capability: "task.audience-known";
                readonly source: "same-session-successful-sourceSurfaceId-or-verified-workspaceSourceId";
                readonly parameter: "initialRound.sourceParticipantRefs";
                readonly references: "1..20-distinct-observed-source-task-participantRefs";
                readonly genericParameter: "initialRound.sourceRecipientRefs";
                readonly genericReferences: "1..20-exact-source-task-human.recipient.ref.v1";
                readonly parametersMutuallyExclusive: true;
                readonly genericQuery: "human_task_recipients";
                readonly genericSources: readonly ["observed", "selection", "audience"];
                readonly beforeMemberFirstOpen: true;
                readonly staleSelectionRevision: "reject-never-replace";
                readonly duplicatesAcrossAliases: "reject";
                readonly resolution: "server-verifies-source-task-original-group-and-native-member-mapping";
                readonly taskEffect: "new-independent-task";
                readonly recipientRefs: null;
                readonly nativeGroupAndMemberRepicking: false;
                readonly selectorPreselection: false;
                readonly ownerNativeSendConfirmation: true;
                readonly rosterEnumeration: false;
                readonly groupIdProvidesRoster: false;
                readonly automaticMention: false;
                readonly visibility: {
                    readonly taskPage: "owner-and-resolved-recipients";
                    readonly submissionsAndFeedback: "owner-and-self";
                    readonly sharedTitleAndCover: "visible-in-group-not-recipient-private";
                    readonly privateEvaluationInSharedCard: false;
                };
                readonly nativeParticipantMeaning: "audience-not-mention";
                readonly nativeSystemNotice: "platform-behavior-not-guaranteed";
                readonly invalidMapping: "reject-never-widen-or-guess";
                readonly names: "self-reported-match-unambiguously-or-ask";
            };
            readonly outcomes: readonly ["success", "cancelled", "failed", "unknown"];
            readonly cancelledSelectionPublishes: false;
        };
        recipientFacts: {
            readonly tool: "human_task_recipients";
            readonly schema: "human.recipient.facts.v1";
            readonly reference: "human.recipient.ref.v1";
            readonly sources: readonly ["observed", "selection", "audience"];
            readonly association: "server-verified-same-group-member-identity";
            readonly nativeIdsExported: false;
            readonly namesExported: false;
            readonly observed: "recorded-encounter-not-read-receipt";
            readonly confirmed: "participation-not-submission";
            readonly roundId: "null-for-identity-only-or-exact-round-for-submission-facts";
            readonly submission: readonly ["acceptedCount", "latestSubmissionId", "acceptedAt", "receivedAt"];
            readonly acceptedVersionsSurviveAttachmentExpiry: true;
            readonly knownSetIsCompleteGroupRoster: false;
            readonly selectionBeforeFirstOpenCreatesParticipant: false;
            readonly ownerExcluded: true;
            readonly identityMeaning: "wechat-member-within-original-group-not-business-role";
            readonly platformFields: {
                readonly opengid: "group";
                readonly group_openid: "wechat-member-in-that-group";
            };
            readonly identity: {
                readonly schema: "human.member.identity.v1";
                readonly fields: readonly ["groupRef", "memberRef"];
                readonly purpose: "persist-and-correlate-known-identities-not-an-action-argument";
                readonly notInterchangeableWith: readonly ["recipientRef", "selectionRef.memberRefs", "participantRef", "native-group_openid"];
                readonly namespace: "app-owner-account-original-group";
                readonly stableAcross: readonly ["tasks", "rounds", "selection-revisions", "node-restarts-with-same-keys"];
                readonly rotatesWith: readonly ["namespace-or-identity-key-change", "group-or-native-member-identity-change"];
                readonly unlimitedPlatformLifetimeGuaranteed: false;
                readonly businessRole: false;
                readonly authorization: false;
            };
            readonly acquisition: readonly ["verified-current-entrant", "native-selected-members", "published-known-audience"];
            readonly nativeIdentityHandling: "verified-native-group-and-member-identities-held-by-service-agent-uses-scoped-references";
            readonly hiddenRawIdsMeanUnavailable: false;
            readonly selectedMembersRequireFirstOpen: false;
            readonly zeroObservedParticipantsMeansNoSelectedIdentities: false;
            readonly persistence: "store-provenance-bound-references-revalidate-at-use-not-permanent-membership";
            readonly crossGroupReuse: false;
            readonly fullRosterExport: false;
            readonly realtimeMembershipSync: false;
            readonly pageSize: 20;
            readonly pagination: "offset-with-unchanged-snapshot-restart-on-change";
            readonly use: "agent-chooses-recipients-from-user-intent-and-evidence-not-a-fixed-pending-filter";
        };
        workspaceDirectory: {
            readonly capability: "workspace.directory";
            readonly tools: readonly ["human_workspace_directory", "human_workspace_sync", "human_workspace_note"];
            readonly namespace: "verified-node-binding-and-real-native-workspace";
            readonly modelSuppliedWorkspacePath: false;
            readonly source: "sourceSurfaceId-or-workspaceSourceId-mutually-exclusive";
            readonly update: "expectedRevision-CAS-reload-on-conflict";
            readonly facts: "source-task-snapshot-and-asOf";
            readonly notes: "agent-authored-business-record-not-verified-identity";
            readonly noteFields: readonly ["displayName", "aliases", "notes"];
            readonly groupNote: "memberRef=null";
            readonly removeNote: "value=null";
            readonly nativeIdsExported: false;
            readonly completeGroupRoster: false;
            readonly cachedReadIsAuthorization: false;
            readonly sourceUse: "recheck-both-native-sessions-workspace-binding-and-server-source";
            readonly doesNotShare: readonly ["private-instance-memory", "private-feedback", "execution-permission"];
            readonly backgroundRosterScan: false;
            readonly realtimeMembershipSync: false;
        };
        platformReadiness: {
            readonly status: "unknown";
            readonly evaluated: "per-user-operation";
            readonly checks: readonly ["native-context-and-version", "app-platform-permission", "original-group-and-user", "current-node-binding", "exact-content-authorization"];
        };
        workflow: {
            readonly fixedBusinessSequence: false;
            readonly modePackageRequiredForSingleTask: false;
            readonly presetActivationIsTaskAuthorization: false;
            readonly sameWorkspaceIsTaskAuthorization: false;
            readonly unknownSideEffect: "reconcile-before-any-new-operation";
            readonly ordinaryShareFallback: false;
        };
    } | {
        reminders: {
            readonly tool: "human_task_prepare_reminder";
            readonly nativeEffect: "separate-at-mentions-and-task-link";
            readonly independentOwnerClick: true;
            readonly automaticAfterShare: false;
            readonly shareParameter: false;
            readonly composition: readonly ["share-only", "remind-existing-task-only", "share-then-separate-reminder"];
            readonly singleGestureCombination: {
                readonly status: "unverified";
                readonly toolExposed: false;
                readonly documentedJointParameter: false;
                readonly nativeExtraNotice: "device-behavior-unverified";
            };
            readonly sources: readonly ["exact-references", "participantRefs", "task-audience", "selected-members"];
            readonly mutuallyExclusive: true;
            readonly exactReferences: {
                readonly parameter: "content.recipientRefs";
                readonly source: "human_task_recipients";
                readonly recipientSource: "exact-references";
                readonly condition: "none";
                readonly nativeTypes: readonly ["complete", "participate"];
                readonly roundId: "exact-round-or-null-for-original-entry";
                readonly arbitraryAuthorizedSubsets: true;
                readonly automaticBusinessFilter: false;
                readonly noSilentSubstitutionOrDeduplication: true;
                readonly selectionScope: "all-current-selected-members-or-explicit-subset-from-current-facts";
                readonly requiresFirstOpen: false;
                readonly excludesConfirmedOrSubmitted: false;
                readonly checks: readonly ["task-and-original-group", "current-source-revision", "binding-and-authorization", "audience-and-private-round-visibility"];
                readonly namesPreview: "native-open-data-list-in-original-group-no-js-export";
                readonly maximum: 20;
                readonly limitOrigin: "product";
            };
            readonly predicates: {
                readonly optional: true;
                readonly purpose: "execution-time-fact-filter-not-mandatory-business-flow";
            };
            readonly legacyParticipation: {
                readonly tool: "human_task_remind";
                readonly compatibilityOnly: true;
                readonly condition: "unconfirmed-participation";
                readonly use: "only-when-user-requests-this-filter";
                readonly notEquivalentTo: readonly ["all-selected-members", "all-group-members", "pending-submission"];
                readonly genericReplacement: "human_task_prepare_reminder:exact-references:condition=none";
            };
            readonly preview: {
                readonly choices: readonly ["inline", "page"];
                readonly default: "inline";
                readonly inline: "immutable-reminder-intent-in-conversation";
                readonly page: "optional-separate-preview";
                readonly fallback: "old-or-missing-verified-inline-intent-uses-preview-page";
                readonly finalNativeTap: "required-in-verified-original-group";
                readonly backgroundAutoApproveOrSend: false;
            };
            readonly selectedMembers: {
                readonly parameter: "content.recipientSource";
                readonly value: "selected-members";
                readonly reference: "content.selectionRef";
                readonly selection: "complete-current-task-native-selection";
                readonly changedRevision: "reject";
                readonly arbitrarySubsets: false;
                readonly conditions: readonly ["pending-submission"];
                readonly beforeMemberFirstOpen: true;
                readonly rosterEnumeration: false;
                readonly createsParticipantRecords: false;
                readonly excludes: "accepted_at-submissions-and-owner";
                readonly maximum: 20;
            };
            readonly taskAudience: {
                readonly parameter: "content.recipientSource";
                readonly value: "task-audience";
                readonly conditions: readonly ["pending-submission"];
                readonly tasks: readonly ["owner-select", "known-members"];
                readonly round: "public-recipientRefs-null";
                readonly beforeMemberFirstOpen: true;
                readonly scope: "immutable-task-selected-audience-minus-submitted-and-owner";
                readonly eligibility: "rechecked-at-execution";
                readonly previewCount: "informational-not-authorization";
                readonly maxRecipients: 20;
                readonly createsParticipantRecords: false;
                readonly rosterEnumeration: false;
            };
            readonly sentEvidence: "drafts[].effects.notificationState";
            readonly nativeSuccessIsReadReceipt: false;
        };
        reshare: {
            readonly capability: "task.reshare";
            readonly tool: "human_task_reshare";
            readonly source: "sourceSurfaceId-or-workspaceSourceId";
            readonly roundId: "null-original-entry-or-published-public-round";
            readonly retains: readonly ["task", "content", "audience", "cover", "submissions"];
            readonly creates: "new-share-attempt-and-native-activity-not-new-task";
            readonly ownerNativeTap: true;
            readonly automaticMention: false;
            readonly unknownResult: "reconcile-no-automatic-replay";
            readonly privateRoundShare: false;
        };
        messageCard: {
            readonly customizable: readonly ["title", "cover"];
            readonly cover: {
                readonly schema: "human.card.asset.v1";
                readonly optional: true;
                readonly aspectRatio: "5:4";
                readonly mediaTypes: readonly ["image/png", "image/jpeg"];
                readonly maxBytes: number;
                readonly maxDimension: 2048;
                readonly prepareTool: "human_card_cover_prepare";
                readonly sources: readonly ["current-session-attachment", "explicit-relative-workspace-reference"];
                readonly default: "bundled-fixed";
                readonly source: "node-prepared-immutable-image";
                readonly preparation: "validate-and-normalize-existing-image";
                readonly artworkCreation: "agent-uses-actually-available-computer-tools";
                readonly imageGeneration: false;
                readonly bundledFonts: false;
                readonly templateRendering: false;
                readonly tools: readonly ["human_surface_share", "human_task_create", "human_task_prepare_round"];
                readonly roundScope: "public-recipientRefs-null-only";
                readonly approval: "exact-image-sha256-in-source-or-draft-digest";
                readonly privateCorrection: false;
                readonly arbitraryUrls: false;
            };
            readonly layout: "wechat-native-template";
            readonly sourceBody: "in-app-description-not-a-wechat-share-parameter";
        };
        platformReadiness: {
            readonly status: "unknown";
            readonly evaluated: "per-user-operation";
            readonly checks: readonly ["native-context-and-version", "app-platform-permission", "original-group-and-user", "current-node-binding", "exact-content-authorization"];
        };
        workflow: {
            readonly fixedBusinessSequence: false;
            readonly modePackageRequiredForSingleTask: false;
            readonly presetActivationIsTaskAuthorization: false;
            readonly sameWorkspaceIsTaskAuthorization: false;
            readonly unknownSideEffect: "reconcile-before-any-new-operation";
            readonly ordinaryShareFallback: false;
        };
    } | {
        memberForm: {
            readonly schema: "human.form.v1";
            readonly schemas: readonly ["human.form.v1", "human.form.v2", "human.form.v3"];
            readonly schemaMeaning: "schema and legacy top-level kinds/mediaTypes describe v1 compatibility, not the maximum current capability; choose bySchema for the requested data";
            readonly tools: readonly ["human_task_create", "human_task_prepare_round", "human_task_prepare_review"];
            readonly paths: {
                readonly initial: "initialRound.form";
                readonly additional: "content.form";
                readonly correction: "content.correction.form";
                readonly presentation: "inside the chosen form at form.presentation, never beside form";
            };
            readonly bySchema: {
                readonly 'human.form.v1': {
                    readonly attachmentKinds: readonly ["image"];
                    readonly mediaTypes: readonly ["image/jpeg", "image/png"];
                    readonly presentation: false;
                };
                readonly 'human.form.v2': {
                    readonly attachmentKinds: readonly ["image"];
                    readonly mediaTypes: readonly ["image/jpeg", "image/png"];
                    readonly presentation: true;
                };
                readonly 'human.form.v3': {
                    readonly inherits: "human.form.v2";
                    readonly attachmentKinds: readonly ["image", "file"];
                    readonly imageMediaTypes: readonly ["image/jpeg", "image/png"];
                    readonly fileMediaTypes: readonly ["image/jpeg", "image/png", "application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.openxmlformats-officedocument.presentationml.presentation", "text/plain", "text/csv"];
                    readonly presentation: true;
                    readonly word: "DOCX (.docx), not legacy DOC (.doc) or macro-enabled documents";
                    readonly maxFiles: 1;
                    readonly maxBytes: number;
                };
            };
            readonly validation: {
                readonly issueSchema: "human.form.issue.v1";
                readonly fields: readonly ["path", "code", "message", "expected?", "correctPath?"];
                readonly repair: "repair the exact parameter without dropping user requirements; schema validation does not test receiver readiness";
                readonly receiverFailure: "receiver-file-unavailable or receiver_format_unsupported, never inferred from a form validation error";
            };
            readonly maxUtf8Bytes: number;
            readonly limitOrigin: "product";
            readonly fields: 12;
            readonly choices: {
                readonly min: 1;
                readonly max: 20;
            };
            readonly kinds: readonly ["short-text", "long-text", "choice", "boolean", "number"];
            readonly number: "safe-integer";
            readonly conditions: readonly ["present", "eq", "all", "any", "not"];
            readonly v2: {
                readonly additionalKinds: readonly ["multi-choice", "date", "time"];
                readonly fieldHelp: {
                    readonly descriptionCharacters: 300;
                    readonly sectionCharacters: 80;
                };
                readonly multiChoice: {
                    readonly bounds: readonly ["minSelected", "maxSelected"];
                    readonly unique: true;
                    readonly order: "declared-choices";
                    readonly condition: "contains";
                    readonly emptyIsPresent: false;
                };
                readonly date: {
                    readonly format: "YYYY-MM-DD";
                    readonly calendarValidated: true;
                    readonly optionalBounds: readonly ["start", "end"];
                    readonly timezoneConversion: false;
                };
                readonly time: {
                    readonly format: "HH:mm";
                    readonly optionalBounds: readonly ["start", "end"];
                    readonly implicitDefault: false;
                };
                readonly oldSchemaAcceptsExtensions: false;
            };
            readonly attachment: {
                readonly modes: readonly ["none", "optional", "required"];
                readonly maxFiles: 1;
                readonly maxBytes: number;
                readonly mediaTypes: readonly ["image/jpeg", "image/png"];
                readonly v3: {
                    readonly kind: "file";
                    readonly mediaTypes: readonly ["image/jpeg", "image/png", "application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.openxmlformats-officedocument.presentationml.presentation", "text/plain", "text/csv"];
                    readonly selection: "nonempty-task-specific-subset";
                    readonly manifest: "human.submission.manifest.v2";
                    readonly tool: "human_submission_file";
                    readonly requires: "server-and-current-node-receiveFormats-confirmed";
                    readonly oldNode: "reject-never-silently-drop-attachment";
                    readonly displayName: "encrypted-metadata-never-a-storage-path";
                    readonly validation: "bounded-format-check-not-antivirus";
                    readonly execution: false;
                    readonly documentAutomaticAnalysis: false;
                    readonly legacyOfficeBinaryFormats: false;
                    readonly status: "accepted-after-server-confirmation-received-after-durable-node-save";
                };
            };
            readonly answers: {
                readonly maxUtf8Bytes: 12000;
                readonly limitOrigin: "product";
                readonly includes: "normalized-field-values-only-not-images";
            };
            readonly executableCode: false;
        };
        platformReadiness: {
            readonly status: "unknown";
            readonly evaluated: "per-user-operation";
            readonly checks: readonly ["native-context-and-version", "app-platform-permission", "original-group-and-user", "current-node-binding", "exact-content-authorization"];
        };
        workflow: {
            readonly fixedBusinessSequence: false;
            readonly modePackageRequiredForSingleTask: false;
            readonly presetActivationIsTaskAuthorization: false;
            readonly sameWorkspaceIsTaskAuthorization: false;
            readonly unknownSideEffect: "reconcile-before-any-new-operation";
            readonly ordinaryShareFallback: false;
        };
    } | {
        presentation: {
            readonly messageCard: {
                readonly customizable: readonly ["title", "cover"];
                readonly cover: {
                    readonly schema: "human.card.asset.v1";
                    readonly optional: true;
                    readonly aspectRatio: "5:4";
                    readonly mediaTypes: readonly ["image/png", "image/jpeg"];
                    readonly maxBytes: number;
                    readonly maxDimension: 2048;
                    readonly prepareTool: "human_card_cover_prepare";
                    readonly sources: readonly ["current-session-attachment", "explicit-relative-workspace-reference"];
                    readonly default: "bundled-fixed";
                    readonly source: "node-prepared-immutable-image";
                    readonly preparation: "validate-and-normalize-existing-image";
                    readonly artworkCreation: "agent-uses-actually-available-computer-tools";
                    readonly imageGeneration: false;
                    readonly bundledFonts: false;
                    readonly templateRendering: false;
                    readonly tools: readonly ["human_surface_share", "human_task_create", "human_task_prepare_round"];
                    readonly roundScope: "public-recipientRefs-null-only";
                    readonly approval: "exact-image-sha256-in-source-or-draft-digest";
                    readonly privateCorrection: false;
                    readonly arbitraryUrls: false;
                };
                readonly layout: "wechat-native-template";
                readonly sourceBody: "in-app-description-not-a-wechat-share-parameter";
            };
            readonly taskPage: {
                readonly schema: "human.form.v2";
                readonly schemas: readonly ["human.form.v1", "human.form.v2", "human.form.v3"];
                readonly customizable: readonly ["field-labels", "field-types", "field-conditions", "instructions", "sections", "descriptions", "theme", "icon", "layout", "submitLabel", "completionText", "blocks"];
                readonly themes: readonly ["blue", "green", "purple", "orange", "slate"];
                readonly icons: readonly ["clipboard", "book", "calendar", "briefcase", "checklist"];
                readonly layouts: readonly ["stacked", "compact"];
                readonly blocks: {
                    readonly kinds: readonly ["paragraph", "list", "notice"];
                    readonly max: 8;
                    readonly noticeTones: readonly ["info", "warning", "success"];
                };
                readonly authority: "presentation-only";
                readonly permissionOrStateChanges: false;
            };
            readonly memberState: "participated-not-analyzed";
            readonly canResetParticipatedState: false;
            readonly arbitraryHtmlOrScripts: false;
        };
        platformReadiness: {
            readonly status: "unknown";
            readonly evaluated: "per-user-operation";
            readonly checks: readonly ["native-context-and-version", "app-platform-permission", "original-group-and-user", "current-node-binding", "exact-content-authorization"];
        };
        workflow: {
            readonly fixedBusinessSequence: false;
            readonly modePackageRequiredForSingleTask: false;
            readonly presetActivationIsTaskAuthorization: false;
            readonly sameWorkspaceIsTaskAuthorization: false;
            readonly unknownSideEffect: "reconcile-before-any-new-operation";
            readonly ordinaryShareFallback: false;
        };
    } | {
        processing: {
            readonly triggers: readonly ["manual", "per-submission", "all-recipients"];
            readonly allRecipients: "freeze-explicit-submission-versions-then-process-individually";
            readonly output: readonly ["feedback-draft"];
            readonly publication: readonly ["owner-per-result"];
            readonly automaticPublication: {
                readonly status: "planned";
                readonly reason: "Requires a separately owner-approved, revocable publication policy; processing permission is not publication permission.";
            };
        };
        workflowPreview: {
            readonly choices: readonly ["inline", "page", "none"];
            readonly default: "inline";
            readonly kinds: readonly ["round", "review", "reminder"];
            readonly inline: "full-authoritative-versioned-content-and-target";
            readonly changedDraft: "reject-and-repreview";
            readonly fallback: "page-for-unrepresentable-full-preview-or-cover-or-budget";
            readonly truncatedApproval: false;
            readonly conversationTextIsApproval: false;
            readonly none: "draft-only-with-exact-draftRef-no-surface-private-review-or-nonempty-targeted-round-only";
            readonly privatePublication: {
                readonly capability: "task.private-publish";
                readonly tool: "human_task_publish_private";
                readonly parameters: readonly ["taskRef", "draftRef"];
                readonly readiness: {
                    readonly tool: "human_private_update_status";
                    readonly states: readonly ["ready", "unavailable", "no-current-input"];
                    readonly meaning: "current-host-input-proof-not-user-intent-or-fresh-cloud-permission";
                    readonly cloudPermission: "revalidated-at-publication";
                    readonly unavailableProofMeansDisabled: false;
                };
                readonly kinds: readonly ["review-with-optional-correction", "round-with-nonempty-recipientRefs"];
                readonly intent: "agent-understands-current-real-user-request-no-fixed-phrase-or-required-extra-turn";
                readonly evidence: "host-derived-current-user-input-not-model-approved-flag";
                readonly permission: "owner-enabled-revocable-session-until-disabled-with-legacy-fixed-expiry";
                readonly executionLifetime: "current-native-user-turn-only-with-automatic-runtime-lease-no-extra-confirmation";
                readonly scope: "original-node-session-generation-and-task-only-no-workspace-write-sharing";
                readonly exclusions: readonly ["public-round", "share", "reminder", "background-automation"];
                readonly nonInstructions: readonly ["attachments", "quoted-text", "tool-output"];
                readonly draftOnly: readonly ["questions", "preview-request", "negation", "unclear-intent-or-recipient"];
                readonly fallback: "existing-owner-button-when-runtime-or-permission-unavailable";
                readonly unknownResult: "durable-no-replay-query-the-original-draft";
                readonly agentNext: "query-human_task_lifecycle-before-reporting-updated-or-preparing-requested-reminder";
            };
            readonly outcome: "published-content-not-automatic-message";
        };
        platformReadiness: {
            readonly status: "unknown";
            readonly evaluated: "per-user-operation";
            readonly checks: readonly ["native-context-and-version", "app-platform-permission", "original-group-and-user", "current-node-binding", "exact-content-authorization"];
        };
        workflow: {
            readonly fixedBusinessSequence: false;
            readonly modePackageRequiredForSingleTask: false;
            readonly presetActivationIsTaskAuthorization: false;
            readonly sameWorkspaceIsTaskAuthorization: false;
            readonly unknownSideEffect: "reconcile-before-any-new-operation";
            readonly ordinaryShareFallback: false;
        };
    } | {
        modeTemplate: {
            readonly schemaVersion: 1;
            readonly fields: 12;
            readonly choices: {
                readonly min: 2;
                readonly max: 12;
            };
            readonly purpose: "reusable-work-method";
            readonly personalData: "per-work-instance-not-template";
        };
        workspaceDirectory: {
            readonly capability: "workspace.directory";
            readonly tools: readonly ["human_workspace_directory", "human_workspace_sync", "human_workspace_note"];
            readonly namespace: "verified-node-binding-and-real-native-workspace";
            readonly modelSuppliedWorkspacePath: false;
            readonly source: "sourceSurfaceId-or-workspaceSourceId-mutually-exclusive";
            readonly update: "expectedRevision-CAS-reload-on-conflict";
            readonly facts: "source-task-snapshot-and-asOf";
            readonly notes: "agent-authored-business-record-not-verified-identity";
            readonly noteFields: readonly ["displayName", "aliases", "notes"];
            readonly groupNote: "memberRef=null";
            readonly removeNote: "value=null";
            readonly nativeIdsExported: false;
            readonly completeGroupRoster: false;
            readonly cachedReadIsAuthorization: false;
            readonly sourceUse: "recheck-both-native-sessions-workspace-binding-and-server-source";
            readonly doesNotShare: readonly ["private-instance-memory", "private-feedback", "execution-permission"];
            readonly backgroundRosterScan: false;
            readonly realtimeMembershipSync: false;
        };
        platformReadiness: {
            readonly status: "unknown";
            readonly evaluated: "per-user-operation";
            readonly checks: readonly ["native-context-and-version", "app-platform-permission", "original-group-and-user", "current-node-binding", "exact-content-authorization"];
        };
        workflow: {
            readonly fixedBusinessSequence: false;
            readonly modePackageRequiredForSingleTask: false;
            readonly presetActivationIsTaskAuthorization: false;
            readonly sameWorkspaceIsTaskAuthorization: false;
            readonly unknownSideEffect: "reconcile-before-any-new-operation";
            readonly ordinaryShareFallback: false;
        };
    } | {
        recipientFacts: {
            readonly tool: "human_task_recipients";
            readonly schema: "human.recipient.facts.v1";
            readonly reference: "human.recipient.ref.v1";
            readonly sources: readonly ["observed", "selection", "audience"];
            readonly association: "server-verified-same-group-member-identity";
            readonly nativeIdsExported: false;
            readonly namesExported: false;
            readonly observed: "recorded-encounter-not-read-receipt";
            readonly confirmed: "participation-not-submission";
            readonly roundId: "null-for-identity-only-or-exact-round-for-submission-facts";
            readonly submission: readonly ["acceptedCount", "latestSubmissionId", "acceptedAt", "receivedAt"];
            readonly acceptedVersionsSurviveAttachmentExpiry: true;
            readonly knownSetIsCompleteGroupRoster: false;
            readonly selectionBeforeFirstOpenCreatesParticipant: false;
            readonly ownerExcluded: true;
            readonly identityMeaning: "wechat-member-within-original-group-not-business-role";
            readonly platformFields: {
                readonly opengid: "group";
                readonly group_openid: "wechat-member-in-that-group";
            };
            readonly identity: {
                readonly schema: "human.member.identity.v1";
                readonly fields: readonly ["groupRef", "memberRef"];
                readonly purpose: "persist-and-correlate-known-identities-not-an-action-argument";
                readonly notInterchangeableWith: readonly ["recipientRef", "selectionRef.memberRefs", "participantRef", "native-group_openid"];
                readonly namespace: "app-owner-account-original-group";
                readonly stableAcross: readonly ["tasks", "rounds", "selection-revisions", "node-restarts-with-same-keys"];
                readonly rotatesWith: readonly ["namespace-or-identity-key-change", "group-or-native-member-identity-change"];
                readonly unlimitedPlatformLifetimeGuaranteed: false;
                readonly businessRole: false;
                readonly authorization: false;
            };
            readonly acquisition: readonly ["verified-current-entrant", "native-selected-members", "published-known-audience"];
            readonly nativeIdentityHandling: "verified-native-group-and-member-identities-held-by-service-agent-uses-scoped-references";
            readonly hiddenRawIdsMeanUnavailable: false;
            readonly selectedMembersRequireFirstOpen: false;
            readonly zeroObservedParticipantsMeansNoSelectedIdentities: false;
            readonly persistence: "store-provenance-bound-references-revalidate-at-use-not-permanent-membership";
            readonly crossGroupReuse: false;
            readonly fullRosterExport: false;
            readonly realtimeMembershipSync: false;
            readonly pageSize: 20;
            readonly pagination: "offset-with-unchanged-snapshot-restart-on-change";
            readonly use: "agent-chooses-recipients-from-user-intent-and-evidence-not-a-fixed-pending-filter";
        };
        platformReadiness: {
            readonly status: "unknown";
            readonly evaluated: "per-user-operation";
            readonly checks: readonly ["native-context-and-version", "app-platform-permission", "original-group-and-user", "current-node-binding", "exact-content-authorization"];
        };
        workflow: {
            readonly fixedBusinessSequence: false;
            readonly modePackageRequiredForSingleTask: false;
            readonly presetActivationIsTaskAuthorization: false;
            readonly sameWorkspaceIsTaskAuthorization: false;
            readonly unknownSideEffect: "reconcile-before-any-new-operation";
            readonly ordinaryShareFallback: false;
        };
    } | undefined;
    schema: string;
    categories: ("messages" | "files" | "presentation" | "workspace" | "members" | "automation" | "groups" | "collection" | "facts" | "feedback")[];
    category: {} | null;
    statusMeaning: string;
    platformReadiness: string;
    reusableAcrossPresets: boolean;
    sharesOtherSessionAuthority: boolean;
    fixedWorkflow: boolean;
    entries: ({
        reason?: string | undefined;
        id: string;
        category: "messages" | "files" | "presentation" | "workspace" | "members" | "automation" | "groups" | "collection" | "facts" | "feedback";
        purpose: string;
        status: string;
        tools: string[];
    } | {
        requires: ("task.audience-known" | "workspace.directory" | "task.reshare" | "task.private-publish" | "surface.reading-confirmation" | "surface.cover-image" | "action.select-members" | "action.remind-selected-pending" | "surface.form-collection" | "task.audience-select" | "task.lifecycle" | "task.query" | "recipient.query" | "assistant.design" | "mode.packages" | "workflow.records" | "submission.receive" | "submission.file-receive" | "result.private" | "automation.run")[];
        inputs: string[];
        result: string;
        userAction: string;
        boundary: string;
        reason?: string | undefined;
        id: string;
        category: "messages" | "files" | "presentation" | "workspace" | "members" | "automation" | "groups" | "collection" | "facts" | "feedback";
        purpose: string;
        status: string;
        tools: string[];
    })[];
};
