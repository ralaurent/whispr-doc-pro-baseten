/**
 * DynamoDB Table Schemas and Types for WhisprDoc
 * 
 * Tables:
 * - DocumentStore: Current document state (metadata + form data only)
 * - DocumentRevisions: Immutable version history
 * - AutosaveState: Transient unsaved changes
 * - AuditLog: Full activity trail (demo-winning feature)
 * 
 */

export interface DocumentStoreItem {
  // Partition Key: userId#organizationId
  pk: string;
  // Sort Key: documentId
  sk: string;

  // Metadata
  documentName: string;
  fileName: string;
  s3Key: string;                    // Reference to original PDF in S3
  renamedS3Key?: string;            // After AI renaming/processing

  createdAt: number;
  updatedAt: number;
  createdBy: string;
  lastModifiedBy: string;

  // Form data
  formFields: Array<{
    name: string;
    type: string;
    value?: string;
    originalName?: string;
    aiAssignedName?: string;
  }>;

  // AI & Processing
  aiNamesFailed: boolean;
  fieldCount: number;
  version: number;                  // Current revision number

  // Transcription (only text - lightweight as requested)
  transcribedText?: string;
  transcribedAt?: number;
  transcriptionModel?: string;      // e.g., "whisper-small.en"
  languageDetected?: string;

  // Optional polish
  tags?: string[];
  isArchived?: boolean;
}

// ====================== REVISIONS ======================

export interface DocumentRevisionItem {
  // Partition Key: userId#organizationId
  pk: string;
  // Sort Key: documentId#revision#timestamp
  sk: string;

  revisionNumber: number;
  timestamp: number;
  reason: string;           // "auto", "manual", "ai-transcribe", "restore", etc.
  changedBy: string;

  // Snapshot of form fields
  formFields: Array<{
    name: string;
    type: string;
    value?: string;
  }>;

  // Transcription at this revision
  transcribedText?: string;

  // S3 references at this point in time
  s3Key: string;
  renamedS3Key?: string;
}

// ====================== AUTOSAVE ======================

export interface AutosaveStateItem {
  // Partition Key: userId#organizationId
  pk: string;
  // Sort Key: documentId#autosave_state
  sk: string;

  lastAutosaveTime: number;
  isDirty: boolean;

  unsavedFormFields: Array<{
    name: string;
    value?: string;
  }>;
}

// ====================== AUDIT LOG (Key Feature) ======================

export interface AuditLogItem {
  // Partition Key: userId#organizationId  (or documentId for document-centric queries)
  pk: string;
  // Sort Key: timestamp#actionId (for reverse chronological ordering)
  sk: string;

  documentId: string;
  action: string;                    // e.g. "create_document", "update_form", "ai_fill_fields",
  //      "transcribe_audio", "rename_document", "restore_revision"
  actor: string;                     // userId or "system-ai"
  timestamp: number;
  revisionNumber?: number;

  // Lightweight context for rich activity feed
  details?: Record<string, any>;     // e.g. { fieldsUpdated: ["total", "date"], transcriptionLength: 845 }

  s3Key?: string;                    // File touched (if any)
}

// ====================== TABLE NAMES ======================

export const TABLE_NAMES = {
  DOCUMENTS: process.env.DYNAMODB_DOCUMENTS_TABLE || "whispr-documents",
  REVISIONS: process.env.DYNAMODB_REVISIONS_TABLE || "whispr-document-revisions",
  AUTOSAVE: process.env.DYNAMODB_AUTOSAVE_TABLE || "whispr-autosave-state",
  AUDIT_LOG: process.env.DYNAMODB_AUDIT_LOG_TABLE || "whispr-audit-log",
};

// ====================== KEY HELPERS ======================

export function generatePk(userId: string, organizationId?: string): string {
  return `${userId}#${organizationId || "personal"}`;
}

export function generateDocumentSk(documentId: string): string {
  return documentId;
}

export function generateRevisionSk(
  documentId: string,
  revisionNumber: number,
  timestamp: number
): string {
  return `${documentId}#${String(revisionNumber).padStart(6, "0")}#${timestamp}`;
}

export function generateAutosaveSk(documentId: string): string {
  return `${documentId}#autosave_state`;
}

export function generateAuditLogSk(timestamp: number, actionId: string): string {
  return `${timestamp}#${actionId}`;
}

// ====================== PARSERS ======================

export function parseRevisionSk(sk: string): {
  documentId: string;
  revisionNumber: number;
  timestamp: number;
} {
  const parts = sk.split("#");
  return {
    documentId: parts[0],
    revisionNumber: parseInt(parts[1], 10),
    timestamp: parseInt(parts[2], 10),
  };
}

export function parseAuditLogSk(sk: string): {
  timestamp: number;
  actionId: string;
} {
  const parts = sk.split("#");
  return {
    timestamp: parseInt(parts[0], 10),
    actionId: parts[1],
  };
}