import { Inject, Injectable } from "@nestjs/common";
import type { AuthPrincipal } from "../auth/auth.types.js";
import { ApiException } from "../api/api-exception.js";
import { LOCAL_IMPORT_CONFIG, type LocalImportConfig } from "./local-import.config.js";
import { LocalImportConfirmationService } from "./local-import-confirmation.service.js";
import type { LocalImportCommitRequestDto, LocalImportConfirmationRequestDto } from "./local-import.dto.js";
import { sha256Hex } from "./local-import.hash.js";
import { validateLocalImportPlan } from "./local-import.plan.js";
import { LocalImportRepository } from "./local-import.repository.js";

@Injectable()
export class LocalImportService {
  constructor(
    @Inject(LOCAL_IMPORT_CONFIG) private readonly config: LocalImportConfig,
    private readonly confirmations: LocalImportConfirmationService,
    private readonly repository: LocalImportRepository
  ) {}

  createConfirmation(principal: AuthPrincipal, input: LocalImportConfirmationRequestDto) {
    this.assertEnabled();
    const counts = normalizeCounts(input.counts);
    if (counts.total !== sumLeafCounts(counts)) {
      throw new ApiException(400, "IMPORT_COUNTS_INVALID", "The local import counts are inconsistent");
    }
    if (counts.total > this.config.maxObjects) {
      throw new ApiException(413, "IMPORT_TOO_LARGE", "The local import exceeds the configured object limit");
    }
    const issued = this.confirmations.issue(principal, {
      sourceKind: input.sourceKind,
      sourceVersion: input.sourceVersion,
      payloadHash: input.payloadHash,
      planHash: input.planHash,
      counts
    });
    return {
      confirmationToken: issued.token,
      expiresAt: issued.expiresAt,
      policyVersion: issued.policyVersion,
      binds: {
        sourceKind: input.sourceKind,
        sourceVersion: input.sourceVersion,
        payloadHash: input.payloadHash,
        planHash: input.planHash,
        counts
      },
      dataUploaded: false,
      nextAction: "show_exact_local_preview_then_require_user_confirmation"
    } as const;
  }

  async commit(principal: AuthPrincipal, input: LocalImportCommitRequestDto) {
    this.assertEnabled();
    const plan = input.plan;
    const counts = validateLocalImportPlan(plan, this.config.maxObjects);
    const actualPlanHash = sha256Hex(plan);
    if (actualPlanHash !== input.planHash) {
      throw new ApiException(409, "IMPORT_PLAN_CHANGED", "The import plan changed after preview");
    }

    const token = this.confirmations.verify(principal, input.confirmationToken, {
      sourceKind: input.sourceKind,
      sourceVersion: input.sourceVersion,
      payloadHash: input.payloadHash,
      planHash: actualPlanHash,
      counts
    });

    const result = await this.repository.commit(principal, {
      sourceKind: input.sourceKind,
      sourceVersion: input.sourceVersion,
      payloadHash: input.payloadHash,
      planHash: actualPlanHash,
      idempotencyKey: input.idempotencyKey,
      policyVersion: token.policyVersion,
      plan
    });

    return {
      ...result,
      payloadHash: input.payloadHash,
      planHash: actualPlanHash,
      confirmedAt: new Date().toISOString(),
      policyVersion: token.policyVersion
    };
  }

  private assertEnabled(): void {
    if (!this.config.enabled) {
      throw new ApiException(503, "LOCAL_IMPORT_DISABLED", "Account import is not enabled");
    }
  }
}

function normalizeCounts(input: LocalImportConfirmationRequestDto["counts"]): Record<string, number> {
  return Object.freeze({
    conversations: input.conversations,
    messages: input.messages,
    sourceEvents: input.sourceEvents,
    insights: input.insights,
    conceptLists: input.conceptLists,
    conceptListItems: input.conceptListItems,
    knowledgePaths: input.knowledgePaths,
    knowledgePathSteps: input.knowledgePathSteps,
    articles: input.articles,
    articleReferences: input.articleReferences,
    total: input.total
  });
}

function sumLeafCounts(counts: Record<string, number>): number {
  return Object.entries(counts).reduce((sum, [key, value]) => key === "total" ? sum : sum + value, 0);
}
