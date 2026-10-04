export declare function workflowCapabilityContracts(): {
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
        readonly schemas: readonly ["human.form.v1", "human.form.v2"];
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
            readonly sourceSurfaceId: "optional-group-reuse-required-only-for-known-members";
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
            readonly source: "same-session-successful-sourceSurfaceId";
            readonly parameter: "initialRound.sourceParticipantRefs";
            readonly references: "1..20-distinct-observed-source-task-participantRefs";
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
        readonly sources: readonly ["participantRefs", "task-audience"];
        readonly mutuallyExclusive: true;
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
};
