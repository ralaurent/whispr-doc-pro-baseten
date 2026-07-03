"use server"

import { getItem, putItem, queryItems } from "@/lib/dynamodb/client"
import {
  TABLE_NAMES,
  generatePk,
  generateDocumentSk,
  generateRevisionSk,
  generateAutosaveSk,
  parseRevisionSk,
  type DocumentStoreItem,
  type DocumentRevisionItem,
  type AutosaveStateItem,
} from "@/lib/dynamodb/schema"
import { createClient } from "@/lib/supabase/server"
import { updateItem } from "@/lib/dynamodb/client"
import { cookies } from "next/headers"
import { GUEST_COOKIE_NAME, GUEST_USER_ID, GUEST_USER_EMAIL } from "@/lib/guest-session"

/**
 * Resolve the current user for DynamoDB operations.
 *
 * Returns the real Supabase user when authenticated, otherwise falls back to a
 * predefined guest user (guest-user-001) when a guest session cookie is
 * present. Returns null when neither is available. The returned object exposes
 * `id` (and `email`), matching how callers use the Supabase user downstream.
 */
async function getAuthedUser(): Promise<{ id: string; email?: string } | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user?.id) return user

  const cookieStore = await cookies()
  if (cookieStore.get(GUEST_COOKIE_NAME)?.value === GUEST_USER_ID) {
    return { id: GUEST_USER_ID, email: GUEST_USER_EMAIL }
  }

  return null
}

/**
 * Update the document’s form fields and increment the version.
 */
export async function updateDocument(
  documentId: string,
  formFields: Array<{
    name: string;
    type: string;
    value?: string;
    originalName?: string;
    aiAssignedName?: string;
  }>,
  organizationId?: string,
  updates?: {
    documentName?: string;
    fileName?: string;
    transcribedText?: string;
    transcriptionModel?: string;
    languageDetected?: string;
    s3Key?: string;
    renamedS3Key?: string;
  }
) {
  const user = await getAuthedUser()
  if (!user?.id) throw new Error("User not authenticated")

  const pk = generatePk(user.id, organizationId)
  const sk = generateDocumentSk(documentId)

  // Build the UpdateExpression dynamically based on what we're changing
  const expressions: string[] = [
    "formFields = :ff",
    "fieldCount = :fc",
    "version = if_not_exists(version, :initial) + :inc",
    "updatedAt = :ts",
    "lastModifiedBy = :uid",
  ]
  const attributeValues: Record<string, any> = {
    ":ff": formFields,
    ":fc": formFields.length,
    ":inc": 1,
    ":ts": Date.now(),
    ":uid": user.id,
    ":initial": 0,
  }

  if (updates?.documentName) {
    expressions.push("documentName = :dn")
    attributeValues[":dn"] = updates.documentName
  }
  if (updates?.fileName) {
    expressions.push("fileName = :fn")
    attributeValues[":fn"] = updates.fileName
  }
  if (updates?.transcribedText) {
    expressions.push("transcribedText = :tt, transcribedAt = :ts")
    attributeValues[":tt"] = updates.transcribedText
  }
  if (updates?.transcriptionModel) {
    expressions.push("transcriptionModel = :tm")
    attributeValues[":tm"] = updates.transcriptionModel
  }
  if (updates?.languageDetected) {
    expressions.push("languageDetected = :ld")
    attributeValues[":ld"] = updates.languageDetected
  }
  if (updates?.s3Key) {
    expressions.push("s3Key = :sk")
    attributeValues[":sk"] = updates.s3Key
  }
  if (updates?.renamedS3Key) {
    expressions.push("renamedS3Key = :rsk")
    attributeValues[":rsk"] = updates.renamedS3Key
  }

  const updateExpression = "SET " + expressions.join(", ")

  await updateItem(
    TABLE_NAMES.DOCUMENTS,
    { pk, sk },
    updateExpression,
    attributeValues
  )
}

/**
 * Save a new document to DynamoDB
 */
export async function saveDocument(
  documentId: string,
  documentName: string,
  fileName: string,
  s3Key: string,
  renamedS3Key: string | null,
  formFields: Array<{
    name: string
    type: string
    value?: string
    originalName?: string
    aiAssignedName?: string
  }>,
  aiNamesFailed: boolean,
  organizationId?: string,
  options?: {
    transcribedText?: string
    transcriptionModel?: string
    languageDetected?: string
    tags?: string[]
  }
) {
  try {
    const user = await getAuthedUser()

    if (!user?.id) throw new Error("User not authenticated")

    const pk = generatePk(user.id, organizationId)
    const sk = generateDocumentSk(documentId)
    const now = Date.now()

    const item: DocumentStoreItem = {
      pk,
      sk,
      documentName,
      fileName,
      s3Key,
      renamedS3Key: renamedS3Key || undefined,
      formFields,
      aiNamesFailed,
      fieldCount: formFields.length,
      version: 1,
      createdAt: now,
      updatedAt: now,
      createdBy: user.id,
      lastModifiedBy: user.id,
      transcribedText: options?.transcribedText,
      transcribedAt: options?.transcribedText ? now : undefined,
      transcriptionModel: options?.transcriptionModel,
      languageDetected: options?.languageDetected,
      tags: options?.tags,
      isArchived: false,
    }

    await putItem(TABLE_NAMES.DOCUMENTS, item)
    return { success: true, documentId }
  } catch (error) {
    console.error("[saveDocument] failed:", error)
    throw error
  }
}

/**
 * Get current document from DynamoDB
 */
export async function getDocument(documentId: string, organizationId?: string) {
  try {
    const user = await getAuthedUser()

    if (!user?.id) throw new Error("User not authenticated")

    const pk = generatePk(user.id, organizationId)
    const sk = generateDocumentSk(documentId)

    const document = await getItem(TABLE_NAMES.DOCUMENTS, { pk, sk })
    return document as DocumentStoreItem | null
  } catch (error) {
    console.error("[getDocument] failed:", error)
    throw error
  }
}

/**
 * Save a new immutable revision
 */
export async function saveRevision(
  documentId: string,
  formFields: Array<{
    name: string
    type: string
    value?: string
    originalName?: string
    aiAssignedName?: string
  }>,
  s3Key: string,
  reason: string = "manual",
  organizationId?: string,
  options?: {
    renamedS3Key?: string
    transcribedText?: string
  }
) {
  try {
    const user = await getAuthedUser()

    if (!user?.id) throw new Error("User not authenticated")

    const pk = generatePk(user.id, organizationId)

    // Get current revision count
    const revisions = await queryItems(
      TABLE_NAMES.REVISIONS,
      "pk = :pk AND begins_with(sk, :docId)",
      { ":pk": pk, ":docId": `${documentId}#` },
    )

    const revisionNumber = revisions.length + 1
    const timestamp = Date.now()
    const sk = generateRevisionSk(documentId, revisionNumber, timestamp)

    const item: DocumentRevisionItem = {
      pk,
      sk,
      revisionNumber,
      timestamp,
      reason,
      changedBy: user.id,
      formFields,
      s3Key,
      renamedS3Key: options?.renamedS3Key,
      transcribedText: options?.transcribedText,
    }

    await putItem(TABLE_NAMES.REVISIONS, item)
    return { success: true, revisionNumber, timestamp }
  } catch (error) {
    console.error("[saveRevision] failed:", error)
    throw error
  }
}

/**
 * Get revision history for a document (sorted newest first).
 * Filters out "restore" entries so only real edits/transcripts appear.
 */
export async function getRevisionHistory(documentId: string, organizationId?: string) {
  try {
    const user = await getAuthedUser()

    if (!user?.id) throw new Error("User not authenticated")

    const pk = generatePk(user.id, organizationId)

    const revisions = await queryItems(
      TABLE_NAMES.REVISIONS,
      "pk = :pk AND begins_with(sk, :docId)",
      { ":pk": pk, ":docId": `${documentId}#` },
    )

    return revisions
      .map((rev: any) => ({
        ...rev,
        parsed: parseRevisionSk(rev.sk),
      }))
      // Filter out restore entries — only keep real edits and transcripts
      .filter((rev: any) => !rev.reason?.startsWith("restore"))
      .sort((a: any, b: any) => b.parsed.timestamp - a.parsed.timestamp)
  } catch (error) {
    console.error("[getRevisionHistory] failed:", error)
    throw error
  }
}

/**
 * Restore a previous revision.
 * Does NOT create a new revision — simply updates the current document
 * state to match the selected revision's data, then returns the
 * restored fields so the client can apply them.
 */
export async function restoreRevision(
  documentId: string,
  revisionNumber: number,
  organizationId?: string,
): Promise<{
  success: boolean;
  formFields: Array<{ name: string; type: string; value?: string }>;
  transcribedText?: string;
}> {
  try {
    const user = await getAuthedUser()

    if (!user?.id) throw new Error("User not authenticated")

    const pk = generatePk(user.id, organizationId)

    const revisions = await queryItems(
      TABLE_NAMES.REVISIONS,
      "pk = :pk AND begins_with(sk, :docId)",
      { ":pk": pk, ":docId": `${documentId}#` },
    )

    const revisionToRestore = revisions.find(
      (rev: any) => parseRevisionSk(rev.sk).revisionNumber === revisionNumber,
    ) as DocumentRevisionItem | undefined

    if (!revisionToRestore) {
      throw new Error(`Revision ${revisionNumber} not found`)
    }

    // Build plain-serializable form fields for both DynamoDB update and client return
    const restoredFields = revisionToRestore.formFields.map(f => ({
      name: f.name,
      type: f.type,
      value: f.value ?? "",
    }))

    // Update the current document to reflect the restored state
    await updateDocument(
      documentId,
      restoredFields,
      organizationId,
      {
        s3Key: revisionToRestore.s3Key,
        renamedS3Key: revisionToRestore.renamedS3Key,
        transcribedText: revisionToRestore.transcribedText,
      }
    )

    // Return plain serializable object (no DynamoDB types)
    return {
      success: true,
      formFields: restoredFields,
      transcribedText: revisionToRestore.transcribedText ?? undefined,
    }
  } catch (error) {
    console.error("[restoreRevision] failed:", error)
    throw error
  }
}

/**
 * Update autosave state for a document
 */
export async function updateAutosaveState(
  documentId: string,
  isDirty: boolean,
  unsavedFormFields?: Array<{ name: string; value?: string }>,
  organizationId?: string,
) {
  try {
    const user = await getAuthedUser()

    if (!user?.id) throw new Error("User not authenticated")

    const pk = generatePk(user.id, organizationId)
    const sk = generateAutosaveSk(documentId)

    const item: AutosaveStateItem = {
      pk,
      sk,
      lastAutosaveTime: Date.now(),
      isDirty,
      unsavedFormFields: unsavedFormFields || [],
    }

    await putItem(TABLE_NAMES.AUTOSAVE, item)
    return { success: true }
  } catch (error) {
    console.error("[updateAutosaveState] failed:", error)
    throw error
  }
}

/**
 * Get autosave state for a document
 */
export async function getAutosaveState(documentId: string, organizationId?: string) {
  try {
    const user = await getAuthedUser()

    if (!user?.id) throw new Error("User not authenticated")

    const pk = generatePk(user.id, organizationId)
    const sk = generateAutosaveSk(documentId)

    const state = await getItem(TABLE_NAMES.AUTOSAVE, { pk, sk })
    return state as AutosaveStateItem | null
  } catch (error) {
    console.error("[getAutosaveState] failed:", error)
    throw error
  }
}
