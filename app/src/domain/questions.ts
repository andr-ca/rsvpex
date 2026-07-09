/**
 * Shared custom-question definitions and field-naming convention.
 *
 * Single source of truth for the HTML `name` attribute used by both the
 * form renderer (routes/rsvpForm.ts) and the submit/patch parsers
 * (routes/rsvpSubmit.ts, routes/rsvpPatch.ts). Multi-select fields must use
 * a `[]`-suffixed name for Hono's parseBody() to return an array — see the
 * dietary_kind[] bug in recommendations.md (P0-3) for what happens when the
 * rendered name and the parsed key drift apart.
 *
 * @req GUEST-04 — custom questions per event
 */

export type QuestionType = 'short_text' | 'long_text' | 'boolean' | 'single_select' | 'multi_select'

export type QuestionDef = {
  id: string
  type: QuestionType
  label: string
  required?: boolean
  options?: string[]
}

/** Returns the HTML form field name for a question, honoring the multi_select `[]` convention. */
export function questionFieldName(q: Pick<QuestionDef, 'id' | 'type'>): string {
  return q.type === 'multi_select' ? `answer_${q.id}[]` : `answer_${q.id}`
}

/** Parses the `questions` JSON column into typed QuestionDef[]. Returns [] on invalid/empty input. */
export function parseQuestionDefs(questionsJson: string | null | undefined): QuestionDef[] {
  if (!questionsJson) return []
  try {
    const parsed = JSON.parse(questionsJson)
    return Array.isArray(parsed) ? (parsed as QuestionDef[]) : []
  } catch {
    return []
  }
}
